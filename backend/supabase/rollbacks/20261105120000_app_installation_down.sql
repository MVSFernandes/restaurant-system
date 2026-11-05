-- Recovery for migration 20261105120000_app_installation.sql (Etapa 1B.1).
--
-- The migration is additive: the previous backend ignores app_installation, so
-- keeping the table is always safe. Use this script only to return the schema
-- to the state before the migration.
--
-- Order matters for installations that already run the 1B.1 backend:
--   1. Deploy the previous backend version (it does not read the marker).
--   2. Run this script.
-- A 1B.1 backend that restarts after this script refuses to start with
-- "a tabela app_installation não existe" until the migration is applied again.
--
-- The marker row (installation id and environment) is lost; write it down
-- before running, so it can be configured again with the same values.
--
-- NOT a migration: never place this file in backend/supabase/migrations/.
begin;

-- Dropping the table also drops its trigger; the script can be re-run.
drop table if exists public.app_installation;
drop function if exists public.protect_app_installation();

commit;
