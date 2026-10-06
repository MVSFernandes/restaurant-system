alter table public.restaurant_config
  add column if not exists nfce_group_items boolean not null default false,
  add column if not exists nfce_grouped_item_description text not null default 'REFEICAO';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurant_config_nfce_grouped_item_description_length_check'
      and conrelid = 'public.restaurant_config'::regclass
  ) then
    alter table public.restaurant_config
      add constraint restaurant_config_nfce_grouped_item_description_length_check
      check (length(trim(nfce_grouped_item_description)) between 1 and 120);
  end if;
end $$;
