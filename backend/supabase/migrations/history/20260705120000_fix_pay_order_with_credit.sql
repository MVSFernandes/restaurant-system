-- 1. Remove as duas versões ambíguas
drop function if exists public.pay_order_with_credit(text,text,text,text,text,numeric,text);
drop function if exists public.pay_order_with_credit(text,text,text,text,numeric,text,text);

-- 2. Recria a versão canônica única
create or replace function public.pay_order_with_credit(
  p_order_id text,
  p_customer_id text,
  p_credit_tx_id text,
  p_payment_id text,
  p_method text,
  p_amount numeric,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer record;
  v_order record;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_customer from customers where id = p_customer_id for update;
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_customer.credit_used + p_amount > v_customer.credit_limit then
    raise exception 'CREDIT_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  update customers
     set credit_used = credit_used + p_amount,
         updated_at = now()
   where id = p_customer_id;

  insert into credit_transactions
    (id, type, amount, description, customer_id, order_id, status, settled_amount, created_at)
  values
    (p_credit_tx_id, 'CHARGE', p_amount, p_description, p_customer_id, p_order_id, 'OPEN', 0, now());

  insert into payments (id, order_id, method, amount, status, created_at)
  values (p_payment_id, p_order_id, p_method, p_amount, 'PAID', now());

  update orders set status = 'FINISHED', updated_at = now()
  where id = p_order_id;
end;
$$;
