begin;

-- Situações canônicas de mesa. Valores antigos ou divergentes são reconciliados
-- pelo estado real dos pedidos ativos, sem tratar uma mesa específica como exceção.
update public.tables as table_row
set status = case
  when exists (
    select 1
    from public.orders as order_row
    where order_row.table_id = table_row.id
      and order_row.status in ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED')
  ) then 'OCCUPIED'
  else 'AVAILABLE'
end
where table_row.status not in ('AVAILABLE', 'OCCUPIED');

update public.tables as table_row
set status = 'OCCUPIED'
where exists (
  select 1
  from public.orders as order_row
  where order_row.table_id = table_row.id
    and order_row.status in ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED')
);

alter table public.tables
  drop constraint if exists tables_status_check;

alter table public.tables
  add constraint tables_status_check
  check (status in ('AVAILABLE', 'OCCUPIED'));

create table public.table_tabs (
  id text primary key,
  table_id text not null references public.tables(id) on delete restrict,
  cash_register_session_id text not null references public.cash_register_sessions(id) on delete restrict,
  name text not null,
  status text not null default 'OPEN',
  opened_by_id text not null references public.users(id) on delete restrict,
  closed_by_id text references public.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint table_tabs_name_check check (btrim(name) <> ''),
  constraint table_tabs_status_check check (status in ('OPEN', 'CLOSED')),
  constraint table_tabs_closed_fields_check check (
    (status = 'OPEN' and closed_by_id is null and closed_at is null)
    or (status = 'CLOSED' and closed_by_id is not null and closed_at is not null)
  ),
  constraint table_tabs_id_table_id_key unique (id, table_id)
);

alter table public.table_tabs enable row level security;

create index table_tabs_table_status_idx
  on public.table_tabs(table_id, status);

create index table_tabs_cash_session_status_idx
  on public.table_tabs(cash_register_session_id, status);

create unique index table_tabs_open_name_idx
  on public.table_tabs(table_id, lower(btrim(name)))
  where status = 'OPEN';

alter table public.orders
  add column table_tab_id text;

-- Uma conta ativa não pode ser associada a uma sessão inventada. Se um banco
-- legado tiver pedidos ativos da mesma mesa em sessões diferentes ou sem sessão,
-- a migration para com uma mensagem explícita para que o dado seja saneado.
do $$
begin
  if exists (
    select order_row.table_id
    from public.orders as order_row
    where order_row.table_id is not null
      and order_row.status in ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED')
    group by order_row.table_id
    having count(*) filter (where order_row.cash_register_session_id is null) > 0
       or count(distinct order_row.cash_register_session_id) > 1
  ) then
    raise exception 'ACTIVE_TABLE_ORDERS_HAVE_INCONSISTENT_CASH_SESSIONS';
  end if;
end;
$$;
-- Migração geral de dados:
-- 1. toda mesa com pedido ativo fica ocupada;
-- 2. cada mesa ocupada com pedido ativo recebe uma comanda "Não registrado";
-- 3. somente os pedidos ativos são vinculados, preservando o histórico encerrado;
-- 4. mesa ocupada sem pedido ativo volta a AVAILABLE, pois não há conta a preservar.
insert into public.table_tabs (
  id,
  table_id,
  cash_register_session_id,
  name,
  status,
  opened_by_id,
  opened_at,
  updated_at
)
select
  'tab_legacy_' || substr(md5(table_row.id), 1, 20),
  table_row.id,
  first_order.cash_register_session_id,
  'Não registrado',
  'OPEN',
  first_order.user_id,
  first_order.created_at,
  now()
from public.tables as table_row
cross join lateral (
  select
    order_row.cash_register_session_id,
    order_row.user_id,
    order_row.created_at
  from public.orders as order_row
  where order_row.table_id = table_row.id
    and order_row.status in ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED')
  order by order_row.created_at, order_row.id
  limit 1
) as first_order
where table_row.status = 'OCCUPIED';

update public.orders as order_row
set table_tab_id = tab.id
from public.table_tabs as tab
where tab.table_id = order_row.table_id
  and tab.status = 'OPEN'
  and tab.name = 'Não registrado'
  and order_row.status in ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED');

update public.tables as table_row
set status = 'AVAILABLE'
where table_row.status = 'OCCUPIED'
  and not exists (
    select 1
    from public.orders as order_row
    where order_row.table_id = table_row.id
      and order_row.status in ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED')
  );

alter table public.orders
  add constraint orders_table_tab_table_fkey
  foreign key (table_tab_id, table_id)
  references public.table_tabs(id, table_id)
  on delete restrict;

create index orders_table_tab_id_idx
  on public.orders(table_tab_id);

create or replace function public.validate_table_tab_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_status text;
begin
  new.name := btrim(new.name);

  select status into v_table_status
  from public.tables
  where id = new.table_id
  for update;

  if not found then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_table_status <> 'OCCUPIED' then
    raise exception 'TABLE_TAB_REQUIRES_OCCUPIED_TABLE' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and old.status = 'CLOSED' then
    raise exception 'TABLE_TAB_ALREADY_CLOSED' using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_validate_table_tab_parent
before insert or update on public.table_tabs
for each row
execute function public.validate_table_tab_parent();

create or replace function public.prevent_table_release_with_open_tabs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'OCCUPIED'
     and new.status = 'AVAILABLE'
     and exists (
       select 1 from public.table_tabs
       where table_id = new.id and status = 'OPEN'
     ) then
    raise exception 'TABLE_HAS_OPEN_TABS' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_table_release_with_open_tabs
before update of status on public.tables
for each row
execute function public.prevent_table_release_with_open_tabs();

create or replace function public.release_table_after_last_tab()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'CLOSED'
     and old.status is distinct from 'CLOSED'
     and not exists (
       select 1 from public.table_tabs
       where table_id = new.table_id and status = 'OPEN'
     ) then
    update public.tables
    set status = 'AVAILABLE'
    where id = new.table_id;
  end if;
  return new;
end;
$$;

create trigger trg_release_table_after_last_tab
after update of status on public.table_tabs
for each row
execute function public.release_table_after_last_tab();

create or replace function public.validate_order_table_tab()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tab_id text;
  v_tab_status text;
  v_table_status text;
begin
  if new.type <> 'DINE_IN' then
    if new.table_id is not null or new.table_tab_id is not null then
      raise exception 'NON_DINE_IN_ORDER_CANNOT_HAVE_TABLE_TAB' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.table_id is null then
    raise exception 'DINE_IN_ORDER_REQUIRES_TABLE' using errcode = 'P0001';
  end if;

  select status into v_table_status
  from public.tables
  where id = new.table_id
  for update;

  if not found then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if new.table_tab_id is null then
    if new.cash_register_session_id is null or new.user_id is null then
      raise exception 'TABLE_TAB_CONTEXT_REQUIRED' using errcode = 'P0001';
    end if;

    if v_table_status = 'AVAILABLE' then
      update public.tables set status = 'OCCUPIED' where id = new.table_id;
    end if;

    select id into v_tab_id
    from public.table_tabs
    where table_id = new.table_id
      and status = 'OPEN'
      and lower(btrim(name)) = lower('Não registrado')
    order by opened_at
    limit 1
    for update;

    if v_tab_id is null then
      v_tab_id := 'tab_' || substr(md5(random()::text || clock_timestamp()::text || new.id), 1, 24);
      insert into public.table_tabs (
        id, table_id, cash_register_session_id, name, status, opened_by_id
      ) values (
        v_tab_id,
        new.table_id,
        new.cash_register_session_id,
        'Não registrado',
        'OPEN',
        new.user_id
      );
    end if;

    new.table_tab_id := v_tab_id;
    return new;
  end if;

  select status into v_tab_status
  from public.table_tabs
  where id = new.table_tab_id
    and table_id = new.table_id
  for update;

  if not found then
    raise exception 'TABLE_TAB_NOT_FOUND_FOR_TABLE' using errcode = 'P0002';
  end if;

  if v_table_status <> 'OCCUPIED' then
    raise exception 'TABLE_TAB_REQUIRES_OCCUPIED_TABLE' using errcode = 'P0001';
  end if;

  if v_tab_status <> 'OPEN' then
    raise exception 'TABLE_TAB_ALREADY_CLOSED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_validate_order_table_tab
before insert or update of table_tab_id, table_id, type on public.orders
for each row
execute function public.validate_order_table_tab();

create or replace function public.validate_table_tab_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'OPEN' and new.status = 'CLOSED' and exists (
    select 1
    from public.orders as order_row
    where order_row.table_tab_id = new.id
      and order_row.status <> 'CANCELED'
      and (
        order_row.status <> 'FINISHED'
        or not exists (
          select 1 from public.payments as payment
          where payment.order_id = order_row.id
            and payment.status = 'PAID'
        )
      )
  ) then
    raise exception 'TABLE_TAB_HAS_UNPAID_ORDERS' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_validate_table_tab_close
before update of status on public.table_tabs
for each row
execute function public.validate_table_tab_close();

create or replace function public.close_settled_table_tab_after_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.table_tab_id is not null
     and new.status in ('FINISHED', 'CANCELED')
     and old.status is distinct from new.status
     and not exists (
       select 1 from public.orders
       where table_tab_id = new.table_tab_id
         and status in ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED')
     )
     and not exists (
       select 1
       from public.orders as order_row
       where order_row.table_tab_id = new.table_tab_id
         and order_row.status <> 'CANCELED'
         and not exists (
           select 1 from public.payments as payment
           where payment.order_id = order_row.id and payment.status = 'PAID'
         )
     ) then
    update public.table_tabs
    set
      status = 'CLOSED',
      closed_by_id = coalesce(new.waiter_id, new.user_id),
      closed_at = now(),
      updated_at = now()
    where id = new.table_tab_id
      and status = 'OPEN';
  end if;
  return new;
end;
$$;

create trigger trg_close_settled_table_tab_after_order
after update of status on public.orders
for each row
execute function public.close_settled_table_tab_after_order();

create or replace function public.close_table_tab(
  p_table_tab_id text,
  p_payment_method text,
  p_customer_id text,
  p_closed_by_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tab public.table_tabs%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_unpaid_total numeric := 0;
  v_unpaid_count integer := 0;
  v_payment_id text;
  v_credit_id text;
begin
  select * into v_tab
  from public.table_tabs
  where id = p_table_tab_id
  for update;

  if not found then
    raise exception 'TABLE_TAB_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_tab.status = 'CLOSED' then
    return to_jsonb(v_tab);
  end if;

  select coalesce(sum(order_row.total), 0)
  into v_unpaid_total
  from public.orders as order_row
  where order_row.table_tab_id = v_tab.id
    and order_row.status <> 'CANCELED'
    and not exists (
      select 1 from public.payments as payment
      where payment.order_id = order_row.id and payment.status = 'PAID'
    );

  if v_unpaid_count > 0 and p_payment_method is null then
    raise exception 'TABLE_TAB_PAYMENT_METHOD_REQUIRED' using errcode = 'P0001';
  end if;

  if p_payment_method is not null
     and p_payment_method not in ('CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CREDIT') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = 'P0001';
  end if;

  if p_payment_method = 'CREDIT' then
    if p_customer_id is null then
      raise exception 'TABLE_TAB_CUSTOMER_REQUIRED' using errcode = 'P0001';
    end if;

    select * into v_customer
    from public.customers
    where id = p_customer_id
    for update;

    if not found then
      raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_customer.credit_used + v_unpaid_total > v_customer.credit_limit then
      raise exception 'CREDIT_LIMIT_EXCEEDED' using errcode = 'P0001';
    end if;

    update public.customers
    set credit_used = credit_used + v_unpaid_total,
        updated_at = now()
    where id = p_customer_id;
  end if;

  perform set_config('app.closing_table_tab', '1', true);

  update public.orders as order_row
  set status = 'FINISHED', updated_at = now()
  where order_row.table_tab_id = v_tab.id
    and order_row.status <> 'CANCELED'
    and exists (
      select 1 from public.payments as payment
      where payment.order_id = order_row.id and payment.status = 'PAID'
    );

  for v_order in
    select order_row.*
    from public.orders as order_row
    where order_row.table_tab_id = v_tab.id
      and order_row.status <> 'CANCELED'
      and not exists (
        select 1 from public.payments as payment
        where payment.order_id = order_row.id and payment.status = 'PAID'
      )
    order by order_row.created_at, order_row.id
    for update
  loop
    v_payment_id := 'pay_' || substr(md5(random()::text || clock_timestamp()::text || v_order.id), 1, 24);

    insert into public.payments (
      id, order_id, method, amount, status, transaction_id, created_at
    ) values (
      v_payment_id, v_order.id, p_payment_method, v_order.total, 'PAID', null, now()
    )
    on conflict (order_id) do update
    set method = excluded.method,
        amount = excluded.amount,
        status = 'PAID';

    if p_payment_method = 'CREDIT' and not exists (
      select 1 from public.credit_transactions
      where order_id = v_order.id and type = 'CHARGE'
    ) then
      v_credit_id := 'ctx_' || substr(md5(random()::text || clock_timestamp()::text || v_order.id), 1, 24);
      insert into public.credit_transactions (
        id, type, amount, description, customer_id, order_id,
        status, settled_amount, settled_at, created_at
      ) values (
        v_credit_id,
        'CHARGE',
        v_order.total,
        'Comanda ' || v_tab.name || ' - pedido ' || v_order.id,
        p_customer_id,
        v_order.id,
        'OPEN',
        0,
        null,
        now()
      );
    end if;

    update public.orders
    set status = 'FINISHED',
        customer_id = case when p_payment_method = 'CREDIT' then p_customer_id else customer_id end,
        updated_at = now()
    where id = v_order.id;
  end loop;

  update public.table_tabs
  set status = 'CLOSED',
      closed_by_id = p_closed_by_id,
      closed_at = now(),
      updated_at = now()
  where id = v_tab.id
    and status = 'OPEN'
  returning * into v_tab;

  if not found then
    select * into v_tab from public.table_tabs where id = p_table_tab_id;
  end if;

  return to_jsonb(v_tab);
end;
$$;

revoke all on function public.close_table_tab(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.close_table_tab(text, text, text, text)
  to service_role;

create or replace function public.block_cash_close_with_pending_orders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_orders jsonb;
  open_tabs jsonb;
begin
  if old.status is distinct from 'CLOSED' and new.status = 'CLOSED' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', tab.id,
          'tableId', tab.table_id,
          'name', tab.name
        ) order by tab.opened_at, tab.id
      ),
      '[]'::jsonb
    )
    into open_tabs
    from public.table_tabs as tab
    where tab.cash_register_session_id = new.id
      and tab.status = 'OPEN';

    if jsonb_array_length(open_tabs) > 0 then
      raise exception 'CASH_REGISTER_OPEN_TABS'
        using errcode = 'P0001', detail = open_tabs::text;
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', orders.id,
          'type', orders.type,
          'orderStatus', orders.status,
          'total', orders.total,
          'paymentStatus', payment.status,
          'paymentMethod', payment.method
        ) order by orders.created_at asc
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
        using errcode = 'P0001', detail = pending_orders::text;
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

-- Conferência automática pós-migração: falha e reverte tudo se houver pedido
-- ativo de mesa sem comanda ou mesa ocupada sem comanda aberta.
do $$
begin
  if exists (
    select 1 from public.orders
    where type = 'DINE_IN'
      and status in ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED')
      and (table_id is null or table_tab_id is null)
  ) then
    raise exception 'MIGRATION_LEFT_ACTIVE_ORDER_WITHOUT_TAB';
  end if;

  if exists (
    select 1 from public.tables as table_row
    where table_row.status = 'OCCUPIED'
      and not exists (
        select 1 from public.table_tabs as tab
        where tab.table_id = table_row.id and tab.status = 'OPEN'
      )
  ) then
    raise exception 'MIGRATION_LEFT_OCCUPIED_TABLE_WITHOUT_TAB';
  end if;
end;
$$;

commit;

-- CONSULTA DE CONFERÊNCIA PARA RODAR ANTES E DEPOIS DA MIGRAÇÃO.
-- O bloco funciona nos dois esquemas. Antes, informa os números legados; depois,
-- os dois últimos números precisam ser zero. Ele não altera dados.
-- do $$
-- declare
--   v_active_orders integer;
--   v_occupied_tables integer;
--   v_orphan_active_orders integer := null;
--   v_occupied_without_open_tab integer := null;
-- begin
--   select count(*) into v_active_orders
--   from public.orders
--   where type = 'DINE_IN'
--     and status in ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED');
--
--   select count(*) into v_occupied_tables
--   from public.tables where status = 'OCCUPIED';
--
--   if to_regclass('public.table_tabs') is not null
--      and exists (
--        select 1 from information_schema.columns
--        where table_schema = 'public' and table_name = 'orders'
--          and column_name = 'table_tab_id'
--      ) then
--     execute $q$
--       select count(*) from public.orders
--       where type = 'DINE_IN'
--         and status in ('NEW', 'IN_PROGRESS', 'READY', 'DELIVERED')
--         and (table_id is null or table_tab_id is null)
--     $q$ into v_orphan_active_orders;
--
--     execute $q$
--       select count(*)
--       from public.tables as table_row
--       where table_row.status = 'OCCUPIED'
--         and not exists (
--           select 1 from public.table_tabs as tab
--           where tab.table_id = table_row.id and tab.status = 'OPEN'
--         )
--     $q$ into v_occupied_without_open_tab;
--   end if;
--
--   raise notice 'Pedidos ativos de mesa: %', v_active_orders;
--   raise notice 'Mesas ocupadas: %', v_occupied_tables;
--   raise notice 'Pedidos ativos órfãos (zero depois): %', v_orphan_active_orders;
--   raise notice 'Mesas ocupadas sem comanda aberta (zero depois): %',
--     v_occupied_without_open_tab;
-- end;
-- $$;
