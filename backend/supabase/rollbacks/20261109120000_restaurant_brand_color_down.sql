-- Recovery for migration 20261109120000_restaurant_brand_color.sql (Etapa 1B.7).
--
-- The migration is additive: the previous application version ignores
-- brand_primary_color, so keeping the column is always safe (RELEASES.md §6,
-- case D). Use this script only to return the schema to the state before the
-- migration.
--
-- Order matters for installations that already run the 1B.7 version:
--   1. Deploy the previous application version (it does not read the column).
--   2. Run this script.
-- A 1B.7 backend running after this script fails to read restaurant_config
-- ("column brand_primary_color does not exist") until the migration is applied
-- again.
--
-- The chosen color is lost; write it down before running if it should be set
-- again later. Nothing else in restaurant_config changes.
--
-- NOT a migration: never place this file in backend/supabase/migrations/.
begin;

-- Dropping the column also drops its check constraint; the script can be re-run.
alter table public.restaurant_config drop column if exists brand_primary_color;

commit;
