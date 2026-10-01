begin;

-- The former UI could mark a table as occupied without opening a tab. Active
-- dine-in orders already received an open tab in the table-tabs migration, and
-- subsequent legacy inserts are covered by validate_order_table_tab. Therefore
-- these remaining rows have no open account to preserve and can be released.
create temporary table released_occupied_tables on commit preserve rows as
select table_row.id, table_row.number
from public.tables as table_row
where table_row.status = 'OCCUPIED'
  and not exists (
    select 1
    from public.table_tabs as tab
    where tab.table_id = table_row.id
      and tab.status = 'OPEN'
  );

update public.tables as table_row
set status = 'AVAILABLE'
where table_row.id in (
  select released.id
  from released_occupied_tables as released
);

create or replace function public.require_open_tab_for_occupied_table()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_id text;
  v_table_ids text[];
begin
  if tg_table_name = 'tables' then
    v_table_ids := array[coalesce(new.id, old.id)];
  elsif tg_op = 'INSERT' then
    v_table_ids := array[new.table_id];
  elsif tg_op = 'DELETE' then
    v_table_ids := array[old.table_id];
  elsif old.table_id is distinct from new.table_id then
    v_table_ids := array[old.table_id, new.table_id];
  else
    v_table_ids := array[new.table_id];
  end if;

  foreach v_table_id in array v_table_ids loop
    if exists (
      select 1
      from public.tables as table_row
      where table_row.id = v_table_id
        and table_row.status = 'OCCUPIED'
        and not exists (
          select 1
          from public.table_tabs as tab
          where tab.table_id = table_row.id
            and tab.status = 'OPEN'
        )
    ) then
      raise exception 'TABLE_OCCUPIED_REQUIRES_OPEN_TAB'
        using errcode = 'P0001';
    end if;
  end loop;

  return null;
end;
$$;

drop trigger if exists trg_require_open_tab_for_occupied_table
  on public.tables;

create constraint trigger trg_require_open_tab_for_occupied_table
after insert or update of status on public.tables
deferrable initially deferred
for each row
execute function public.require_open_tab_for_occupied_table();

drop trigger if exists trg_keep_occupied_table_with_open_tab
  on public.table_tabs;

create constraint trigger trg_keep_occupied_table_with_open_tab
after insert or update of table_id, status or delete on public.table_tabs
deferrable initially deferred
for each row
execute function public.require_open_tab_for_occupied_table();

commit;

-- Supabase's SQL editor displays SELECT results, but not RAISE NOTICE output.
-- This reports the repaired rows and proves the invariant after installation.
select
  (select count(*)::integer from released_occupied_tables) as released_table_count,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('id', released.id, 'number', released.number)
        order by released.number, released.id
      )
      from released_occupied_tables as released
    ),
    '[]'::jsonb
  ) as released_tables,
  not exists (
    select 1
    from public.tables as table_row
    where table_row.status = 'OCCUPIED'
      and not exists (
        select 1
        from public.table_tabs as tab
        where tab.table_id = table_row.id
          and tab.status = 'OPEN'
      )
  ) as invariant_satisfied,
  (
    select count(*)::integer
    from public.tables as table_row
    where table_row.status = 'OCCUPIED'
      and not exists (
        select 1
        from public.table_tabs as tab
        where tab.table_id = table_row.id
          and tab.status = 'OPEN'
      )
  ) as remaining_invalid_table_count,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object('id', table_row.id, 'number', table_row.number)
        order by table_row.number, table_row.id
      )
      from public.tables as table_row
      where table_row.status = 'OCCUPIED'
        and not exists (
          select 1
          from public.table_tabs as tab
          where tab.table_id = table_row.id
            and tab.status = 'OPEN'
        )
    ),
    '[]'::jsonb
  ) as remaining_invalid_tables;