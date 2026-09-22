// Isolated PostgreSQL integration test. From the repository root:
// npm install --prefix backend/node_modules/.stock-validation --no-package-lock --no-save @electric-sql/pglite
// node backend/tests/cash-register-sql.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../node_modules/.stock-validation/node_modules/@electric-sql/pglite');

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.cash_register_sessions (
        id text primary key,
        status text not null
      );
      create table public.orders (
        id text primary key,
        cash_register_session_id text,
        type text not null,
        status text not null,
        total numeric not null,
        created_at timestamptz not null default now()
      );
      create table public.payments (
        id text primary key,
        order_id text not null references public.orders(id),
        method text not null,
        status text not null,
        amount numeric not null
      );
      alter table public.payments
        add constraint payments_status_check
        check (status in ('PENDING', 'PAID', 'FAILED', 'REFUNDED'));

      insert into public.cash_register_sessions(id, status)
      values ('session', 'OPEN');
      insert into public.orders(id, cash_register_session_id, type, status, total)
      values ('already-canceled', 'session', 'DELIVERY', 'CANCELED', 17.75);
      insert into public.payments(id, order_id, method, status, amount)
      values ('already-canceled-payment', 'already-canceled', 'PIX', 'PENDING', 17.75);
    `);

    const migration = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260922120000_cancel_pending_payments_with_orders.sql'),
      'utf8'
    );
    await db.exec(migration);

    const backfilled = await db.query(
      "select status from public.payments where id = 'already-canceled-payment'"
    );
    assert.equal(backfilled.rows[0].status, 'CANCELED');

    await db.exec("update public.cash_register_sessions set status = 'CLOSED' where id = 'session'");
    await db.exec("update public.cash_register_sessions set status = 'OPEN' where id = 'session'");

    await db.exec(`
      insert into public.orders(id, cash_register_session_id, type, status, total)
      values ('active', 'session', 'DELIVERY', 'NEW', 20);
      insert into public.payments(id, order_id, method, status, amount)
      values ('active-payment', 'active', 'PIX', 'PENDING', 20);
    `);

    await assert.rejects(
      db.exec("update public.cash_register_sessions set status = 'CLOSED' where id = 'session'"),
      /CASH_REGISTER_PENDING_ORDERS/
    );

    await db.exec("update public.orders set status = 'CANCELED' where id = 'active'");
    const canceled = await db.query(
      "select status from public.payments where id = 'active-payment'"
    );
    assert.equal(canceled.rows[0].status, 'CANCELED');

    await db.exec("update public.cash_register_sessions set status = 'CLOSED' where id = 'session'");
    const closed = await db.query(
      "select status from public.cash_register_sessions where id = 'session'"
    );
    assert.equal(closed.rows[0].status, 'CLOSED');

    console.log('PASS: canceled orders resolve pending payments and never block cash close');
    console.log('PASS: genuinely pending orders still block cash close');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
