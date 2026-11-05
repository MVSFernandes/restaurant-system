-- Public menu orders are placed by the customer, not by a staff member.
--
-- Until now the backend stored them under "the" ADMIN user, found with a
-- query that fails when there are zero or several administrators, and that
-- attributed to a person an action they did not perform.
--
-- From this migration on, orders.user_id may be null only for orders whose
-- source is PUBLIC_MENU. Staff orders (PDV, WAITER) still require a user.
-- Existing rows are not rewritten: every current order already has a user.
begin;

alter table public.orders alter column user_id drop not null;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_user_required_for_staff_sources'
  ) then
    alter table public.orders
      add constraint orders_user_required_for_staff_sources
      check (user_id is not null or source = 'PUBLIC_MENU');
  end if;
end;
$constraint$;

comment on column public.orders.user_id is
  'Staff member who registered the order. Null only for PUBLIC_MENU orders, which have no operator.';

commit;
