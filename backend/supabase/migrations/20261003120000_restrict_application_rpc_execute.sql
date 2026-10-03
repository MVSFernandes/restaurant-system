begin;

revoke all on function public.add_credit_charge(text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.add_credit_charge(text, text, numeric, text)
  to service_role;

revoke all on function public.block_cash_close_with_pending_orders()
  from public, anon, authenticated;
grant execute on function public.block_cash_close_with_pending_orders()
  to service_role;

revoke all on function public.cancel_pending_payments_with_order()
  from public, anon, authenticated;
grant execute on function public.cancel_pending_payments_with_order()
  to service_role;

revoke all on function public.close_empty_implicit_table_tab_after_order_delete()
  from public, anon, authenticated;
grant execute on function public.close_empty_implicit_table_tab_after_order_delete()
  to service_role;

revoke all on function public.close_settled_table_tab_after_order()
  from public, anon, authenticated;
grant execute on function public.close_settled_table_tab_after_order()
  to service_role;

revoke all on function public.close_table_tab(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.close_table_tab(text, text, text, text)
  to service_role;

revoke all on function public.consume_order_stock(jsonb)
  from public, anon, authenticated;
grant execute on function public.consume_order_stock(jsonb)
  to service_role;

revoke all on function public.create_order_with_stock(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_order_with_stock(jsonb, jsonb, jsonb)
  to service_role;

revoke all on function public.finance_report(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.finance_report(timestamptz, timestamptz)
  to service_role;

revoke all on function public.open_table_tab(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.open_table_tab(text, text, text, text, text)
  to service_role;

revoke all on function public.pay_customer_credit(text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.pay_customer_credit(text, text, numeric, text)
  to service_role;

revoke all on function public.pay_order_with_credit(text, text, text, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.pay_order_with_credit(text, text, text, text, text, numeric, text)
  to service_role;

revoke all on function public.prevent_table_release_with_open_tabs()
  from public, anon, authenticated;
grant execute on function public.prevent_table_release_with_open_tabs()
  to service_role;

revoke all on function public.release_table_after_last_tab()
  from public, anon, authenticated;
grant execute on function public.release_table_after_last_tab()
  to service_role;

revoke all on function public.replace_product_stock_links(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_product_stock_links(text, jsonb)
  to service_role;

revoke all on function public.require_open_tab_for_occupied_table()
  from public, anon, authenticated;
grant execute on function public.require_open_tab_for_occupied_table()
  to service_role;

revoke all on function public.restore_order_stock(jsonb)
  from public, anon, authenticated;
grant execute on function public.restore_order_stock(jsonb)
  to service_role;

revoke all on function public.set_updated_at()
  from public, anon, authenticated;
grant execute on function public.set_updated_at()
  to service_role;

revoke all on function public.validate_order_table_tab()
  from public, anon, authenticated;
grant execute on function public.validate_order_table_tab()
  to service_role;

revoke all on function public.validate_table_tab_close()
  from public, anon, authenticated;
grant execute on function public.validate_table_tab_close()
  to service_role;

revoke all on function public.validate_table_tab_parent()
  from public, anon, authenticated;
grant execute on function public.validate_table_tab_parent()
  to service_role;

commit;

with application_functions(signature) as (
  values
    ('public.add_credit_charge(text, text, numeric, text)'::regprocedure),
    ('public.block_cash_close_with_pending_orders()'::regprocedure),
    ('public.cancel_pending_payments_with_order()'::regprocedure),
    ('public.close_empty_implicit_table_tab_after_order_delete()'::regprocedure),
    ('public.close_settled_table_tab_after_order()'::regprocedure),
    ('public.close_table_tab(text, text, text, text)'::regprocedure),
    ('public.consume_order_stock(jsonb)'::regprocedure),
    ('public.create_order_with_stock(jsonb, jsonb, jsonb)'::regprocedure),
    ('public.finance_report(timestamptz, timestamptz)'::regprocedure),
    ('public.open_table_tab(text, text, text, text, text)'::regprocedure),
    ('public.pay_customer_credit(text, text, numeric, text)'::regprocedure),
    ('public.pay_order_with_credit(text, text, text, text, text, numeric, text)'::regprocedure),
    ('public.prevent_table_release_with_open_tabs()'::regprocedure),
    ('public.release_table_after_last_tab()'::regprocedure),
    ('public.replace_product_stock_links(text, jsonb)'::regprocedure),
    ('public.require_open_tab_for_occupied_table()'::regprocedure),
    ('public.restore_order_stock(jsonb)'::regprocedure),
    ('public.set_updated_at()'::regprocedure),
    ('public.validate_order_table_tab()'::regprocedure),
    ('public.validate_table_tab_close()'::regprocedure),
    ('public.validate_table_tab_parent()'::regprocedure)
)
select
  signature::text as function_signature,
  has_function_privilege('anon', signature, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', signature, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', signature, 'EXECUTE') as service_role_can_execute
from application_functions
order by function_signature;
