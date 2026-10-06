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
          'id', o.id,
          'type', o.type,
          'orderStatus', o.status,
          'total', o.total,
          'paymentStatus', p.status,
          'paymentMethod', p.method
        )
        order by o.created_at asc
      ),
      '[]'::jsonb
    )
    into pending_orders
    from public.orders o
    left join public.payments p on p.order_id = o.id
    where o.cash_register_session_id = new.id
      and (
        o.status not in ('FINISHED', 'CANCELED')
        or (o.status <> 'CANCELED' and p.id is null)
        or p.status in ('PENDING', 'FAILED')
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

drop trigger if exists trg_block_cash_close_with_pending_orders on public.cash_register_sessions;

create trigger trg_block_cash_close_with_pending_orders
before update of status on public.cash_register_sessions
for each row
execute function public.block_cash_close_with_pending_orders();
