-- Recovery for migration 20261106120000_create_first_admin.sql (Etapa 1B.3).
--
-- The migration only adds a function used by `npm run provision -- admin`.
-- The application never calls it, and dropping it does not change users or
-- any other data. Without it, the provisioning admin command fails (the
-- migration check stops it first), so recreate the first administrator only
-- after the migration is applied again.
--
-- After running this script on a database whose CLI history records the
-- version, also run:
--   npx supabase migration repair --status reverted 20261106120000 --linked
--
-- NOT a migration: never place this file in backend/supabase/migrations/.
begin;

drop function if exists public.create_first_admin(text, text, text, text);

commit;
