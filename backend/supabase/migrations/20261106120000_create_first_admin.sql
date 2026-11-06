-- Atomic creation of the first administrator (Etapa 1B.3).
--
-- Provisioning (`npm run provision -- admin`, backend/PROVISIONING.md) creates
-- the first ADMIN of a new installation only while public.users is EMPTY. A
-- count followed by an insert through the API is not atomic: two concurrent
-- runs could both see zero users and create two accounts. This function does
-- the check and the insert in one transaction, under a lock that serializes
-- concurrent calls, so the second call sees the first account and is refused.
--
-- It does not restrict anything else: administrators keep creating users
-- (including other ADMINs) through the application as before. The function
-- never updates, replaces or promotes an existing account.
--
-- The password arrives already hashed with bcrypt by the provisioning command
-- (same settings as the application); the function never sees the password and
-- never echoes the hash in an error. Only service_role may execute it.
--
-- Business data is not touched. Re-running the file is harmless.
begin;

set local search_path = public, extensions, pg_catalog;

create or replace function public.create_first_admin(
  p_id text,
  p_name text,
  p_email text,
  p_password_hash text
)
 returns text
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if p_id is null or length(trim(p_id)) = 0
     or p_name is null or length(trim(p_name)) = 0
     or p_email is null or length(trim(p_email)) = 0 then
    raise exception 'FIRST_ADMIN_INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_password_hash is null or p_password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' then
    raise exception 'FIRST_ADMIN_INVALID_HASH' using errcode = 'P0001';
  end if;

  -- SHARE ROW EXCLUSIVE conflicts with itself and with the ROW EXCLUSIVE lock
  -- of any INSERT/UPDATE/DELETE on users: concurrent calls (and concurrent
  -- user writes) wait here, and the check below sees what they committed.
  lock table public.users in share row exclusive mode;

  if exists (select 1 from public.users) then
    raise exception 'FIRST_ADMIN_USERS_ALREADY_EXIST' using errcode = 'P0001';
  end if;

  insert into public.users (id, name, email, password, role)
  values (p_id, p_name, p_email, p_password_hash, 'ADMIN');

  return p_id;
end;
$function$;

comment on function public.create_first_admin(text, text, text, text) is
  'Creates the first ADMIN only while public.users is empty (provisioning). Never updates or promotes accounts.';

revoke all on function public.create_first_admin(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.create_first_admin(text, text, text, text) to service_role;

commit;
