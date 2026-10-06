-- Canonical database base captured from the live Supabase catalog.
-- Platform-managed extensions (pg_stat_statements, supabase_vault, uuid-ossp
-- and plpgsql) are intentionally not created here.
begin;

create schema if not exists extensions;

create extension if not exists pg_trgm with schema public;
create extension if not exists pgcrypto with schema extensions;

do $extensions$
declare
  v_schema text;
begin
  select namespace.nspname into v_schema
  from pg_extension as extension
  join pg_namespace as namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'pg_trgm';

  if v_schema is distinct from 'public' then
    alter extension pg_trgm set schema public;
  end if;

  select namespace.nspname into v_schema
  from pg_extension as extension
  join pg_namespace as namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'pgcrypto';

  if v_schema is distinct from 'extensions' then
    alter extension pgcrypto set schema extensions;
  end if;
end;
$extensions$;

set local search_path = public, extensions, pg_catalog;

-- Tables and columns. Constraints are added after every table exists.
create table if not exists public.audit_logs (
  id text not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  details text,
  created_at timestamp with time zone not null default now(),
  user_id text not null
);

create table if not exists public.cash_register_sessions (
  id text not null,
  status text not null default 'OPEN'::text,
  opening_amount numeric(12,2) not null,
  closing_amount numeric(12,2),
  withdrawal_total numeric(12,2) not null default 0,
  notes text,
  opened_at timestamp with time zone not null default now(),
  closed_at timestamp with time zone,
  opened_by_id text not null,
  closed_by_id text
);

create table if not exists public.cash_withdrawals (
  id text not null,
  amount numeric(12,2) not null,
  reason text not null,
  created_at timestamp with time zone not null default now(),
  session_id text not null,
  created_by_id text not null
);

create table if not exists public.categories (
  id text not null,
  name text not null,
  is_meal_category boolean not null default false,
  price_per_kg numeric(12,2),
  self_service_price_per_kg numeric(12,2)
);

create table if not exists public.credit_settlements (
  id text not null,
  charge_id text not null,
  payment_id text not null,
  amount numeric not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.credit_transactions (
  id text not null,
  type text not null,
  amount numeric(12,2) not null,
  description text,
  created_at timestamp with time zone not null default now(),
  customer_id text not null,
  order_id text,
  status text not null default 'OPEN'::text,
  settled_amount numeric not null default 0,
  settled_at timestamp with time zone
);

create table if not exists public.customers (
  id text not null,
  name text not null,
  phone text,
  email text,
  address text,
  credit_limit numeric(12,2) not null default 0,
  credit_used numeric(12,2) not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  person_type text not null default 'PF'::text,
  document text,
  legal_name text,
  state_registration text,
  fiscal_zip_code text,
  fiscal_street text,
  fiscal_number text,
  fiscal_neighborhood text,
  fiscal_city text,
  fiscal_city_ibge_code text,
  fiscal_state text
);

create table if not exists public.invoices (
  id text not null,
  customer_id text,
  order_id text,
  credit_transaction_id text,
  focus_ref text not null,
  environment text not null default 'homologation'::text,
  status text not null default 'pending'::text,
  sefaz_status text,
  sefaz_message text,
  access_key text,
  number text,
  series text,
  danfe_url text,
  xml_url text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  model text not null default '55'::text,
  consumer_document text,
  qrcode_url text
);

create table if not exists public.marmita_menu_items (
  id text not null,
  day_of_week integer not null,
  name text not null,
  "group" text not null,
  price numeric(12,2) not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.order_items (
  id text not null,
  quantity integer not null default 1,
  weight numeric(12,3),
  price numeric(12,2) not null,
  unit_price numeric(12,2),
  manual_price numeric(12,2),
  sale_type text,
  notes text,
  order_id text not null,
  product_id text not null,
  product_name text not null
);

create table if not exists public.orders (
  id text not null,
  type text not null,
  status text not null default 'NEW'::text,
  total numeric(12,2) not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  customer_name text,
  delivery_street text,
  delivery_number text,
  delivery_neighborhood text,
  delivery_reference text,
  delivery_phone text,
  delivery_notes text,
  delivery_fee numeric(12,2) not null default 0,
  delivery_type text default 'URBAN'::text,
  table_id text,
  user_id text not null,
  waiter_id text,
  customer_id text,
  cash_register_session_id text,
  idempotency_key text,
  source text not null default 'PDV'::text,
  table_tab_id text
);

create table if not exists public.payable_accounts (
  id text not null,
  description text not null,
  amount numeric(12,2) not null,
  due_date timestamp with time zone not null,
  paid boolean not null default false,
  paid_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  supplier_id text
);

create table if not exists public.payments (
  id text not null,
  method text not null,
  amount numeric(12,2) not null,
  status text not null default 'PENDING'::text,
  transaction_id text,
  created_at timestamp with time zone not null default now(),
  order_id text not null
);

create table if not exists public.product_stock_items (
  id text not null,
  quantity numeric(12,3) not null,
  product_id text not null,
  stock_item_id text not null
);

create table if not exists public.products (
  id text not null,
  name text not null,
  description text,
  price numeric(12,2) not null,
  is_by_weight boolean not null default false,
  image_url text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  category_id text not null,
  ncm text,
  cfop text,
  origin text,
  tax_code text,
  is_paused boolean not null default false,
  paused_at timestamp with time zone
);

create table if not exists public.restaurant_config (
  id text not null,
  name text not null,
  logo_url text,
  banner_url text,
  address text,
  phone text,
  opening_hours text,
  opening_days text,
  delivery_fee numeric(12,2),
  urban_delivery_fee numeric(12,2) default 1.0,
  rural_delivery_fee numeric(12,2) default 3.0,
  enabled_payments text,
  updated_at timestamp with time zone not null default now(),
  cnpj text,
  legal_name text,
  state_registration text,
  tax_regime text,
  fiscal_city_ibge_code text,
  fiscal_zip_code text,
  fiscal_street text,
  fiscal_number text,
  fiscal_neighborhood text,
  fiscal_city text,
  fiscal_state text,
  default_cfop text,
  default_ncm text,
  default_origin text,
  default_tax_code text,
  nfce_enabled boolean not null default false,
  nfce_group_items boolean not null default false,
  nfce_grouped_item_description text not null default 'REFEICAO'::text
);

create table if not exists public.stock_items (
  id text not null,
  name text not null,
  quantity numeric(12,3) not null,
  unit text not null,
  min_quantity numeric(12,3) not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.supplier_stock_items (
  id text not null,
  price numeric(12,2) not null,
  updated_at timestamp with time zone not null default now(),
  supplier_id text not null,
  stock_item_id text not null
);

create table if not exists public.suppliers (
  id text not null,
  name text not null,
  contact text,
  phone text,
  email text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.table_tabs (
  id text not null,
  table_id text not null,
  cash_register_session_id text not null,
  name text not null,
  status text not null default 'OPEN'::text,
  opened_by_id text not null,
  closed_by_id text,
  opened_at timestamp with time zone not null default now(),
  closed_at timestamp with time zone,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.tables (
  id text not null,
  number integer not null,
  status text not null default 'AVAILABLE'::text
);

create table if not exists public.users (
  id text not null,
  name text not null,
  email text not null,
  password text not null,
  role text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Add catalog constraints only when absent. Existing matching databases remain untouched.
do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.audit_logs'::regclass
      and conname = 'audit_logs_pkey'
  ) then
    alter table public.audit_logs drop constraint if exists audit_logs_pkey;
    alter table public.audit_logs add constraint audit_logs_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_register_sessions'::regclass
      and conname = 'cash_register_sessions_pkey'
  ) then
    alter table public.cash_register_sessions drop constraint if exists cash_register_sessions_pkey;
    alter table public.cash_register_sessions add constraint cash_register_sessions_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_register_sessions'::regclass
      and conname = 'cash_sessions_closed_consistency_check'
  ) then
    alter table public.cash_register_sessions drop constraint if exists cash_sessions_closed_consistency_check;
    alter table public.cash_register_sessions add constraint cash_sessions_closed_consistency_check CHECK (status = 'OPEN'::text AND closed_at IS NULL AND closed_by_id IS NULL AND closing_amount IS NULL OR status = 'CLOSED'::text AND closed_at IS NOT NULL AND closed_by_id IS NOT NULL);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_register_sessions'::regclass
      and conname = 'cash_sessions_closing_amount_check'
  ) then
    alter table public.cash_register_sessions drop constraint if exists cash_sessions_closing_amount_check;
    alter table public.cash_register_sessions add constraint cash_sessions_closing_amount_check CHECK (closing_amount IS NULL OR closing_amount >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_register_sessions'::regclass
      and conname = 'cash_sessions_opening_amount_check'
  ) then
    alter table public.cash_register_sessions drop constraint if exists cash_sessions_opening_amount_check;
    alter table public.cash_register_sessions add constraint cash_sessions_opening_amount_check CHECK (opening_amount >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_register_sessions'::regclass
      and conname = 'cash_sessions_status_check'
  ) then
    alter table public.cash_register_sessions drop constraint if exists cash_sessions_status_check;
    alter table public.cash_register_sessions add constraint cash_sessions_status_check CHECK (status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_register_sessions'::regclass
      and conname = 'cash_sessions_withdrawal_total_check'
  ) then
    alter table public.cash_register_sessions drop constraint if exists cash_sessions_withdrawal_total_check;
    alter table public.cash_register_sessions add constraint cash_sessions_withdrawal_total_check CHECK (withdrawal_total >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_withdrawals'::regclass
      and conname = 'cash_withdrawals_amount_check'
  ) then
    alter table public.cash_withdrawals drop constraint if exists cash_withdrawals_amount_check;
    alter table public.cash_withdrawals add constraint cash_withdrawals_amount_check CHECK (amount > 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_withdrawals'::regclass
      and conname = 'cash_withdrawals_pkey'
  ) then
    alter table public.cash_withdrawals drop constraint if exists cash_withdrawals_pkey;
    alter table public.cash_withdrawals add constraint cash_withdrawals_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname = 'categories_name_unique'
  ) then
    alter table public.categories drop constraint if exists categories_name_unique;
    alter table public.categories add constraint categories_name_unique UNIQUE (name);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname = 'categories_pkey'
  ) then
    alter table public.categories drop constraint if exists categories_pkey;
    alter table public.categories add constraint categories_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname = 'categories_price_per_kg_check'
  ) then
    alter table public.categories drop constraint if exists categories_price_per_kg_check;
    alter table public.categories add constraint categories_price_per_kg_check CHECK (price_per_kg IS NULL OR price_per_kg >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname = 'categories_self_service_price_check'
  ) then
    alter table public.categories drop constraint if exists categories_self_service_price_check;
    alter table public.categories add constraint categories_self_service_price_check CHECK (self_service_price_per_kg IS NULL OR self_service_price_per_kg >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_settlements'::regclass
      and conname = 'credit_settlements_amount_check'
  ) then
    alter table public.credit_settlements drop constraint if exists credit_settlements_amount_check;
    alter table public.credit_settlements add constraint credit_settlements_amount_check CHECK (amount > 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_settlements'::regclass
      and conname = 'credit_settlements_pkey'
  ) then
    alter table public.credit_settlements drop constraint if exists credit_settlements_pkey;
    alter table public.credit_settlements add constraint credit_settlements_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_transactions'::regclass
      and conname = 'credit_transactions_pkey'
  ) then
    alter table public.credit_transactions drop constraint if exists credit_transactions_pkey;
    alter table public.credit_transactions add constraint credit_transactions_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_transactions'::regclass
      and conname = 'credit_transactions_settled_amount_check'
  ) then
    alter table public.credit_transactions drop constraint if exists credit_transactions_settled_amount_check;
    alter table public.credit_transactions add constraint credit_transactions_settled_amount_check CHECK (settled_amount >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_transactions'::regclass
      and conname = 'credit_transactions_status_check'
  ) then
    alter table public.credit_transactions drop constraint if exists credit_transactions_status_check;
    alter table public.credit_transactions add constraint credit_transactions_status_check CHECK (status = ANY (ARRAY['OPEN'::text, 'PARTIAL'::text, 'PAID'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_transactions'::regclass
      and conname = 'credit_tx_amount_check'
  ) then
    alter table public.credit_transactions drop constraint if exists credit_tx_amount_check;
    alter table public.credit_transactions add constraint credit_tx_amount_check CHECK (amount > 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_transactions'::regclass
      and conname = 'credit_tx_type_check'
  ) then
    alter table public.credit_transactions drop constraint if exists credit_tx_type_check;
    alter table public.credit_transactions add constraint credit_tx_type_check CHECK (type = ANY (ARRAY['CHARGE'::text, 'PAYMENT'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'customers_credit_limit_check'
  ) then
    alter table public.customers drop constraint if exists customers_credit_limit_check;
    alter table public.customers add constraint customers_credit_limit_check CHECK (credit_limit >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'customers_credit_used_check'
  ) then
    alter table public.customers drop constraint if exists customers_credit_used_check;
    alter table public.customers add constraint customers_credit_used_check CHECK (credit_used >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'customers_email_unique'
  ) then
    alter table public.customers drop constraint if exists customers_email_unique;
    alter table public.customers add constraint customers_email_unique UNIQUE (email);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'customers_person_type_check'
  ) then
    alter table public.customers drop constraint if exists customers_person_type_check;
    alter table public.customers add constraint customers_person_type_check CHECK (person_type = ANY (ARRAY['PF'::text, 'PJ'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'customers_phone_unique'
  ) then
    alter table public.customers drop constraint if exists customers_phone_unique;
    alter table public.customers add constraint customers_phone_unique UNIQUE (phone);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'customers_pkey'
  ) then
    alter table public.customers drop constraint if exists customers_pkey;
    alter table public.customers add constraint customers_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_environment_check'
  ) then
    alter table public.invoices drop constraint if exists invoices_environment_check;
    alter table public.invoices add constraint invoices_environment_check CHECK (environment = ANY (ARRAY['homologation'::text, 'production'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_focus_ref_key'
  ) then
    alter table public.invoices drop constraint if exists invoices_focus_ref_key;
    alter table public.invoices add constraint invoices_focus_ref_key UNIQUE (focus_ref);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_model_check'
  ) then
    alter table public.invoices drop constraint if exists invoices_model_check;
    alter table public.invoices add constraint invoices_model_check CHECK (model = ANY (ARRAY['55'::text, '65'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_pkey'
  ) then
    alter table public.invoices drop constraint if exists invoices_pkey;
    alter table public.invoices add constraint invoices_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_status_check'
  ) then
    alter table public.invoices drop constraint if exists invoices_status_check;
    alter table public.invoices add constraint invoices_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'authorized'::text, 'error'::text, 'canceled'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.marmita_menu_items'::regclass
      and conname = 'marmita_day_of_week_check'
  ) then
    alter table public.marmita_menu_items drop constraint if exists marmita_day_of_week_check;
    alter table public.marmita_menu_items add constraint marmita_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.marmita_menu_items'::regclass
      and conname = 'marmita_menu_items_pkey'
  ) then
    alter table public.marmita_menu_items drop constraint if exists marmita_menu_items_pkey;
    alter table public.marmita_menu_items add constraint marmita_menu_items_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.marmita_menu_items'::regclass
      and conname = 'marmita_price_check'
  ) then
    alter table public.marmita_menu_items drop constraint if exists marmita_price_check;
    alter table public.marmita_menu_items add constraint marmita_price_check CHECK (price >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_pkey'
  ) then
    alter table public.order_items drop constraint if exists order_items_pkey;
    alter table public.order_items add constraint order_items_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_price_check'
  ) then
    alter table public.order_items drop constraint if exists order_items_price_check;
    alter table public.order_items add constraint order_items_price_check CHECK (price >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_quantity_check'
  ) then
    alter table public.order_items drop constraint if exists order_items_quantity_check;
    alter table public.order_items add constraint order_items_quantity_check CHECK (quantity > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_sale_type_check'
  ) then
    alter table public.order_items drop constraint if exists order_items_sale_type_check;
    alter table public.order_items add constraint order_items_sale_type_check CHECK (sale_type IS NULL OR (sale_type = ANY (ARRAY['UNIT'::text, 'WEIGHT'::text, 'SELF_SERVICE'::text])));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_weight_check'
  ) then
    alter table public.order_items drop constraint if exists order_items_weight_check;
    alter table public.order_items add constraint order_items_weight_check CHECK (weight IS NULL OR weight > 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_delivery_fee_check'
  ) then
    alter table public.orders drop constraint if exists orders_delivery_fee_check;
    alter table public.orders add constraint orders_delivery_fee_check CHECK (delivery_fee >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_delivery_type_check'
  ) then
    alter table public.orders drop constraint if exists orders_delivery_type_check;
    alter table public.orders add constraint orders_delivery_type_check CHECK (delivery_type IS NULL OR (delivery_type = ANY (ARRAY['URBAN'::text, 'RURAL'::text])));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_pkey'
  ) then
    alter table public.orders drop constraint if exists orders_pkey;
    alter table public.orders add constraint orders_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_source_check'
  ) then
    alter table public.orders drop constraint if exists orders_source_check;
    alter table public.orders add constraint orders_source_check CHECK (source = ANY (ARRAY['PDV'::text, 'PUBLIC_MENU'::text, 'WAITER'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_status_check'
  ) then
    alter table public.orders drop constraint if exists orders_status_check;
    alter table public.orders add constraint orders_status_check CHECK (status = ANY (ARRAY['NEW'::text, 'IN_PROGRESS'::text, 'READY'::text, 'DELIVERED'::text, 'FINISHED'::text, 'CANCELED'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_total_check'
  ) then
    alter table public.orders drop constraint if exists orders_total_check;
    alter table public.orders add constraint orders_total_check CHECK (total >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_type_check'
  ) then
    alter table public.orders drop constraint if exists orders_type_check;
    alter table public.orders add constraint orders_type_check CHECK (type = ANY (ARRAY['DINE_IN'::text, 'TAKE_AWAY'::text, 'DELIVERY'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payable_accounts'::regclass
      and conname = 'payable_accounts_amount_check'
  ) then
    alter table public.payable_accounts drop constraint if exists payable_accounts_amount_check;
    alter table public.payable_accounts add constraint payable_accounts_amount_check CHECK (amount >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payable_accounts'::regclass
      and conname = 'payable_accounts_paid_consistency_check'
  ) then
    alter table public.payable_accounts drop constraint if exists payable_accounts_paid_consistency_check;
    alter table public.payable_accounts add constraint payable_accounts_paid_consistency_check CHECK (paid = false AND paid_at IS NULL OR paid = true AND paid_at IS NOT NULL);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payable_accounts'::regclass
      and conname = 'payable_accounts_pkey'
  ) then
    alter table public.payable_accounts drop constraint if exists payable_accounts_pkey;
    alter table public.payable_accounts add constraint payable_accounts_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_amount_check'
  ) then
    alter table public.payments drop constraint if exists payments_amount_check;
    alter table public.payments add constraint payments_amount_check CHECK (amount >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_method_check'
  ) then
    alter table public.payments drop constraint if exists payments_method_check;
    alter table public.payments add constraint payments_method_check CHECK (method = ANY (ARRAY['CASH'::text, 'PIX'::text, 'CREDIT_CARD'::text, 'DEBIT_CARD'::text, 'CREDIT'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_order_unique'
  ) then
    alter table public.payments drop constraint if exists payments_order_unique;
    alter table public.payments add constraint payments_order_unique UNIQUE (order_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_pkey'
  ) then
    alter table public.payments drop constraint if exists payments_pkey;
    alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_status_check'
  ) then
    alter table public.payments drop constraint if exists payments_status_check;
    alter table public.payments add constraint payments_status_check CHECK (status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'FAILED'::text, 'REFUNDED'::text, 'CANCELED'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_stock_items'::regclass
      and conname = 'product_stock_items_pkey'
  ) then
    alter table public.product_stock_items drop constraint if exists product_stock_items_pkey;
    alter table public.product_stock_items add constraint product_stock_items_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_stock_items'::regclass
      and conname = 'product_stock_items_quantity_check'
  ) then
    alter table public.product_stock_items drop constraint if exists product_stock_items_quantity_check;
    alter table public.product_stock_items add constraint product_stock_items_quantity_check CHECK (quantity > 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_stock_items'::regclass
      and conname = 'product_stock_items_unique'
  ) then
    alter table public.product_stock_items drop constraint if exists product_stock_items_unique;
    alter table public.product_stock_items add constraint product_stock_items_unique UNIQUE (product_id, stock_item_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_pause_state_check'
  ) then
    alter table public.products drop constraint if exists products_pause_state_check;
    alter table public.products add constraint products_pause_state_check CHECK (is_paused = (paused_at IS NOT NULL));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_pkey'
  ) then
    alter table public.products drop constraint if exists products_pkey;
    alter table public.products add constraint products_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_price_check'
  ) then
    alter table public.products drop constraint if exists products_price_check;
    alter table public.products add constraint products_price_check CHECK (price >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.restaurant_config'::regclass
      and conname = 'restaurant_config_delivery_fee_check'
  ) then
    alter table public.restaurant_config drop constraint if exists restaurant_config_delivery_fee_check;
    alter table public.restaurant_config add constraint restaurant_config_delivery_fee_check CHECK (delivery_fee IS NULL OR delivery_fee >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.restaurant_config'::regclass
      and conname = 'restaurant_config_nfce_grouped_item_description_length_check'
  ) then
    alter table public.restaurant_config drop constraint if exists restaurant_config_nfce_grouped_item_description_length_check;
    alter table public.restaurant_config add constraint restaurant_config_nfce_grouped_item_description_length_check CHECK (length(TRIM(BOTH FROM nfce_grouped_item_description)) >= 1 AND length(TRIM(BOTH FROM nfce_grouped_item_description)) <= 120);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.restaurant_config'::regclass
      and conname = 'restaurant_config_pkey'
  ) then
    alter table public.restaurant_config drop constraint if exists restaurant_config_pkey;
    alter table public.restaurant_config add constraint restaurant_config_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.restaurant_config'::regclass
      and conname = 'restaurant_config_rural_fee_check'
  ) then
    alter table public.restaurant_config drop constraint if exists restaurant_config_rural_fee_check;
    alter table public.restaurant_config add constraint restaurant_config_rural_fee_check CHECK (rural_delivery_fee IS NULL OR rural_delivery_fee >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.restaurant_config'::regclass
      and conname = 'restaurant_config_urban_fee_check'
  ) then
    alter table public.restaurant_config drop constraint if exists restaurant_config_urban_fee_check;
    alter table public.restaurant_config add constraint restaurant_config_urban_fee_check CHECK (urban_delivery_fee IS NULL OR urban_delivery_fee >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stock_items'::regclass
      and conname = 'stock_items_min_quantity_check'
  ) then
    alter table public.stock_items drop constraint if exists stock_items_min_quantity_check;
    alter table public.stock_items add constraint stock_items_min_quantity_check CHECK (min_quantity >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stock_items'::regclass
      and conname = 'stock_items_name_unique'
  ) then
    alter table public.stock_items drop constraint if exists stock_items_name_unique;
    alter table public.stock_items add constraint stock_items_name_unique UNIQUE (name);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stock_items'::regclass
      and conname = 'stock_items_pkey'
  ) then
    alter table public.stock_items drop constraint if exists stock_items_pkey;
    alter table public.stock_items add constraint stock_items_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stock_items'::regclass
      and conname = 'stock_items_quantity_check'
  ) then
    alter table public.stock_items drop constraint if exists stock_items_quantity_check;
    alter table public.stock_items add constraint stock_items_quantity_check CHECK (quantity >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.supplier_stock_items'::regclass
      and conname = 'supplier_stock_items_pkey'
  ) then
    alter table public.supplier_stock_items drop constraint if exists supplier_stock_items_pkey;
    alter table public.supplier_stock_items add constraint supplier_stock_items_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.supplier_stock_items'::regclass
      and conname = 'supplier_stock_items_price_check'
  ) then
    alter table public.supplier_stock_items drop constraint if exists supplier_stock_items_price_check;
    alter table public.supplier_stock_items add constraint supplier_stock_items_price_check CHECK (price >= 0::numeric);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.supplier_stock_items'::regclass
      and conname = 'supplier_stock_items_unique'
  ) then
    alter table public.supplier_stock_items drop constraint if exists supplier_stock_items_unique;
    alter table public.supplier_stock_items add constraint supplier_stock_items_unique UNIQUE (supplier_id, stock_item_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.suppliers'::regclass
      and conname = 'suppliers_email_unique'
  ) then
    alter table public.suppliers drop constraint if exists suppliers_email_unique;
    alter table public.suppliers add constraint suppliers_email_unique UNIQUE (email);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.suppliers'::regclass
      and conname = 'suppliers_pkey'
  ) then
    alter table public.suppliers drop constraint if exists suppliers_pkey;
    alter table public.suppliers add constraint suppliers_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.table_tabs'::regclass
      and conname = 'table_tabs_closed_fields_check'
  ) then
    alter table public.table_tabs drop constraint if exists table_tabs_closed_fields_check;
    alter table public.table_tabs add constraint table_tabs_closed_fields_check CHECK (status = 'OPEN'::text AND closed_by_id IS NULL AND closed_at IS NULL OR status = 'CLOSED'::text AND closed_by_id IS NOT NULL AND closed_at IS NOT NULL);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.table_tabs'::regclass
      and conname = 'table_tabs_id_table_id_key'
  ) then
    alter table public.table_tabs drop constraint if exists table_tabs_id_table_id_key;
    alter table public.table_tabs add constraint table_tabs_id_table_id_key UNIQUE (id, table_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.table_tabs'::regclass
      and conname = 'table_tabs_name_check'
  ) then
    alter table public.table_tabs drop constraint if exists table_tabs_name_check;
    alter table public.table_tabs add constraint table_tabs_name_check CHECK (btrim(name) <> ''::text);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.table_tabs'::regclass
      and conname = 'table_tabs_pkey'
  ) then
    alter table public.table_tabs drop constraint if exists table_tabs_pkey;
    alter table public.table_tabs add constraint table_tabs_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.table_tabs'::regclass
      and conname = 'table_tabs_status_check'
  ) then
    alter table public.table_tabs drop constraint if exists table_tabs_status_check;
    alter table public.table_tabs add constraint table_tabs_status_check CHECK (status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tables'::regclass
      and conname = 'tables_number_unique'
  ) then
    alter table public.tables drop constraint if exists tables_number_unique;
    alter table public.tables add constraint tables_number_unique UNIQUE (number);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tables'::regclass
      and conname = 'tables_pkey'
  ) then
    alter table public.tables drop constraint if exists tables_pkey;
    alter table public.tables add constraint tables_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tables'::regclass
      and conname = 'tables_status_check'
  ) then
    alter table public.tables drop constraint if exists tables_status_check;
    alter table public.tables add constraint tables_status_check CHECK (status = ANY (ARRAY['AVAILABLE'::text, 'OCCUPIED'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_email_unique'
  ) then
    alter table public.users drop constraint if exists users_email_unique;
    alter table public.users add constraint users_email_unique UNIQUE (email);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_pkey'
  ) then
    alter table public.users drop constraint if exists users_pkey;
    alter table public.users add constraint users_pkey PRIMARY KEY (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_role_check'
  ) then
    alter table public.users drop constraint if exists users_role_check;
    alter table public.users add constraint users_role_check CHECK (role = ANY (ARRAY['ADMIN'::text, 'CASHIER'::text, 'WAITER'::text, 'FINANCE'::text]));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.audit_logs'::regclass
      and conname = 'audit_logs_user_id_fkey'
  ) then
    alter table public.audit_logs drop constraint if exists audit_logs_user_id_fkey;
    alter table public.audit_logs add constraint audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_register_sessions'::regclass
      and conname = 'cash_sessions_closed_by_fkey'
  ) then
    alter table public.cash_register_sessions drop constraint if exists cash_sessions_closed_by_fkey;
    alter table public.cash_register_sessions add constraint cash_sessions_closed_by_fkey FOREIGN KEY (closed_by_id) REFERENCES users(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_register_sessions'::regclass
      and conname = 'cash_sessions_opened_by_fkey'
  ) then
    alter table public.cash_register_sessions drop constraint if exists cash_sessions_opened_by_fkey;
    alter table public.cash_register_sessions add constraint cash_sessions_opened_by_fkey FOREIGN KEY (opened_by_id) REFERENCES users(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_withdrawals'::regclass
      and conname = 'cash_withdrawals_created_by_fkey'
  ) then
    alter table public.cash_withdrawals drop constraint if exists cash_withdrawals_created_by_fkey;
    alter table public.cash_withdrawals add constraint cash_withdrawals_created_by_fkey FOREIGN KEY (created_by_id) REFERENCES users(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cash_withdrawals'::regclass
      and conname = 'cash_withdrawals_session_fkey'
  ) then
    alter table public.cash_withdrawals drop constraint if exists cash_withdrawals_session_fkey;
    alter table public.cash_withdrawals add constraint cash_withdrawals_session_fkey FOREIGN KEY (session_id) REFERENCES cash_register_sessions(id) ON DELETE CASCADE;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_settlements'::regclass
      and conname = 'credit_settlements_charge_id_fkey'
  ) then
    alter table public.credit_settlements drop constraint if exists credit_settlements_charge_id_fkey;
    alter table public.credit_settlements add constraint credit_settlements_charge_id_fkey FOREIGN KEY (charge_id) REFERENCES credit_transactions(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_settlements'::regclass
      and conname = 'credit_settlements_payment_id_fkey'
  ) then
    alter table public.credit_settlements drop constraint if exists credit_settlements_payment_id_fkey;
    alter table public.credit_settlements add constraint credit_settlements_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES credit_transactions(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_transactions'::regclass
      and conname = 'credit_transactions_order_id_fkey'
  ) then
    alter table public.credit_transactions drop constraint if exists credit_transactions_order_id_fkey;
    alter table public.credit_transactions add constraint credit_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.credit_transactions'::regclass
      and conname = 'credit_tx_customer_fkey'
  ) then
    alter table public.credit_transactions drop constraint if exists credit_tx_customer_fkey;
    alter table public.credit_transactions add constraint credit_tx_customer_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_credit_transaction_id_fkey'
  ) then
    alter table public.invoices drop constraint if exists invoices_credit_transaction_id_fkey;
    alter table public.invoices add constraint invoices_credit_transaction_id_fkey FOREIGN KEY (credit_transaction_id) REFERENCES credit_transactions(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_customer_id_fkey'
  ) then
    alter table public.invoices drop constraint if exists invoices_customer_id_fkey;
    alter table public.invoices add constraint invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_order_id_fkey'
  ) then
    alter table public.invoices drop constraint if exists invoices_order_id_fkey;
    alter table public.invoices add constraint invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_order_fkey'
  ) then
    alter table public.order_items drop constraint if exists order_items_order_fkey;
    alter table public.order_items add constraint order_items_order_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_product_fkey'
  ) then
    alter table public.order_items drop constraint if exists order_items_product_fkey;
    alter table public.order_items add constraint order_items_product_fkey FOREIGN KEY (product_id) REFERENCES products(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_cash_session_fkey'
  ) then
    alter table public.orders drop constraint if exists orders_cash_session_fkey;
    alter table public.orders add constraint orders_cash_session_fkey FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_customer_fkey'
  ) then
    alter table public.orders drop constraint if exists orders_customer_fkey;
    alter table public.orders add constraint orders_customer_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_table_fkey'
  ) then
    alter table public.orders drop constraint if exists orders_table_fkey;
    alter table public.orders add constraint orders_table_fkey FOREIGN KEY (table_id) REFERENCES tables(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_table_tab_table_fkey'
  ) then
    alter table public.orders drop constraint if exists orders_table_tab_table_fkey;
    alter table public.orders add constraint orders_table_tab_table_fkey FOREIGN KEY (table_tab_id, table_id) REFERENCES table_tabs(id, table_id) ON DELETE RESTRICT;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_user_fkey'
  ) then
    alter table public.orders drop constraint if exists orders_user_fkey;
    alter table public.orders add constraint orders_user_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_waiter_fkey'
  ) then
    alter table public.orders drop constraint if exists orders_waiter_fkey;
    alter table public.orders add constraint orders_waiter_fkey FOREIGN KEY (waiter_id) REFERENCES users(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payable_accounts'::regclass
      and conname = 'payable_accounts_supplier_fkey'
  ) then
    alter table public.payable_accounts drop constraint if exists payable_accounts_supplier_fkey;
    alter table public.payable_accounts add constraint payable_accounts_supplier_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_order_fkey'
  ) then
    alter table public.payments drop constraint if exists payments_order_fkey;
    alter table public.payments add constraint payments_order_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_stock_items'::regclass
      and conname = 'product_stock_items_product_fkey'
  ) then
    alter table public.product_stock_items drop constraint if exists product_stock_items_product_fkey;
    alter table public.product_stock_items add constraint product_stock_items_product_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_stock_items'::regclass
      and conname = 'product_stock_items_stock_fkey'
  ) then
    alter table public.product_stock_items drop constraint if exists product_stock_items_stock_fkey;
    alter table public.product_stock_items add constraint product_stock_items_stock_fkey FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_category_id_fkey'
  ) then
    alter table public.products drop constraint if exists products_category_id_fkey;
    alter table public.products add constraint products_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.supplier_stock_items'::regclass
      and conname = 'supplier_stock_items_stock_fkey'
  ) then
    alter table public.supplier_stock_items drop constraint if exists supplier_stock_items_stock_fkey;
    alter table public.supplier_stock_items add constraint supplier_stock_items_stock_fkey FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.supplier_stock_items'::regclass
      and conname = 'supplier_stock_items_supplier_fkey'
  ) then
    alter table public.supplier_stock_items drop constraint if exists supplier_stock_items_supplier_fkey;
    alter table public.supplier_stock_items add constraint supplier_stock_items_supplier_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.table_tabs'::regclass
      and conname = 'table_tabs_cash_register_session_id_fkey'
  ) then
    alter table public.table_tabs drop constraint if exists table_tabs_cash_register_session_id_fkey;
    alter table public.table_tabs add constraint table_tabs_cash_register_session_id_fkey FOREIGN KEY (cash_register_session_id) REFERENCES cash_register_sessions(id) ON DELETE RESTRICT;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.table_tabs'::regclass
      and conname = 'table_tabs_closed_by_id_fkey'
  ) then
    alter table public.table_tabs drop constraint if exists table_tabs_closed_by_id_fkey;
    alter table public.table_tabs add constraint table_tabs_closed_by_id_fkey FOREIGN KEY (closed_by_id) REFERENCES users(id) ON DELETE RESTRICT;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.table_tabs'::regclass
      and conname = 'table_tabs_opened_by_id_fkey'
  ) then
    alter table public.table_tabs drop constraint if exists table_tabs_opened_by_id_fkey;
    alter table public.table_tabs add constraint table_tabs_opened_by_id_fkey FOREIGN KEY (opened_by_id) REFERENCES users(id) ON DELETE RESTRICT;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.table_tabs'::regclass
      and conname = 'table_tabs_table_id_fkey'
  ) then
    alter table public.table_tabs drop constraint if exists table_tabs_table_id_fkey;
    alter table public.table_tabs add constraint table_tabs_table_id_fkey FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE RESTRICT;
  end if;

end;
$constraints$;

-- The 34 PRIMARY KEY/UNIQUE indexes are created by their constraints above.
-- The remaining 63 standalone indexes follow their live catalog definitions.
create index if not exists idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);
create index if not exists idx_audit_logs_entity ON public.audit_logs USING btree (entity, entity_id);
create index if not exists idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);
create index if not exists idx_cash_sessions_closed_at ON public.cash_register_sessions USING btree (closed_at DESC);
create index if not exists idx_cash_sessions_closed_by_id ON public.cash_register_sessions USING btree (closed_by_id);
create unique index if not exists idx_cash_sessions_only_one_open ON public.cash_register_sessions USING btree (status) WHERE (status = 'OPEN'::text);
create index if not exists idx_cash_sessions_opened_at ON public.cash_register_sessions USING btree (opened_at DESC);
create index if not exists idx_cash_sessions_opened_by_id ON public.cash_register_sessions USING btree (opened_by_id);
create index if not exists idx_cash_sessions_status ON public.cash_register_sessions USING btree (status);
create index if not exists idx_cash_withdrawals_created_at ON public.cash_withdrawals USING btree (created_at DESC);
create index if not exists idx_cash_withdrawals_created_by_id ON public.cash_withdrawals USING btree (created_by_id);
create index if not exists idx_cash_withdrawals_session_id ON public.cash_withdrawals USING btree (session_id);
create index if not exists credit_settlements_charge_id_idx ON public.credit_settlements USING btree (charge_id);
create index if not exists credit_settlements_payment_id_idx ON public.credit_settlements USING btree (payment_id);
create index if not exists credit_transactions_customer_status_created_idx ON public.credit_transactions USING btree (customer_id, status, created_at) WHERE (type = 'CHARGE'::text);
create index if not exists credit_transactions_order_id_idx ON public.credit_transactions USING btree (order_id);
create index if not exists idx_credit_tx_created_at ON public.credit_transactions USING btree (created_at DESC);
create index if not exists idx_credit_tx_customer_id ON public.credit_transactions USING btree (customer_id);
create index if not exists idx_customers_name ON public.customers USING btree (name);
create index if not exists idx_customers_name_trgm ON public.customers USING gin (name gin_trgm_ops);
create unique index if not exists invoices_active_order_idx ON public.invoices USING btree (order_id) WHERE ((order_id IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'processing'::text, 'authorized'::text])));
create index if not exists invoices_credit_transaction_id_idx ON public.invoices USING btree (credit_transaction_id);
create index if not exists invoices_customer_id_idx ON public.invoices USING btree (customer_id);
create index if not exists invoices_order_model_created_idx ON public.invoices USING btree (order_id, model, created_at DESC);
create index if not exists idx_marmita_day_active_sort ON public.marmita_menu_items USING btree (day_of_week, is_active, "group", sort_order, name);
create index if not exists idx_marmita_day_of_week ON public.marmita_menu_items USING btree (day_of_week);
create index if not exists idx_marmita_is_active ON public.marmita_menu_items USING btree (is_active) WHERE (is_active = true);
create index if not exists idx_order_items_order_id ON public.order_items USING btree (order_id);
create index if not exists idx_order_items_product_id ON public.order_items USING btree (product_id);
create index if not exists idx_orders_cash_session_id ON public.orders USING btree (cash_register_session_id);
create index if not exists idx_orders_created_at ON public.orders USING btree (created_at DESC);
create index if not exists idx_orders_customer_id ON public.orders USING btree (customer_id);
create index if not exists idx_orders_customer_name_trgm ON public.orders USING gin (customer_name gin_trgm_ops);
create index if not exists idx_orders_session_status ON public.orders USING btree (cash_register_session_id, status);
create index if not exists idx_orders_status ON public.orders USING btree (status);
create index if not exists idx_orders_table_id ON public.orders USING btree (table_id);
create index if not exists idx_orders_type ON public.orders USING btree (type);
create index if not exists idx_orders_user_id ON public.orders USING btree (user_id);
create index if not exists idx_orders_waiter_id ON public.orders USING btree (waiter_id);
create unique index if not exists orders_idempotency_key_idx ON public.orders USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
create index if not exists orders_table_tab_id_idx ON public.orders USING btree (table_tab_id);
create index if not exists idx_payable_accounts_due_date ON public.payable_accounts USING btree (due_date);
create index if not exists idx_payable_accounts_paid ON public.payable_accounts USING btree (paid);
create index if not exists idx_payable_accounts_paid_at ON public.payable_accounts USING btree (paid_at) WHERE (paid = true);
create index if not exists idx_payable_accounts_supplier_id ON public.payable_accounts USING btree (supplier_id);
create index if not exists idx_payments_created_at ON public.payments USING btree (created_at DESC);
create index if not exists idx_payments_method ON public.payments USING btree (method);
create index if not exists idx_payments_status ON public.payments USING btree (status);
create index if not exists idx_product_stock_items_product_id ON public.product_stock_items USING btree (product_id);
create index if not exists idx_product_stock_items_stock_item_id ON public.product_stock_items USING btree (stock_item_id);
create index if not exists idx_products_category_id ON public.products USING btree (category_id);
create index if not exists idx_products_name ON public.products USING btree (name);
create unique index if not exists idx_restaurant_config_singleton ON public.restaurant_config USING btree ((true));
create index if not exists idx_stock_items_low ON public.stock_items USING btree (id) WHERE (quantity <= min_quantity);
create index if not exists idx_stock_items_name ON public.stock_items USING btree (name);
create index if not exists idx_supplier_stock_items_stock_item_id ON public.supplier_stock_items USING btree (stock_item_id);
create index if not exists idx_supplier_stock_items_supplier_id ON public.supplier_stock_items USING btree (supplier_id);
create index if not exists idx_suppliers_name ON public.suppliers USING btree (name);
create index if not exists table_tabs_cash_session_status_idx ON public.table_tabs USING btree (cash_register_session_id, status);
create unique index if not exists table_tabs_open_name_idx ON public.table_tabs USING btree (table_id, lower(btrim(name))) WHERE (status = 'OPEN'::text);
create index if not exists table_tabs_open_overview_idx ON public.table_tabs USING btree (opened_at, table_id) WHERE (status = 'OPEN'::text);
create index if not exists table_tabs_table_status_idx ON public.table_tabs USING btree (table_id, status);
create index if not exists idx_users_role ON public.users USING btree (role);

commit;
