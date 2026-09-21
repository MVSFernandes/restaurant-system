-- Freeze the product name on each sale so historical records do not change
-- when the current catalog is renamed or a product is removed.
alter table public.order_items
  add column if not exists product_name text;

update public.order_items as item
set product_name = coalesce(
  (
    select nullif(btrim(product.name), '')
    from public.products as product
    where product.id = item.product_id
  ),
  'Produto removido'
)
where item.product_name is null
   or btrim(item.product_name) = '';

alter table public.order_items
  alter column product_name set not null;

comment on column public.order_items.product_name is
  'Product name captured when the order item is created; immutable sales snapshot.';