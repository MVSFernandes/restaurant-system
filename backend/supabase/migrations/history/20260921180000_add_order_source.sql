alter table public.orders
  add column if not exists source text;

update public.orders
set source = case
  when waiter_id is not null then 'WAITER'
  else 'PDV'
end
where source is null
   or source not in ('PDV', 'PUBLIC_MENU', 'WAITER');

alter table public.orders
  alter column source set default 'PDV',
  alter column source set not null;

alter table public.orders
  drop constraint if exists orders_source_check;

alter table public.orders
  add constraint orders_source_check
  check (source in ('PDV', 'PUBLIC_MENU', 'WAITER'));

comment on column public.orders.source is
  'Order entry point: PDV, PUBLIC_MENU or WAITER.';
