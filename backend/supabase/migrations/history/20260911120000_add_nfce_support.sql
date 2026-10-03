-- NFC-e can be issued to an unidentified consumer.
alter table public.invoices alter column customer_id drop not null;

alter table public.invoices
  add column if not exists model text not null default '55'
  check (model in ('55', '65'));

alter table public.invoices
  add column if not exists consumer_document text,
  add column if not exists qrcode_url text;

alter table public.restaurant_config
  add column if not exists nfce_enabled boolean not null default false;

create index if not exists invoices_order_model_created_idx
  on public.invoices(order_id, model, created_at desc);

create unique index if not exists invoices_active_nfce_order_idx
  on public.invoices(order_id)
  where model = '65'
    and status in ('pending', 'processing', 'authorized');
