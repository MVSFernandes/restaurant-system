-- Reserve the sale before calling Focus, across both NF-e and NFC-e.
-- Existing conflicting active documents must be reconciled before applying this migration.
-- Never delete or silently cancel fiscal records to resolve a conflict.
begin;
create unique index if not exists invoices_active_order_idx
  on public.invoices(order_id)
  where order_id is not null and status in ('pending', 'processing', 'authorized');
drop index if exists public.invoices_active_nfce_order_idx;
commit;
