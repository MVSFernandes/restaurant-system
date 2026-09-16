// Run: node tests/fiscal-document-sql.cjs <path-to-@electric-sql/pglite>
// Uses only an isolated in-memory PostgreSQL instance; never connects to Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(path.resolve(process.argv[2]));
(async () => {
  const db = new PGlite();
  await db.exec("create table public.invoices(id text primary key, order_id text, model text, status text); create unique index invoices_active_nfce_order_idx on public.invoices(order_id) where model = '65' and status in ('pending','processing','authorized');");
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260915120000_exclusive_order_fiscal_document.sql'), 'utf8'));
  await db.exec("insert into invoices values ('a','sale','65','pending')");
  await assert.rejects(db.exec("insert into invoices values ('b','sale','55','pending')"), error => error.code === '23505');
  await db.exec("update invoices set status='authorized' where id='a'");
  await assert.rejects(db.exec("insert into invoices values ('b','sale','55','pending')"), error => error.code === '23505');
  await db.exec("update invoices set status='error' where id='a'; insert into invoices values ('b','sale','55','pending')");
  await assert.rejects(db.exec("update invoices set status='authorized' where id='a'"), error => error.code === '23505');
  await db.exec("update invoices set status='canceled' where id='b'; insert into invoices values ('c','sale','65','authorized')");
  const rows = await db.query("select * from invoices where status in ('pending','processing','authorized')");
  assert.equal(rows.rows.length, 1);
  await db.close();
  console.log('Fiscal exclusivity migration: insert/update guards, retries and model switching passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
