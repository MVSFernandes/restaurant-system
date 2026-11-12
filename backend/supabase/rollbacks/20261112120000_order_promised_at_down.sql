-- Recovery for migration 20261112120000_order_promised_at.sql.
--
-- The migration is additive: the previous application version ignores the new
-- columns and calls create_order_with_stock exactly as before, so keeping the
-- migration is always safe (RELEASES.md §6, case D). Use this script only to
-- return the schema to the state before the migration.
--
-- Order matters for installations that already run the version that reads
-- these columns:
--   1. Deploy the previous application version (it does not read them).
--   2. Run this script.
-- A newer backend running after this script fails to read restaurant_config
-- ("column ... does not exist") until the migration is applied again.
--
-- Data lost: the configured minutes per order type and every orders.promised_at
-- already written. Write the minutes down before running if they should be set
-- again later. Nothing else in restaurant_config or orders changes.
--
-- create_order_with_stock is restored first, with the body of
-- 20261104221000: the new body reads the columns this script drops.
--
-- NOT a migration: never place this file in backend/supabase/migrations/.
begin;

set local search_path = public, extensions, pg_catalog;

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

  insert into public.orders
  select * from jsonb_populate_record(null::public.orders,
    p_order || jsonb_build_object('created_at', now(), 'updated_at', now()))
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

revoke all on function public.create_order_with_stock(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_stock(jsonb, jsonb, jsonb) to service_role;

-- Dropping a column also drops its check constraint; the script can be re-run.
alter table public.orders drop column if exists promised_at;
alter table public.restaurant_config
  drop column if exists dine_in_promise_minutes,
  drop column if exists take_away_promise_minutes,
  drop column if exists delivery_promise_minutes;

commit;
