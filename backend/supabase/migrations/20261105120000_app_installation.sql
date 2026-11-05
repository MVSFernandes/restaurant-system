-- Installation identity marker (Etapa 1B.1).
--
-- Each restaurant runs its own installation with its own database. The backend
-- refuses to start unless this one-row marker matches INSTALLATION_ID and
-- APP_ENV from its configuration, so a backend pointed at the wrong database
-- (another client, or production instead of development) does not run.
--
-- The migration is generic: it creates the table and leaves it EMPTY. Filling
-- it is an explicit, per-installation configuration step, run by an
-- administrator in the SQL editor, for example:
--
--   insert into public.app_installation (installation_id, environment)
--   values ('<installation-id>', 'development');
--
-- The backend never creates or changes the marker. The API roles can only read
-- it. Changing it later requires a deliberate session flag (see the trigger).
--
-- Business tables and data are not touched. Re-running the file is harmless.
begin;

set local search_path = public, extensions, pg_catalog;

create table if not exists public.app_installation (
  singleton boolean primary key default true,
  installation_id text not null,
  environment text not null,
  configured_at timestamp with time zone not null default now(),
  constraint app_installation_singleton_check check (singleton),
  -- Lowercase letters, digits and hyphens, 3 to 64 characters, no leading or
  -- trailing hyphen (e.g. "mesa-farta-dev").
  constraint app_installation_id_format_check
    check (installation_id ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  constraint app_installation_environment_check
    check (environment in ('development', 'test', 'staging', 'production'))
);

comment on table public.app_installation is
  'One-row identity of this installation. Filled once per installation; the backend checks it at startup and never writes it.';

-- The identity is stable: changing or removing it needs, in the same
-- transaction, `set local app.allow_installation_change = 'on'`.
create or replace function public.protect_app_installation()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if coalesce(current_setting('app.allow_installation_change', true), '') <> 'on' then
    raise exception 'APP_INSTALLATION_IS_STABLE'
      using errcode = 'P0001',
            hint = 'Run set local app.allow_installation_change = ''on'' in the same transaction to change it on purpose.';
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_protect_app_installation on public.app_installation;
create trigger trg_protect_app_installation
  before update or delete on public.app_installation
  for each row execute function public.protect_app_installation();

alter table public.app_installation enable row level security;

-- Explicit permissions: read-only for the backend key, nothing for the others.
revoke all on table public.app_installation from public, anon, authenticated, service_role;
grant select on table public.app_installation to service_role;
revoke all on function public.protect_app_installation() from public, anon, authenticated, service_role;

commit;
