-- Etapa 1A: full rollback, ONLY while writes are still suspended.
--
-- Use when the two Etapa 1A migrations were applied but the new backend
-- failed before the restaurant resumed taking orders. It returns the schema to
-- the canonical base (backend/supabase/checks/verify_database_inventory.sql
-- must report matches = true for every category afterwards).
--
-- It refuses to run if anything was written under the new model:
-- ledger movements, resolved/flagged legacy reviews, or orders without an
-- operator. In that case use rollback_compat_after_writes.sql instead, which
-- keeps every row.
--
-- NOT a migration: never place this file in backend/supabase/migrations/.
begin;

set local search_path = public, extensions, pg_catalog;

-- Works whether migration 2 was applied or not: the new tables are only
-- queried (dynamically) after checking that they exist.
do $guard$
declare
  v_used boolean;
begin
  if to_regclass('public.order_stock_movements') is not null then
    execute 'select exists (select 1 from public.order_stock_movements)' into v_used;
    if v_used then
      raise exception 'ROLLBACK_REFUSED: order_stock_movements has rows; writes already happened. Use rollback_compat_after_writes.sql.';
    end if;
  end if;
  if to_regclass('public.order_stock_legacy_reviews') is not null then
    execute 'select exists (select 1 from public.order_stock_legacy_reviews
              where resolution <> ''PENDING'' or order_event is not null)' into v_used;
    if v_used then
      raise exception 'ROLLBACK_REFUSED: legacy reviews were used. Use rollback_compat_after_writes.sql.';
    end if;
  end if;
  if exists (select 1 from public.orders where user_id is null) then
    raise exception 'ROLLBACK_REFUSED: there are orders without operator. Use rollback_compat_after_writes.sql.';
  end if;
end;
$guard$;

-- Guards
drop trigger if exists trg_guard_order_cancel on public.orders;
drop trigger if exists trg_guard_order_delete on public.orders;
drop trigger if exists trg_guard_order_items on public.order_items;
drop function if exists public.guard_order_stock_operation();

-- New functions
drop function if exists public.cancel_order_with_stock(text, text, text);
drop function if exists public.update_order_items_with_stock(text, jsonb, jsonb, text);
drop function if exists public.delete_order_with_stock(text);
drop function if exists public.resolve_legacy_order_stock(text, text, text, text, jsonb);
drop function if exists public.consume_stock_for_order(text, jsonb, text);
drop function if exists public.restore_stock_for_order(text, text);
drop function if exists public.order_has_pending_legacy_stock_review(text);
drop function if exists public.order_is_legacy_stock_order(text);

-- New tables (empty or only PENDING listings, checked above)
drop table if exists public.order_stock_movements;
drop table if exists public.order_stock_legacy_reviews;
drop table if exists public.order_stock_ledger_rollout;

-- Migration 20261104220000
alter table public.orders drop constraint if exists orders_user_required_for_staff_sources;
comment on column public.orders.user_id is null;
alter table public.orders alter column user_id set not null;

-- Base version of create_order_with_stock (copied from 20261003131000_base_functions.sql)
CREATE OR REPLACE FUNCTION public.create_order_with_stock(p_order jsonb, p_items jsonb, p_payment jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  perform public.consume_order_stock(p_items);

  insert into public.orders
  select * from jsonb_populate_record(null::public.orders,
    p_order || jsonb_build_object('created_at', now(), 'updated_at', now()))
  returning * into v_order;

  insert into public.order_items
  select * from jsonb_populate_recordset(null::public.order_items, p_items);

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

-- Base execute grants
revoke all on function public.create_order_with_stock(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_stock(jsonb, jsonb, jsonb) to service_role;
revoke all on function public.consume_order_stock(jsonb) from public, anon, authenticated;
grant execute on function public.consume_order_stock(jsonb) to service_role;
revoke all on function public.restore_order_stock(jsonb) from public, anon, authenticated;
grant execute on function public.restore_order_stock(jsonb) to service_role;

commit;
