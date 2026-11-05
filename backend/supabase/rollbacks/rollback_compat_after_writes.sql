-- Etapa 1A: data-preserving rollback AFTER orders were taken under the new model.
--
-- Use only if the new backend has to be replaced by the previous version and a
-- fix-forward is not possible. No row is deleted or rewritten:
--
-- - orders.user_id stays nullable and its constraint stays: public orders
--   already created without an operator are kept as they are. The previous
--   backend always writes a user, so it is not affected.
-- - order_stock_movements, order_stock_legacy_reviews and
--   order_stock_ledger_rollout are kept as an audit trail (read-only).
-- - The guards are removed and the legacy stock functions are executable again,
--   so the previous backend can cancel, edit and delete as before.
-- - create_order_with_stock goes back to the base version, so new orders stop
--   writing to the ledger. From this point the ledger is INCOMPLETE: the
--   previous backend returns stock by the current recipe again.
-- - The new functions stay in the catalog but no API role may execute them.
-- - Stock items with recorded movements still cannot be deleted (ON DELETE
--   RESTRICT keeps their history); the previous backend gets an error there.
--
-- Returning to the new model later requires a NEW migration that lists, again,
-- every order not covered by the ledger (at least those created or changed
-- after this rollback). Do not re-run 20261104221000 for that: its transition
-- step only runs once.
--
-- NOT a migration: never place this file in backend/supabase/migrations/.
begin;

set local search_path = public, extensions, pg_catalog;

-- Only for the state "both migrations applied". With only migration
-- 20261104220000 applied, the previous backend already works and
-- rollback_before_writes.sql is the right script.
do $requires$
begin
  if to_regclass('public.order_stock_movements') is null
     or to_regprocedure('public.cancel_order_with_stock(text, text, text)') is null then
    raise exception 'ROLLBACK_NOT_APPLICABLE: migration 20261104221000 is not applied. Use rollback_before_writes.sql.';
  end if;
end;
$requires$;

-- Guards off: the previous backend cancels/edits/deletes with separate calls.
drop trigger if exists trg_guard_order_cancel on public.orders;
drop trigger if exists trg_guard_order_delete on public.orders;
drop trigger if exists trg_guard_order_items on public.order_items;

-- New entry points no longer callable by the API.
revoke all on function public.cancel_order_with_stock(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_order_items_with_stock(text, jsonb, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_order_with_stock(text) from public, anon, authenticated, service_role;

-- Legacy stock functions callable again by the previous backend.
grant execute on function public.consume_order_stock(jsonb) to service_role;
grant execute on function public.restore_order_stock(jsonb) to service_role;

-- Mark the interruption for whoever reads the audit trail.
comment on table public.order_stock_movements is
  'Real stock taken (OUT) and returned (IN) by order flows. Never contains estimates. INCOMPLETE after rollback_compat_after_writes.sql: orders handled by the previous backend are not recorded.';

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

revoke all on function public.create_order_with_stock(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_stock(jsonb, jsonb, jsonb) to service_role;

commit;
