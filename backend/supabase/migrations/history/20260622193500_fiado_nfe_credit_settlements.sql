create extension if not exists pgcrypto;

alter table public.credit_transactions
  add column if not exists order_id text references public.orders(id),
  add column if not exists status text not null default 'OPEN',
  add column if not exists settled_amount numeric not null default 0,
  add column if not exists settled_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'credit_transactions_status_check'
      and conrelid = 'public.credit_transactions'::regclass
  ) then
    alter table public.credit_transactions
      add constraint credit_transactions_status_check
      check (status in ('OPEN', 'PARTIAL', 'PAID'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'credit_transactions_settled_amount_check'
      and conrelid = 'public.credit_transactions'::regclass
  ) then
    alter table public.credit_transactions
      add constraint credit_transactions_settled_amount_check
      check (settled_amount >= 0);
  end if;
end $$;

create table if not exists public.credit_settlements (
  id text not null,
  charge_id text not null references public.credit_transactions(id),
  payment_id text not null references public.credit_transactions(id),
  amount numeric not null check (amount > 0::numeric),
  created_at timestamp with time zone not null default now(),
  constraint credit_settlements_pkey primary key (id)
);

create index if not exists credit_transactions_customer_status_created_idx
  on public.credit_transactions(customer_id, status, created_at)
  where type = 'CHARGE';

create index if not exists credit_transactions_order_id_idx
  on public.credit_transactions(order_id);

create index if not exists credit_settlements_charge_id_idx
  on public.credit_settlements(charge_id);

create index if not exists credit_settlements_payment_id_idx
  on public.credit_settlements(payment_id);

alter table public.customers
  add column if not exists person_type text not null default 'PF',
  add column if not exists document text,
  add column if not exists legal_name text,
  add column if not exists state_registration text,
  add column if not exists fiscal_zip_code text,
  add column if not exists fiscal_street text,
  add column if not exists fiscal_number text,
  add column if not exists fiscal_neighborhood text,
  add column if not exists fiscal_city text,
  add column if not exists fiscal_city_ibge_code text,
  add column if not exists fiscal_state text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_person_type_check'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_person_type_check
      check (person_type in ('PF', 'PJ'));
  end if;
end $$;

create table if not exists public.invoices (
  id text not null,
  customer_id text not null references public.customers(id),
  order_id text references public.orders(id),
  credit_transaction_id text references public.credit_transactions(id),
  focus_ref text not null unique,
  environment text not null default 'homologation',
  status text not null default 'pending',
  sefaz_status text,
  sefaz_message text,
  access_key text,
  number text,
  series text,
  danfe_url text,
  xml_url text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint invoices_pkey primary key (id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_environment_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_environment_check
      check (environment in ('homologation', 'production'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_status_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_status_check
      check (status in ('pending', 'processing', 'authorized', 'error', 'canceled'));
  end if;
end $$;

create index if not exists invoices_customer_id_idx
  on public.invoices(customer_id);

create index if not exists invoices_credit_transaction_id_idx
  on public.invoices(credit_transaction_id);

alter table public.restaurant_config
  add column if not exists cnpj text,
  add column if not exists legal_name text,
  add column if not exists state_registration text,
  add column if not exists tax_regime text,
  add column if not exists fiscal_city_ibge_code text,
  add column if not exists fiscal_zip_code text,
  add column if not exists fiscal_street text,
  add column if not exists fiscal_number text,
  add column if not exists fiscal_neighborhood text,
  add column if not exists fiscal_city text,
  add column if not exists fiscal_state text,
  add column if not exists default_cfop text,
  add column if not exists default_ncm text,
  add column if not exists default_origin text,
  add column if not exists default_tax_code text;

alter table public.products
  add column if not exists ncm text,
  add column if not exists cfop text,
  add column if not exists origin text,
  add column if not exists tax_code text;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row
execute function public.set_updated_at();

update public.credit_transactions
set status = 'OPEN',
    settled_amount = 0
where type = 'CHARGE'
  and (status is null or settled_amount is null);

update public.credit_transactions
set status = 'PAID',
    settled_amount = amount,
    settled_at = coalesce(settled_at, created_at)
where type = 'PAYMENT';

create or replace function public.add_credit_charge(
  p_credit_tx_id text,
  p_customer_id text,
  p_amount numeric,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_tx public.credit_transactions%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = 'P0001';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  if v_customer.credit_limit > 0
     and coalesce(v_customer.credit_used, 0) + p_amount > v_customer.credit_limit then
    raise exception 'Credit limit exceeded' using errcode = 'P0001';
  end if;

  update public.customers
  set credit_used = coalesce(credit_used, 0) + p_amount,
      updated_at = now()
  where id = p_customer_id;

  insert into public.credit_transactions (
    id,
    customer_id,
    type,
    amount,
    description,
    status,
    settled_amount
  )
  values (
    p_credit_tx_id,
    p_customer_id,
    'CHARGE',
    p_amount,
    p_description,
    'OPEN',
    0
  )
  returning * into v_tx;

  return to_jsonb(v_tx);
end;
$$;

create or replace function public.pay_customer_credit(
  p_credit_tx_id text,
  p_customer_id text,
  p_amount numeric,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_payment public.credit_transactions%rowtype;
  v_charge public.credit_transactions%rowtype;
  v_remaining numeric;
  v_effective_amount numeric;
  v_open_amount numeric;
  v_alloc numeric;
  v_new_settled_amount numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = 'P0001';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  v_effective_amount := least(p_amount, greatest(coalesce(v_customer.credit_used, 0), 0));

  if v_effective_amount <= 0 then
    raise exception 'Customer has no open credit balance' using errcode = 'P0001';
  end if;

  insert into public.credit_transactions (
    id,
    customer_id,
    type,
    amount,
    description,
    status,
    settled_amount,
    settled_at
  )
  values (
    p_credit_tx_id,
    p_customer_id,
    'PAYMENT',
    v_effective_amount,
    p_description,
    'PAID',
    v_effective_amount,
    now()
  )
  returning * into v_payment;

  v_remaining := v_effective_amount;

  for v_charge in
    select *
    from public.credit_transactions
    where customer_id = p_customer_id
      and type = 'CHARGE'
      and status in ('OPEN', 'PARTIAL')
    order by created_at asc, id asc
    for update
  loop
    v_open_amount := greatest(v_charge.amount - coalesce(v_charge.settled_amount, 0), 0);
    v_alloc := least(v_remaining, v_open_amount);

    if v_alloc > 0 then
      insert into public.credit_settlements (id, charge_id, payment_id, amount)
      values ('cset_' || replace(gen_random_uuid()::text, '-', ''), v_charge.id, v_payment.id, v_alloc);

      v_new_settled_amount := coalesce(v_charge.settled_amount, 0) + v_alloc;

      update public.credit_transactions
      set settled_amount = v_new_settled_amount,
          status = case
            when v_new_settled_amount >= amount then 'PAID'
            else 'PARTIAL'
          end,
          settled_at = case
            when v_new_settled_amount >= amount then now()
            else null
          end
      where id = v_charge.id;

      v_remaining := v_remaining - v_alloc;
    end if;

    exit when v_remaining <= 0;
  end loop;

  update public.customers
  set credit_used = greatest(0, coalesce(credit_used, 0) - v_effective_amount),
      updated_at = now()
  where id = p_customer_id;

  return to_jsonb(v_payment);
end;
$$;

create or replace function public.pay_order_with_credit(
  p_order_id text,
  p_customer_id text,
  p_credit_tx_id text,
  p_payment_id text,
  p_method text,
  p_amount numeric,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_order public.orders%rowtype;
  v_tx public.credit_transactions%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = 'P0001';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  if v_customer.credit_limit > 0
     and coalesce(v_customer.credit_used, 0) + p_amount > v_customer.credit_limit then
    raise exception 'Credit limit exceeded' using errcode = 'P0001';
  end if;

  update public.customers
  set credit_used = coalesce(credit_used, 0) + p_amount,
      updated_at = now()
  where id = p_customer_id;

  update public.orders
  set customer_id = p_customer_id,
      status = 'FINISHED',
      updated_at = now()
  where id = p_order_id;

  insert into public.credit_transactions (
    id,
    customer_id,
    order_id,
    type,
    amount,
    description,
    status,
    settled_amount
  )
  values (
    p_credit_tx_id,
    p_customer_id,
    p_order_id,
    'CHARGE',
    p_amount,
    coalesce(p_description, 'Pedido no fiado'),
    'OPEN',
    0
  )
  returning * into v_tx;

  insert into public.payments (
    id,
    order_id,
    method,
    amount,
    status,
    transaction_id
  )
  values (
    p_payment_id,
    p_order_id,
    p_method,
    p_amount,
    'PAID',
    p_credit_tx_id
  )
  on conflict (order_id) do update
  set method = excluded.method,
      amount = excluded.amount,
      status = excluded.status,
      transaction_id = excluded.transaction_id;

  return jsonb_build_object(
    'transaction_id', p_credit_tx_id,
    'payment_id', p_payment_id,
    'credit_transaction', to_jsonb(v_tx)
  );
end;
$$;
