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
