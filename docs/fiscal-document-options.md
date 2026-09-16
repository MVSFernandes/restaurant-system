# Fiscal document options

Apply backend/supabase/migrations/20260915120000_exclusive_order_fiscal_document.sql in Supabase before testing this branch. It enforces one pending, processing or authorized fiscal document per order, across models 55 and 65. If historical records already conflict, the migration fails without deleting any fiscal records; reconcile them before retrying.

From a finished, paid order in PDV or history, open the fiscal document modal:

- NFC-e: leave the document blank, enter a valid CPF, or enter a valid CNPJ. The field selects the mask by length and validates check digits. Only the corresponding Focus recipient field is sent.
- NF-e: select an existing PJ customer with complete fiscal data. This option is available even when NFC-e is disabled. Payment details and delivery fees are included. Orders originally paid on credit reuse their existing charge and recipient.
- Pending/processing documents are polled automatically. Authorized documents expose printing, XML, copy and WhatsApp; NFC-e also exposes its QR Code.
- An authorized or in-flight document prevents another model from being issued for the same sale, including concurrent requests. Rejected/canceled attempts can be replaced with a fresh reference.

A timeout or server failure after sending to Focus keeps the sale reserved; check status using the same reference. An uncertain submission must be reconciled before issuing another document.

## Verification

Backend: npm run build; node --test -r ts-node/register/transpile-only tests/nfce.test.cjs tests/nfe-status.test.cjs

Frontend: npm run build; npm exec vitest -- run

Migration: node tests/fiscal-document-sql.cjs <path-to-@electric-sql/pglite> (isolated PostgreSQL; no Supabase connection).

The automated tests mock Focus responses. Real authorization must still be checked in homologation with the configured issuer and PJ recipient.

Focus recipient fields: https://doc.focusnfe.com.br/reference/emitir_nfce

## Checkout fixes

Apply backend/supabase/migrations/20260915150000_separate_order_idempotency_key.sql before updating the backend. New orders use 24-character CUIDs. The normalized, scoped idempotency key is stored separately in orders.idempotency_key, with a unique index and transaction lock. Existing 64-character order IDs are preserved and backfilled as their stored key so old retries still resolve. Failed creation rolls back all order and stock writes.

The former limiter shared 500 requests per IP over 15 minutes across the entire API. No payment-dependent effect loop was found; payment confirmation refreshed nine resources and each paid-order row separately queried its invoice. Payment confirmation now refreshes only orders, tables and cash; invoice rows share sequential batches of up to 100 orders.

Verified internal users have separate one-minute budgets per resource and read/write class (300 reads, 60 writes). Public/unverified requests retain an IP budget of 120 per minute. Health checks are outside these budgets. A fiscal polling limit cannot consume the orders or cash-register budget. The client shows a Portuguese warning, respects Retry-After, spaces resumed reads and retries safe reads at most twice; payments and fiscal issues are never automatically retried on 429. Token refresh is shared across concurrent 401s and a temporary rate limit does not log the operator out.

The NF-e modal now offers Cadastrar cliente using the same customer fields and serialization as the credit page. It starts with PJ selected, validates the fiscal fields, and selects the saved recipient while keeping the order modal open.

Additional checks: node --test -r ts-node/register/transpile-only tests/rate-limit.test.cjs tests/order-stock.test.cjs; node tests/order-stock-sql.cjs; npm exec vitest -- run.

Manual regression: receive payments through PIX, cash and cards; trigger a read limit and wait for automatic recovery; create a PJ inside the invoice modal and issue against that recipient; retry an order with the same key and verify a single short-ID order and one stock deduction.
