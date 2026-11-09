-- Primary brand color per installation (Etapa 1B.7).
--
-- Adds an optional column to the one-row restaurant_config. NULL means "use the
-- default orange" that the frontend ships in index.css, so existing
-- installations keep their current look until an ADMIN picks a color in
-- Settings → Restaurant. The migration writes no data.
--
-- Class M1 (RELEASES.md §2): a new nullable column without a default. The
-- previous application version lists its columns explicitly when reading and
-- writing restaurant_config, so it neither reads nor overwrites this one.
--
-- The check only guards the format (#rrggbb, lowercase). The contrast rules for
-- the light and dark themes are enforced by the backend (src/utils/brandColor.ts)
-- before saving, because they depend on the application's palette.
--
-- Re-running the file is harmless. Recovery:
-- backend/supabase/rollbacks/20261109120000_restaurant_brand_color_down.sql
begin;

set local search_path = public, extensions, pg_catalog;

alter table public.restaurant_config
  add column if not exists brand_primary_color text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_config_brand_primary_color_format_check'
      and conrelid = 'public.restaurant_config'::regclass
  ) then
    alter table public.restaurant_config
      add constraint restaurant_config_brand_primary_color_format_check
      check (brand_primary_color is null or brand_primary_color ~ '^#[0-9a-f]{6}$');
  end if;
end;
$$;

comment on column public.restaurant_config.brand_primary_color is
  'Primary brand color (#rrggbb, lowercase) chosen by an ADMIN. NULL = default palette.';

commit;
