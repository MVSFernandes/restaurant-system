-- Explicit delivery confirmation, independent of payment.
--
-- 1. orders gets delivered_at (timestamptz, nullable, no default). Existing
--    orders keep NULL: there is no backfill. Status, payments and updated_at
--    do not say when an order was handed over, so no time is inferred.
-- 2. orders gets delivery_tracked (boolean). It is added nullable WITHOUT a
--    default, so every order that already exists stays NULL ("created before
--    delivery was recorded"); only then the column gets DEFAULT true, which
--    applies to inserts from now on. Order of the two statements matters:
--    adding the column with the default directly would write true into the
--    existing rows.
-- 3. create_order_with_stock writes delivery_tracked = true in the order
--    INSERT itself. Its INSERT goes through jsonb_populate_record(null::orders,
--    p_order ...), which yields an explicit NULL for every key missing from
--    p_order, and an explicit NULL is not replaced by the column default. So
--    the default alone would leave every order created through this function
--    (all application channels) with NULL. A delivery_tracked sent in p_order
--    is ignored. The previous application version calls the same function
--    with the same p_order and therefore also creates tracked orders.
-- 4. confirm_order_delivery(p_order_id) records the first explicit
--    confirmation with the database clock, under the order row lock:
--      - NEW, IN_PROGRESS, READY: status becomes DELIVERED and delivered_at is
--        set ("Marcar Entregue"). Payments are not touched, so a pending
--        payment stays pending. Not restricted by delivery_tracked.
--      - FINISHED (closed before being handed over, paid or not): status stays
--        FINISHED and delivered_at is set, only when delivery_tracked is true.
--        A FINISHED order created before this migration (delivery_tracked
--        NULL) is refused (ORDER_DELIVERY_NOT_TRACKED): it may have been
--        handed over long ago, at an unknown time.
--      - FINISHED with delivered_at already set, or DELIVERED: already
--        confirmed. Nothing changes. An order that reached DELIVERED before
--        this migration keeps NULL: the confirmation happened at an unknown
--        time.
--      - CANCELED: refused (ORDER_DELIVERY_CANCELED).
--    Every check reads the row locked FOR UPDATE. A repeated or concurrent
--    confirmation waits for the lock and then finds delivered_at already set,
--    so the first time is kept. A no-op does not update the row (updated_at
--    stays as it was).
--    Payment (processPayment, pay_order_with_credit) and close_table_tab are
--    not changed: they never write delivered_at.
--
-- Class M1 (RELEASES.md §2):
--   - new nullable columns; the previous application version ignores them (it
--     reads orders with select * and never writes them);
--   - new function confirm_order_delivery, not called by the previous version;
--   - create_order_with_stock keeps its signature, return type, owner and
--     EXECUTE grants; the previous version calls it with the same p_order and
--     gets the same result, plus delivery_tracked = true in the new column.
--
-- Re-running the file is harmless: the columns are not re-added, so existing
-- orders are not marked tracked by a second run. Recovery:
-- backend/supabase/rollbacks/20261112150000_order_delivered_at_down.sql
begin;

set local search_path = public, extensions, pg_catalog;

alter table public.orders
  add column if not exists delivered_at timestamptz;

comment on column public.orders.delivered_at is
  'First explicit delivery confirmation (database clock). NULL = not confirmed, or confirmed before this column existed.';

-- Without a default first: rows that exist now stay NULL.
alter table public.orders
  add column if not exists delivery_tracked boolean;

-- Then the default, for inserts from now on.
alter table public.orders
  alter column delivery_tracked set default true;

comment on column public.orders.delivery_tracked is
  'true = created after delivery confirmation existed (create_order_with_stock writes it). NULL = order older than 20261112150000.';

-- Same body as 20261112120000, except for the delivery_tracked key added to
-- the INSERT.
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
    p_order || jsonb_build_object('created_at', now(), 'updated_at', now(), 'promised_at', v_promised_at,
                                  'delivery_tracked', true))
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

create or replace function public.confirm_order_delivery(p_order_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_order.status = 'CANCELED' then
    raise exception 'ORDER_DELIVERY_CANCELED' using errcode = 'P0001';
  end if;

  if v_order.status = 'DELIVERED'
     or (v_order.status = 'FINISHED' and v_order.delivered_at is not null) then
    return jsonb_build_object('order', to_jsonb(v_order), 'already_delivered', true);
  end if;

  -- Closed without a confirmation: eligible only if created after delivery
  -- tracking existed. Checked here, on the locked row.
  if v_order.status = 'FINISHED' and v_order.delivery_tracked is not true then
    raise exception 'ORDER_DELIVERY_NOT_TRACKED' using errcode = 'P0001';
  end if;

  update public.orders
  set status = case when status = 'FINISHED' then status else 'DELIVERED' end,
      delivered_at = coalesce(delivered_at, now())
  where id = p_order_id
  returning * into v_order;

  return jsonb_build_object('order', to_jsonb(v_order), 'already_delivered', false);
end;
$function$;

revoke all on function public.confirm_order_delivery(text) from public, anon, authenticated;
grant execute on function public.confirm_order_delivery(text) to service_role;

commit;
