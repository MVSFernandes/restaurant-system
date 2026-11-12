// Isolated PostgreSQL (PGlite, in memory) test for migration
// 20261112150000_order_delivered_at.sql on top of every previous active
// migration, plus its recovery script.
//
// PGlite has one connection: the row lock between two simultaneous
// confirmations is shown against a real server (local Supabase validation,
// pg_blocking_pids). Here: first time kept on repeat, both flow orders,
// payment and stock untouched, canceled refused, no backfill, recovery.
//
// From the repository root (helpers in the same ignored folder as the other
// *-sql.cjs tests; install both in ONE command, a --no-save install prunes the other):
//   npm install --prefix backend/node_modules/.stock-validation --no-package-lock --no-save @electric-sql/pglite@0.5.8 pg@8.23.1
//   node backend/tests/order-delivery-sql.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PGLITE = path.join(__dirname, '../node_modules/.stock-validation/node_modules/@electric-sql/pglite');
const { PGlite } = require(PGLITE);
const { pg_trgm } = require(path.join(PGLITE, 'dist/contrib/pg_trgm.cjs'));
const { pgcrypto } = require(path.join(PGLITE, 'dist/contrib/pgcrypto.cjs'));

const MIGRATIONS = path.join(__dirname, '../supabase/migrations');
const PREVIOUS = [
  '20261003130000_base_schema.sql',
  '20261003131000_base_functions.sql',
  '20261003132000_base_runtime.sql',
  '20261104220000_public_orders_without_operator.sql',
  '20261104221000_order_stock_movements_atomic_cancel.sql',
  '20261105120000_app_installation.sql',
  '20261106120000_create_first_admin.sql',
  '20261109120000_restaurant_brand_color.sql',
  '20261112120000_order_promised_at.sql',
];
const MIGRATION = '20261112150000_order_delivered_at.sql';
const ROLLBACK = path.join(__dirname, '../supabase/rollbacks/20261112150000_order_delivered_at_down.sql');

const read = (file) => fs.readFileSync(file, 'utf8');

async function previousDatabase() {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  for (const file of PREVIOUS) await db.exec(read(path.join(MIGRATIONS, file)));
  await db.exec(`
    insert into restaurant_config (id, name) values ('config-1', 'Casa Fictícia');
    insert into users (id, name, email, password, role) values
      ('admin-1', 'Admin', 'admin@example.test', 'x', 'ADMIN'),
      ('waiter-1', 'Garçom', 'waiter@example.test', 'x', 'WAITER');
    insert into cash_register_sessions (id, status, opening_amount, opened_by_id)
      values ('session-1', 'OPEN', 0, 'admin-1');
    insert into categories (id, name) values ('food', 'Lanches');
    insert into products (id, name, price, category_id) values ('burger', 'Hambúrguer', 30, 'food');
    insert into stock_items (id, name, quantity, unit) values ('bread', 'Pão', 100, 'UN');
    insert into product_stock_items (id, quantity, product_id, stock_item_id) values ('link-1', 1, 'burger', 'bread');
    insert into tables (id, number, status) values ('table-4', 4, 'AVAILABLE');
    insert into customers (id, name, credit_limit) values ('customer-1', 'Cliente Fiado', 1000);
  `);
  return db;
}

const applyMigration = (db) => db.exec(read(path.join(MIGRATIONS, MIGRATION)));
const applyRollback = (db) => db.exec(read(ROLLBACK));

const orderJson = (id, type, overrides = {}) => ({
  id, type, source: 'PDV', status: 'NEW', total: 30, delivery_fee: 0,
  customer_name: 'Cliente Fictício', user_id: 'admin-1', waiter_id: null,
  cash_register_session_id: 'session-1', table_id: null, table_tab_id: null,
  ...overrides,
});

// Same call the backend makes (create_order_with_stock), with a PENDING payment.
async function create(db, id, type = 'DELIVERY', overrides = {}) {
  const items = [{ id: `${id}-i1`, order_id: id, product_id: 'burger', product_name: 'Hambúrguer', quantity: 1, price: 30 }];
  const payment = { id: `${id}-pay`, order_id: id, method: 'PIX', amount: 30, status: 'PENDING', transaction_id: null };
  await db.query(
    'select public.create_order_with_stock($1::jsonb, $2::jsonb, $3::jsonb)',
    [JSON.stringify(orderJson(id, type, overrides)), JSON.stringify(items), JSON.stringify(payment)]
  );
}
const setStatus = (db, id, status) => db.query('update orders set status = $2 where id = $1', [id, status]);
const confirm = async (db, id) => (await db.query('select public.confirm_order_delivery($1) as r', [id])).rows[0].r;
const orderOf = async (db, id) => (await db.query(
  'select status, delivered_at, updated_at from orders where id = $1', [id])).rows[0];
const paymentsOf = async (db, id) => (await db.query(
  'select id, method, amount::text, status, created_at from payments where order_id = $1 order by id', [id])).rows;
const stockOf = async (db) => ({
  items: (await db.query('select id, quantity::text from stock_items order by id')).rows,
  movements: (await db.query('select count(*)::int as n from order_stock_movements')).rows[0].n,
});
// The confirmation's now() is the transaction start; separate statements here
// are separate transactions, so a later call has a later clock.
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });
const withDb = (run) => async () => {
  const db = await previousDatabase();
  try { await run(db); } finally { await db.close(); }
};

scenario('applies on the 9 previous migrations: nullable column without default, no backfill for any status', withDb(async (db) => {
  for (const [id, status] of [['old-ready', 'READY'], ['old-delivered', 'DELIVERED'], ['old-finished', 'FINISHED']]) {
    await create(db, id);
    await setStatus(db, id, status);
  }
  await db.query("update payments set status = 'PAID' where order_id = 'old-finished'");
  await applyMigration(db);
  const column = (await db.query(`select data_type, is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'delivered_at'`)).rows[0];
  assert.deepEqual(column, { data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null });
  assert.equal(Number((await db.query('select count(*) from orders where delivered_at is not null')).rows[0].count), 0);
}));

const trackedOf = async (db, id) => (await db.query('select delivery_tracked from orders where id = $1', [id])).rows[0].delivery_tracked;
const createDefinition = async (db) => (await db.query(
  "select pg_get_functiondef('public.create_order_with_stock(jsonb, jsonb, jsonb)'::regprocedure) as def"
)).rows[0].def.replace(/\r\n/g, '\n');

scenario('delivery_tracked: existing orders NULL, new orders true (also with the previous p_order and a raw insert); a sent value is ignored', withDb(async (db) => {
  await create(db, 'before');
  await applyMigration(db);
  const column = (await db.query(`select data_type, is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'delivery_tracked'`)).rows[0];
  assert.deepEqual(column, { data_type: 'boolean', is_nullable: 'YES', column_default: 'true' });
  assert.equal(await trackedOf(db, 'before'), null);
  // Same p_order the previous backend sends (no delivery_tracked key).
  await create(db, 'after');
  assert.equal(await trackedOf(db, 'after'), true);
  await create(db, 'sent-false', 'DELIVERY', { delivery_tracked: false });
  assert.equal(await trackedOf(db, 'sent-false'), true, 'p_order cannot opt out');
  // A plain insert that omits the column gets the default.
  await db.query(`insert into orders (id, type, total, cash_register_session_id, user_id)
    values ('raw', 'TAKE_AWAY', 1, 'session-1', 'admin-1')`);
  assert.equal(await trackedOf(db, 'raw'), true);
}));

scenario('why the function writes it: jsonb_populate_record yields an explicit NULL that the default does not replace', withDb(async (db) => {
  await applyMigration(db);
  const row = (await db.query(`select (jsonb_populate_record(null::public.orders, '{"id":"x"}'::jsonb)).delivery_tracked as v`)).rows[0];
  assert.equal(row.v, null);
}));

scenario('create_order_with_stock changes only by the delivery_tracked key; grants unchanged', withDb(async (db) => {
  const before = await createDefinition(db);
  await applyMigration(db);
  const after = await createDefinition(db);
  assert.equal(
    after,
    before.replace(
      "'promised_at', v_promised_at))",
      "'promised_at', v_promised_at,\n                                  'delivery_tracked', true))"
    )
  );
}));

scenario('an older FINISHED order (NULL) is refused under the lock; an older READY order still confirms normally', withDb(async (db) => {
  await create(db, 'old-finished');
  await create(db, 'old-ready');
  await db.query("update payments set status = 'PAID' where order_id = 'old-finished'");
  await setStatus(db, 'old-finished', 'FINISHED');
  await setStatus(db, 'old-ready', 'READY');
  await applyMigration(db);
  const before = await orderOf(db, 'old-finished');
  const payments = await paymentsOf(db, 'old-finished');
  await assert.rejects(confirm(db, 'old-finished'), /ORDER_DELIVERY_NOT_TRACKED/);
  assert.deepEqual(await orderOf(db, 'old-finished'), before);
  assert.deepEqual(await paymentsOf(db, 'old-finished'), payments);
  await confirm(db, 'old-ready');
  const ready = await orderOf(db, 'old-ready');
  assert.equal(ready.status, 'DELIVERED');
  assert.ok(ready.delivered_at);
}));

scenario('FINISHED without any payment (status set directly) is eligible when tracked; the payment stays as it was', withDb(async (db) => {
  await applyMigration(db);
  await create(db, 'unpaid');
  await setStatus(db, 'unpaid', 'FINISHED');
  await confirm(db, 'unpaid');
  const row = await orderOf(db, 'unpaid');
  assert.equal(row.status, 'FINISHED');
  assert.ok(row.delivered_at);
  assert.equal((await paymentsOf(db, 'unpaid'))[0].status, 'PENDING');
}));

scenario('delivered before payment: READY -> DELIVERED with the database clock; pending payment and stock untouched', withDb(async (db) => {
  await applyMigration(db);
  await create(db, 'o1');
  await setStatus(db, 'o1', 'READY');
  const payments = await paymentsOf(db, 'o1');
  const stock = await stockOf(db);
  const result = await confirm(db, 'o1');
  assert.equal(result.already_delivered, false);
  const row = await orderOf(db, 'o1');
  assert.equal(row.status, 'DELIVERED');
  assert.ok(row.delivered_at instanceof Date);
  assert.equal(new Date(result.order.delivered_at).getTime(), row.delivered_at.getTime());
  assert.deepEqual(await paymentsOf(db, 'o1'), payments);
  assert.equal(payments[0].status, 'PENDING');
  assert.deepEqual(await stockOf(db), stock);
}));

scenario('paid before delivery: FINISHED stays FINISHED, delivered_at set, payment and stock untouched', withDb(async (db) => {
  await applyMigration(db);
  await create(db, 'o2');
  await db.query("update payments set status = 'PAID' where order_id = 'o2'");
  await setStatus(db, 'o2', 'FINISHED');
  assert.equal((await orderOf(db, 'o2')).delivered_at, null, 'paying does not confirm');
  const payments = await paymentsOf(db, 'o2');
  const stock = await stockOf(db);
  await confirm(db, 'o2');
  const row = await orderOf(db, 'o2');
  assert.equal(row.status, 'FINISHED');
  assert.ok(row.delivered_at);
  assert.deepEqual(await paymentsOf(db, 'o2'), payments);
  assert.deepEqual(await stockOf(db), stock);
}));

scenario('repeating keeps the first time and does not update the row (DELIVERED and FINISHED)', withDb(async (db) => {
  await applyMigration(db);
  await create(db, 'o3');
  await setStatus(db, 'o3', 'READY');
  await confirm(db, 'o3');
  const first = await orderOf(db, 'o3');
  await tick();
  assert.equal((await confirm(db, 'o3')).already_delivered, true);
  assert.deepEqual(await orderOf(db, 'o3'), first);
  // Paid afterwards: still the first time, and confirming again keeps it.
  await db.query("update payments set status = 'PAID' where order_id = 'o3'");
  await setStatus(db, 'o3', 'FINISHED');
  const finished = await orderOf(db, 'o3');
  await tick();
  assert.equal((await confirm(db, 'o3')).already_delivered, true);
  assert.deepEqual(await orderOf(db, 'o3'), finished);
  assert.equal(finished.delivered_at.getTime(), first.delivered_at.getTime());
}));

scenario('canceled is refused and nothing changes; unknown order is P0002', withDb(async (db) => {
  await applyMigration(db);
  await create(db, 'o4');
  await db.query("select public.cancel_order_with_stock('o4')");
  const before = await orderOf(db, 'o4');
  const stock = await stockOf(db);
  await assert.rejects(confirm(db, 'o4'), /ORDER_DELIVERY_CANCELED/);
  assert.deepEqual(await orderOf(db, 'o4'), before);
  assert.deepEqual(await stockOf(db), stock);
  await assert.rejects(confirm(db, 'missing'), (error) => error.code === 'P0002');
}));

scenario('legacy DELIVERED order keeps NULL when confirmed again (time unknown)', withDb(async (db) => {
  await create(db, 'legacy');
  await setStatus(db, 'legacy', 'DELIVERED');
  await applyMigration(db);
  const before = await orderOf(db, 'legacy');
  assert.equal((await confirm(db, 'legacy')).already_delivered, true);
  assert.deepEqual(await orderOf(db, 'legacy'), before);
}));

scenario('pay_order_with_credit and close_table_tab never write delivered_at', withDb(async (db) => {
  await applyMigration(db);
  await create(db, 'credit');
  await setStatus(db, 'credit', 'READY');
  await db.query("delete from payments where order_id = 'credit'");
  await db.query("select public.pay_order_with_credit('credit', 'customer-1', 'ctx-1', 'pay-credit', 'CREDIT', 30, null)");
  assert.deepEqual(await orderOf(db, 'credit').then((r) => [r.status, r.delivered_at]), ['FINISHED', null]);

  // Mesa já ocupada, depois a comanda aberta nela.
  await db.exec(`
    insert into tables (id, number, status) values ('table-9', 9, 'OCCUPIED');
    insert into table_tabs (id, table_id, cash_register_session_id, name, opened_by_id)
      values ('tab-1', 'table-9', 'session-1', 'Comanda', 'waiter-1');`);
  const tabOrder = { table_id: 'table-9', table_tab_id: 'tab-1', waiter_id: 'waiter-1', source: 'WAITER' };
  await create(db, 'tab-ready', 'DINE_IN', tabOrder);
  await create(db, 'tab-delivered', 'DINE_IN', tabOrder);
  await setStatus(db, 'tab-ready', 'READY');
  await setStatus(db, 'tab-delivered', 'READY');
  await confirm(db, 'tab-delivered');
  const deliveredAt = (await orderOf(db, 'tab-delivered')).delivered_at;
  const stock = await stockOf(db);
  await db.query("select public.close_table_tab('tab-1', 'CASH', null, 'admin-1')");
  assert.deepEqual(await orderOf(db, 'tab-ready').then((r) => [r.status, r.delivered_at]), ['FINISHED', null]);
  const delivered = await orderOf(db, 'tab-delivered');
  assert.equal(delivered.status, 'FINISHED');
  assert.equal(delivered.delivered_at.getTime(), deliveredAt.getTime());
  assert.deepEqual(await stockOf(db), stock);
  // Paid by the tab, handed over afterwards: the confirmation is still possible.
  await confirm(db, 'tab-ready');
  assert.ok((await orderOf(db, 'tab-ready')).delivered_at);
  assert.equal((await orderOf(db, 'tab-ready')).status, 'FINISHED');
}));

scenario('only service_role executes the function; previous functions keep their grants', withDb(async (db) => {
  await applyMigration(db);
  const grants = (await db.query(`select grantee from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'confirm_order_delivery' and privilege_type = 'EXECUTE'
    order by grantee`)).rows.map((row) => row.grantee);
  assert.equal(grants.includes('anon'), false);
  assert.equal(grants.includes('authenticated'), false);
  assert.ok(grants.includes('service_role'));
}));

scenario('re-running the migration keeps recorded values; recovery restores the previous function and drops both columns; re-apply works', withDb(async (db) => {
  const previousDefinition = await createDefinition(db);
  await create(db, 'older');
  await applyMigration(db);
  await create(db, 'kept');
  await setStatus(db, 'kept', 'READY');
  await confirm(db, 'kept');
  const before = await orderOf(db, 'kept');
  await applyMigration(db);
  assert.deepEqual(await orderOf(db, 'kept'), before);
  assert.equal(await trackedOf(db, 'older'), null, 'a second run does not mark older orders');
  assert.equal(await trackedOf(db, 'kept'), true);

  await applyRollback(db);
  await applyRollback(db); // re-runnable
  assert.equal(await createDefinition(db), previousDefinition, 'body of 20261112120000 restored');
  const columns = (await db.query(`select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'`)).rows.map((row) => row.column_name);
  assert.equal(columns.includes('delivered_at'), false);
  assert.equal(columns.includes('delivery_tracked'), false);
  assert.equal(Number((await db.query("select count(*) from pg_proc where proname = 'confirm_order_delivery'")).rows[0].count), 0);
  assert.equal(
    (await db.query("select status from orders where id = 'kept'")).rows[0].status,
    'DELIVERED',
    'status is not changed by the recovery'
  );
  await create(db, 'after-rollback');
  await setStatus(db, 'after-rollback', 'DELIVERED');

  await applyMigration(db);
  assert.equal((await orderOf(db, 'kept')).delivered_at, null, 'times written before the recovery are lost (documented)');
  assert.equal(await trackedOf(db, 'kept'), null, 'every order existing at re-apply becomes not tracked (documented)');
  await create(db, 'after-reapply');
  assert.equal(await trackedOf(db, 'after-reapply'), true);
  await setStatus(db, 'after-reapply', 'READY');
  await confirm(db, 'after-reapply');
  assert.ok((await orderOf(db, 'after-reapply')).delivered_at);
}));

(async () => {
  let failed = 0;
  for (const { name, run } of scenarios) {
    try {
      await run();
      console.log(`ok - ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok - ${name}`);
      console.error(error);
    }
  }
  console.log(`\n${scenarios.length - failed}/${scenarios.length} scenarios passed`);
  process.exit(failed ? 1 : 0);
})();
