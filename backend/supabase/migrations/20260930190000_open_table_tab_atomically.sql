begin;

-- Abre a primeira comanda e ocupa a mesa na mesma transação. O bloqueio da
-- linha da mesa serializa duas tentativas concorrentes e impede o estado
-- OCCUPIED sem comanda aberta.
create or replace function public.open_table_tab(
  p_id text,
  p_table_id text,
  p_cash_register_session_id text,
  p_name text,
  p_opened_by_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.tables%rowtype;
  v_session public.cash_register_sessions%rowtype;
  v_tab public.table_tabs%rowtype;
  v_name text := btrim(p_name);
begin
  if nullif(v_name, '') is null then
    raise exception 'TABLE_TAB_NAME_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_table
  from public.tables
  where id = p_table_id
  for update;

  if not found then
    raise exception 'TABLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_table.status not in ('AVAILABLE', 'OCCUPIED') then
    raise exception 'TABLE_NOT_AVAILABLE_FOR_TAB' using errcode = 'P0001';
  end if;

  select * into v_session
  from public.cash_register_sessions
  where id = p_cash_register_session_id
  for update;

  if not found or v_session.status <> 'OPEN' then
    raise exception 'CASH_REGISTER_CLOSED' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.table_tabs
    where table_id = p_table_id
      and status = 'OPEN'
      and lower(btrim(name)) = lower(v_name)
  ) then
    raise exception 'TABLE_TAB_NAME_ALREADY_OPEN' using errcode = 'P0001';
  end if;

  if v_table.status = 'AVAILABLE' then
    update public.tables
    set status = 'OCCUPIED'
    where id = p_table_id;
  end if;

  insert into public.table_tabs (
    id,
    table_id,
    cash_register_session_id,
    name,
    status,
    opened_by_id,
    closed_by_id,
    opened_at,
    closed_at,
    updated_at
  ) values (
    p_id,
    p_table_id,
    p_cash_register_session_id,
    v_name,
    'OPEN',
    p_opened_by_id,
    null,
    now(),
    null,
    now()
  )
  returning * into v_tab;

  return to_jsonb(v_tab);
end;
$$;

revoke all on function public.open_table_tab(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.open_table_tab(text, text, text, text, text)
  to service_role;

-- A visão do salão busca somente comandas abertas e as ordena pela abertura.
create index if not exists table_tabs_open_overview_idx
  on public.table_tabs(opened_at, table_id)
  where status = 'OPEN';

commit;
