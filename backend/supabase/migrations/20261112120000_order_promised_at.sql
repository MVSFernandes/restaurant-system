-- Order promise deadline, first batch.
--
-- 1. restaurant_config gets one optional "promise minutes" column per order
--    type that exists in the application (DINE_IN, TAKE_AWAY, DELIVERY).
--    NULL means "no deadline for this type", which is the default for every
--    type: nothing changes until an ADMIN sets minutes in Settings.
-- 2. orders gets promised_at (timestamptz, nullable). Existing orders keep
--    NULL: there is no retroactive backfill.
-- 3. create_order_with_stock writes promised_at in the order INSERT itself,
--    from the database clock (the same now() that sets created_at) plus the
--    minutes configured for that order's type at that moment. A promised_at
--    sent in p_order is always ignored. Changing the configuration later only
--    affects orders created afterwards.
--
-- Class M1 (RELEASES.md §2):
--   - new nullable columns without a default; the previous application
--     version lists restaurant_config columns explicitly, so it neither reads
--     nor overwrites them, and it ignores orders.promised_at;
--   - create_order_with_stock keeps its signature, return type, owner and
--     EXECUTE grants. The previous version calls it with the same p_order and
--     gets the same result; while the new columns stay NULL (the default),
--     promised_at is NULL, exactly as before.
--
-- The checks only accept positive integers or NULL. The backend validates the
-- same rule before saving (src/utils/orderPromise.ts).
--
-- Re-running the file is harmless. Recovery:
-- backend/supabase/rollbacks/20261112120000_order_promised_at_down.sql
begin;

set local search_path = public, extensions, pg_catalog;

alter table public.restaurant_config
  add column if not exists dine_in_promise_minutes integer,
  add column if not exists take_away_promise_minutes integer,
  add column if not exists delivery_promise_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_config_dine_in_promise_minutes_check'
      and conrelid = 'public.restaurant_config'::regclass
  ) then
    alter table public.restaurant_config
      add constraint restaurant_config_dine_in_promise_minutes_check
      check (dine_in_promise_minutes is null or dine_in_promise_minutes > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_config_take_away_promise_minutes_check'
      and conrelid = 'public.restaurant_config'::regclass
  ) then
    alter table public.restaurant_config
      add constraint restaurant_config_take_away_promise_minutes_check
      check (take_away_promise_minutes is null or take_away_promise_minutes > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_config_delivery_promise_minutes_check'
      and conrelid = 'public.restaurant_config'::regclass
  ) then
    alter table public.restaurant_config
      add constraint restaurant_config_delivery_promise_minutes_check
      check (delivery_promise_minutes is null or delivery_promise_minutes > 0);
  end if;
end;
$$;

comment on column public.restaurant_config.dine_in_promise_minutes is
  'Minutes promised for DINE_IN orders, counted from creation. NULL = no deadline.';
comment on column public.restaurant_config.take_away_promise_minutes is
  'Minutes promised for TAKE_AWAY orders, counted from creation. NULL = no deadline.';
comment on column public.restaurant_config.delivery_promise_minutes is
  'Minutes promised for DELIVERY orders, counted from creation. NULL = no deadline.';

alter table public.orders
  add column if not exists promised_at timestamptz;

comment on column public.orders.promised_at is
  'Deadline fixed at creation: created_at + the minutes configured for the order type at that moment. NULL = no deadline (type not configured, or order created before 20261112120000).';

-- Same body as 20261104221000, except for v_promise_minutes / v_promised_at
-- and the promised_at key added to the INSERT.
create or replace function public.create_order_with_stock(p_order jsonb, p_items jsonb, p_payment jsonb default null::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_stock record;
  v_paused_product_name text;
  v_promise_minutes integer;
  v_promised_at timestamptz;
begin
  if nullif(p_order->>'id', '') is null then
    raise exception 'Identificador do pedido obrigatório';
  end if;
  -- Scoped key is stored independently from the human-facing CUID.
  perform pg_advisory_xact_lock(hashtextextended(coalesce(nullif(p_order->>'idempotency_key', ''), p_order->>'id'), 0));
  if nullif(p_order->>'idempotency_key', '') is not null then
    select * into v_order from public.orders where idempotency_key = p_order->>'idempotency_key';
    if found then return to_jsonb(v_order); end if;
  end if;
  select * into v_order from public.orders where id = p_order->>'id';
  if found then return to_jsonb(v_order); end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Adicione itens ao pedido';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione itens ao pedido';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) i
    where coalesce((i->>'quantity')::numeric, 0) <= 0
       or ((i->>'weight') is not null and (i->>'weight')::numeric <= 0)
       or i->>'order_id' is distinct from p_order->>'id'
  ) then
    raise exception 'Itens ou quantidades inválidos';
  end if;

  -- Serialize pause changes with order creation for every referenced product.
  perform 1
  from public.products as product
  where product.id in (
    select item->>'product_id' from jsonb_array_elements(p_items) as item
  )
  order by product.id
  for update;

  select product.name
  into v_paused_product_name
  from public.products as product
  where product.is_paused
    and product.id in (
      select item->>'product_id' from jsonb_array_elements(p_items) as item
    )
  order by product.name
  limit 1;

  if found then
    raise exception 'O produto "%" está pausado.', v_paused_product_name
      using errcode = 'P0001';
  end if;

  -- Lock shared ingredients in a consistent order before checking/consuming.
  -- Keep the existing stock RPC's weight/unit conversion rules.
  for v_stock in
    select s.id, s.name, s.quantity from public.stock_items s
    where s.id in (
      select l.stock_item_id from public.product_stock_items l
      join jsonb_array_elements(p_items) i on l.product_id = i->>'product_id'
    )
    order by s.id for update
  loop
    if exists (
      select 1 from public.product_stock_items l
      join jsonb_array_elements(p_items) i on l.product_id = i->>'product_id'
      where l.stock_item_id = v_stock.id and l.quantity > v_stock.quantity
    ) then
      raise exception 'Estoque insuficiente de "%"', v_stock.name;
    end if;
  end loop;

  -- Deadline: minutes configured now for this order's type (singleton
  -- restaurant_config). No row, unknown type or NULL minutes = no deadline.
  select case p_order->>'type'
           when 'DINE_IN' then config.dine_in_promise_minutes
           when 'TAKE_AWAY' then config.take_away_promise_minutes
           when 'DELIVERY' then config.delivery_promise_minutes
         end
  into v_promise_minutes
  from public.restaurant_config as config;

  v_promised_at := case
    when v_promise_minutes is null then null
    else now() + make_interval(mins => v_promise_minutes)
  end;

  insert into public.orders
  select * from jsonb_populate_record(null::public.orders,
    p_order || jsonb_build_object('created_at', now(), 'updated_at', now(), 'promised_at', v_promised_at))
  returning * into v_order;

  perform set_config('app.order_stock_operation', 'create', true);
  insert into public.order_items
  select * from jsonb_populate_recordset(null::public.order_items, p_items);
  perform set_config('app.order_stock_operation', '', true);

  perform public.consume_stock_for_order(v_order.id, p_items, 'ORDER_CREATED');

  if v_order.type = 'DINE_IN' and v_order.table_id is not null then
    update public.tables set status = 'OCCUPIED' where id = v_order.table_id;
  end if;

  if p_payment is not null and p_payment <> 'null'::jsonb then
    if p_payment->>'order_id' is distinct from v_order.id then
      raise exception 'Pagamento não pertence ao pedido';
    end if;
    insert into public.payments
    select * from jsonb_populate_record(null::public.payments,
      p_payment || jsonb_build_object('created_at', now()));
  end if;
  return to_jsonb(v_order);
end;
$function$;

-- Unchanged grants, restated explicitly.
revoke all on function public.create_order_with_stock(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_stock(jsonb, jsonb, jsonb) to service_role;

commit;
