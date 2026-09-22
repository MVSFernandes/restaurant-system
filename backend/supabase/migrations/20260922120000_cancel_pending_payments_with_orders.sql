alter table public.payments
  drop constraint if exists payments_status_check;

alter table public.payments
  add constraint payments_status_check
  check (status in ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED'));

update public.payments as payment
set status = 'CANCELED'
from public.orders as orders
where payment.order_id = orders.id
  and orders.status = 'CANCELED'
  and payment.status = 'PENDING';

create or replace function public.cancel_pending_payments_with_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payments
  set status = 'CANCELED'
  where order_id = new.id
    and status = 'PENDING';

  return new;
end;
$$;

drop trigger if exists trg_cancel_pending_payments_with_order on public.orders;

create trigger trg_cancel_pending_payments_with_order
after update of status on public.orders
for each row
when (
  new.status = 'CANCELED'
  and old.status is distinct from 'CANCELED'
)
execute function public.cancel_pending_payments_with_order();

create or replace function public.block_cash_close_with_pending_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_orders jsonb;
begin
  if old.status is distinct from 'CLOSED' and new.status = 'CLOSED' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', orders.id,
          'type', orders.type,
          'orderStatus', orders.status,
          'total', orders.total,
          'paymentStatus', payment.status,
          'paymentMethod', payment.method
        )
        order by orders.created_at asc
      ),
      '[]'::jsonb
    )
    into pending_orders
    from public.orders as orders
    left join public.payments as payment on payment.order_id = orders.id
    where orders.cash_register_session_id = new.id
      and orders.status <> 'CANCELED'
      and (
        orders.status <> 'FINISHED'
        or payment.id is null
        or payment.status in ('PENDING', 'FAILED')
      );

    if jsonb_array_length(pending_orders) > 0 then
      raise exception 'CASH_REGISTER_PENDING_ORDERS'
        using
          errcode = 'P0001',
          detail = pending_orders::text;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_cash_close_with_pending_orders
  on public.cash_register_sessions;

create trigger trg_block_cash_close_with_pending_orders
before update of status on public.cash_register_sessions
for each row
execute function public.block_cash_close_with_pending_orders();
