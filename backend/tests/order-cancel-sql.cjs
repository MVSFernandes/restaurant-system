// Isolated PostgreSQL (PGlite, in memory) test for the order stock ledger.
// It loads the three real base migrations, demonstrates the legacy behaviour,
// applies the incremental migrations of this stage and checks create, edit,
// cancel, delete, the legacy transition, permissions and old-backend calls.
//
// From the repository root (same helper folder as the other *-sql.cjs tests;
// install both helpers in ONE command, a --no-save install prunes the other):
//   npm install --prefix backend/node_modules/.stock-validation --no-package-lock --no-save @electric-sql/pglite@0.5.8 pg@8.23.1
//   node backend/tests/order-cancel-sql.cjs
//
// PGlite has a single connection: these scenarios are sequential. Concurrency
// between independent connections is covered by order-cancel-concurrency-pg.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PGLITE = path.join(__dirname, '../node_modules/.stock-validation/node_modules/@electric-sql/pglite');
const { PGlite } = require(PGLITE);
const { pg_trgm } = require(path.join(PGLITE, 'dist/contrib/pg_trgm.cjs'));
const { pgcrypto } = require(path.join(PGLITE, 'dist/contrib/pgcrypto.cjs'));

const MIGRATIONS = path.join(__dirname, '../supabase/migrations');
const BASE_FILES = [
  '20261003130000_base_schema.sql',
  '20261003131000_base_functions.sql',
  '20261003132000_base_runtime.sql',
];
const INCREMENTAL_FILES = [
  '20261104220000_public_orders_without_operator.sql',
  '20261104221000_order_stock_movements_atomic_cancel.sql',
];

async function newDatabase() {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  // Same default grants a Supabase project gives to its API roles; as in
  // Supabase, service_role bypasses RLS (otherwise it would see no rows).
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  for (const file of BASE_FILES) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  await db.exec(`
    insert into users (id, name, email, password, role) values
      ('admin-1', 'Admin', 'admin@example.test', 'x', 'ADMIN'),
      ('waiter-1', 'Garçom', 'waiter@example.test', 'x', 'WAITER');
    insert into cash_register_sessions (id, status, opening_amount, opened_by_id)
      values ('session-1', 'OPEN', 0, 'admin-1');
    insert into categories (id, name) values ('food', 'Lanches');
    insert into products (id, name, price, category_id) values
      ('burger', 'Hambúrguer', 20, 'food'),
      ('soda', 'Refrigerante', 6, 'food');
    insert into products (id, name, price, category_id, is_by_weight) values
      ('salad', 'Salada por kg', 50, 'food', true);
    insert into stock_items (id, name, quantity, unit) values
      ('bun', 'Pão', 10, 'un'),
      ('lettuce', 'Alface', 5, 'kg');
    insert into product_stock_items (id, product_id, stock_item_id, quantity) values
      ('link-burger-bun', 'burger', 'bun', 2),
      ('link-salad-lettuce', 'salad', 'lettuce', 1);
    insert into tables (id, number, status) values ('table-4', 4, 'AVAILABLE');
  `);
  return db;
}

async function applyIncremental(db) {
  for (const file of INCREMENTAL_FILES) {
    const fullPath = path.join(MIGRATIONS, file);
    assert.ok(fs.existsSync(fullPath), `migration ausente: ${file}`);
    await db.exec(fs.readFileSync(fullPath, 'utf8'));
  }
}

async function migratedDatabase() {
  const db = await newDatabase();
  await applyIncremental(db);
  return db;
}

const orderJson = (id, overrides = {}) => ({
  id, type: 'TAKE_AWAY', source: 'PDV', status: 'NEW', total: 0, delivery_fee: 0,
  customer_name: 'Ana', user_id: 'admin-1', cash_register_session_id: 'session-1',
  ...overrides,
});
const itemJson = (orderId, productId, quantity, suffix = '1', extra = {}) => ({
  id: `${orderId}-item-${suffix}`, order_id: orderId, product_id: productId,
  product_name: productId, quantity, price: 0, ...extra,
});

async function createOrder(db, id, items, overrides = {}, payment = null) {
  const result = await db.query(
    'select public.create_order_with_stock($1::jsonb, $2::jsonb, $3::jsonb) as order',
    [JSON.stringify(orderJson(id, overrides)), JSON.stringify(items), payment ? JSON.stringify(payment) : null]
  );
  return result.rows[0].order;
}

const scalar = async (db, sql, params = []) => Object.values((await db.query(sql, params)).rows[0] ?? {})[0];
const stock = (db, id = 'bun') => scalar(db, 'select quantity::float as q from stock_items where id = $1', [id]);
const status = (db, id) => scalar(db, 'select status from orders where id = $1', [id]);
const movements = (db, id) => scalar(db, 'select count(*)::int from order_stock_movements where order_ref = $1', [id]);
const allMovements = (db) => scalar(db, 'select count(*)::int from order_stock_movements');
const itemsOf = (db, id) => db.query(
  'select product_id, quantity from order_items where order_id = $1 order by id', [id]
).then((r) => r.rows);
const cancel = (db, id, requiredStatus = null, requiredWaiter = null) => db.query(
  'select public.cancel_order_with_stock($1, $2, $3) as result', [id, requiredStatus, requiredWaiter]
).then((r) => r.rows[0].result);
const editItems = (db, id, items, patch = {}, waiter = null) => db.query(
  'select public.update_order_items_with_stock($1, $2::jsonb, $3::jsonb, $4) as order',
  [id, JSON.stringify(items), JSON.stringify(patch), waiter]
).then((r) => r.rows[0].order);
const deleteOrder = (db, id) => db.query('select public.delete_order_with_stock($1) as result', [id])
  .then((r) => r.rows[0].result);
const resolve = (db, ref, decision, items = null, author = 'Supervisora', note = 'Conferido com a comanda') =>
  db.query('select public.resolve_legacy_order_stock($1, $2, $3, $4, $5::jsonb) as result',
    [ref, decision, author, note, items ? JSON.stringify(items) : null]).then((r) => r.rows[0].result);

async function asRole(db, role, run) {
  await db.exec(`set role ${role}`);
  try { return await run(); } finally { await db.exec('reset role'); }
}

async function failAfterCancelTrigger(db) {
  await db.exec(`
    create function test_fail_status() returns trigger language plpgsql as $$
    begin raise exception 'simulated failure'; end; $$;
    create trigger test_fail_status before update of status on orders
      for each row when (new.status = 'CANCELED') execute function test_fail_status();
  `);
}

const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });
const withDb = (factory, run) => async () => {
  const db = await factory();
  try { await run(db); } finally { await db.close(); }
};

// ---------------------------------------------------------------------------
// Before the fix: the current functions, used the way the service used them.
// Every supabase-js call is a separate transaction.
// ---------------------------------------------------------------------------

const legacyItems = (db, id) => db.query(
  'select product_id, quantity, weight from order_items where order_id = $1', [id]
).then((r) => JSON.stringify(r.rows));

scenario('LEGACY: two cancel requests that both read NEW return the stock twice', withDb(newDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)]);
  assert.equal(await stock(db), 6);
  const items = await legacyItems(db, 'o1');
  await db.query('select public.restore_order_stock($1::jsonb)', [items]);
  await db.query('select public.restore_order_stock($1::jsonb)', [items]);
  await db.query("update orders set status = 'CANCELED' where id = 'o1'");
  assert.equal(await stock(db), 14, 'problema reproduzido: 4 pães saíram e 8 voltaram');
}));

scenario('LEGACY: a failure after the stock return leaves an active order with its stock returned', withDb(newDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)]);
  await db.query('select public.restore_order_stock($1::jsonb)', [await legacyItems(db, 'o1')]);
  await failAfterCancelTrigger(db);
  await assert.rejects(db.query("update orders set status = 'CANCELED' where id = 'o1'"));
  assert.equal(await status(db, 'o1'), 'NEW');
  assert.equal(await stock(db), 10, 'problema reproduzido: pedido ativo, mas estoque já devolvido');
}));

scenario('LEGACY: the stock return follows the current recipe, not what was taken at sale time', withDb(newDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)]);
  await db.query("update product_stock_items set quantity = 5 where id = 'link-burger-bun'");
  await db.query('select public.restore_order_stock($1::jsonb)', [await legacyItems(db, 'o1')]);
  assert.equal(await stock(db), 16, 'problema reproduzido: saíram 4 pães e voltaram 10');
}));

scenario('LEGACY: an order sold before the recipe existed returns stock it never took', withDb(newDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'soda', 2)]);
  await db.query("insert into product_stock_items (id, product_id, stock_item_id, quantity) values ('link-soda-bun', 'soda', 'bun', 1)");
  await db.query('select public.restore_order_stock($1::jsonb)', [await legacyItems(db, 'o1')]);
  assert.equal(await stock(db), 12, 'problema reproduzido: entrada de 2 pães sem baixa anterior');
}));

scenario('LEGACY: an edit that fails after restoring leaves the order with items and no deduction', withDb(newDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 1)]);
  // Service sequence: restore old, delete items, insert items, consume new.
  await db.query('select public.restore_order_stock($1::jsonb)', [await legacyItems(db, 'o1')]);
  await db.query("delete from order_items where order_id = 'o1'");
  await db.query("insert into order_items (id, order_id, product_id, product_name, quantity, price) values ('o1-n', 'o1', 'burger', 'burger', 6, 0)");
  await assert.rejects(db.query(`select public.consume_order_stock('[{"product_id":"burger","quantity":6}]'::jsonb)`));
  assert.equal(await stock(db), 10, 'problema reproduzido: pedido ativo com 6 hambúrgueres e nenhuma baixa');
  await db.query('select public.restore_order_stock($1::jsonb)', [await legacyItems(db, 'o1')]);
  assert.equal(await stock(db), 22, 'e o cancelamento seguinte devolve 12 pães que nunca saíram');
}));

scenario('LEGACY: a public order cannot be stored without naming a user', withDb(newDatabase, async (db) => {
  await assert.rejects(
    createOrder(db, 'p1', [itemJson('p1', 'soda', 1)], { source: 'PUBLIC_MENU', user_id: null }),
    (error) => error.code === '23502'
  );
}));

// ---------------------------------------------------------------------------
// Migration, permissions and guards
// ---------------------------------------------------------------------------

scenario('the migrations apply on the real base, re-apply harmlessly and set explicit permissions', withDb(migratedDatabase, async (db) => {
  await applyIncremental(db);
  for (const table of ['order_stock_movements', 'order_stock_legacy_reviews', 'order_stock_ledger_rollout']) {
    assert.equal(await scalar(db, `select relrowsecurity from pg_class where relname = '${table}'`), true);
    for (const role of ['anon', 'authenticated']) {
      assert.equal(await scalar(db, `select has_table_privilege('${role}', '${table}', 'select')`), false);
    }
    assert.equal(await scalar(db, `select has_table_privilege('service_role', '${table}', 'select')`), true);
    for (const privilege of ['insert', 'update', 'delete']) {
      assert.equal(await scalar(db, `select has_table_privilege('service_role', '${table}', '${privilege}')`), false);
    }
  }
  const exec = (role, signature) => scalar(db, `select has_function_privilege('${role}', '${signature}', 'execute')`);
  for (const fn of [
    'public.create_order_with_stock(jsonb, jsonb, jsonb)',
    'public.cancel_order_with_stock(text, text, text)',
    'public.update_order_items_with_stock(text, jsonb, jsonb, text)',
    'public.delete_order_with_stock(text)',
  ]) {
    assert.equal(await exec('service_role', fn), true, fn);
    assert.equal(await exec('anon', fn), false, fn);
    assert.equal(await exec('authenticated', fn), false, fn);
  }
  for (const fn of [
    'public.consume_stock_for_order(text, jsonb, text)',
    'public.restore_stock_for_order(text, text)',
    'public.resolve_legacy_order_stock(text, text, text, text, jsonb)',
    'public.order_is_legacy_stock_order(text)',
    'public.consume_order_stock(jsonb)',
    'public.restore_order_stock(jsonb)',
  ]) {
    for (const role of ['service_role', 'anon', 'authenticated']) {
      assert.equal(await exec(role, fn), false, `${role} ${fn}`);
    }
  }
}));

scenario('guards refuse cancel, delete and item changes outside the order functions', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)]);
  await assert.rejects(db.query("update orders set status = 'CANCELED' where id = 'o1'"), /ORDER_STOCK_OPERATION_REQUIRED/);
  await assert.rejects(db.query("delete from orders where id = 'o1'"), /ORDER_STOCK_OPERATION_REQUIRED/);
  await assert.rejects(db.query("delete from order_items where order_id = 'o1'"), /ORDER_STOCK_OPERATION_REQUIRED/);
  await assert.rejects(db.query("update order_items set quantity = 9 where order_id = 'o1'"), /ORDER_STOCK_OPERATION_REQUIRED/);
  await assert.rejects(
    db.query("insert into order_items (id, order_id, product_id, product_name, quantity, price) values ('x', 'o1', 'burger', 'b', 1, 0)"),
    /ORDER_STOCK_OPERATION_REQUIRED/
  );
  // Other status changes keep working.
  await db.query("update orders set status = 'IN_PROGRESS' where id = 'o1'");
  assert.equal(await status(db, 'o1'), 'IN_PROGRESS');
  assert.deepEqual(await itemsOf(db, 'o1'), [{ product_id: 'burger', quantity: 2 }]);
  assert.equal(await stock(db), 6);
}));

scenario('the previous backend version fails safely against the new database', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)]);
  await createOrder(db, 'fin', [itemJson('fin', 'burger', 1)]);
  await db.query("update orders set status = 'FINISHED' where id = 'fin'");
  const items = await legacyItems(db, 'o1');
  await asRole(db, 'service_role', async () => {
    // Old cancel: restore_order_stock then UPDATE status.
    await assert.rejects(db.query('select public.restore_order_stock($1::jsonb)', [items]), /permission denied/);
    await assert.rejects(db.query("update orders set status = 'CANCELED' where id = 'o1'"), /ORDER_STOCK_OPERATION_REQUIRED/);
    // Old edit: restore_order_stock, delete items one by one, insert, consume.
    await assert.rejects(db.query("delete from order_items where id = 'o1-item-1'"), /ORDER_STOCK_OPERATION_REQUIRED/);
    await assert.rejects(db.query(`select public.consume_order_stock('[{"product_id":"burger","quantity":1}]'::jsonb)`), /permission denied/);
    // Old delete of a FINISHED order (no stock step): items, payments, order.
    await assert.rejects(db.query("delete from order_items where order_id = 'fin'"), /ORDER_STOCK_OPERATION_REQUIRED/);
    await assert.rejects(db.query("delete from orders where id = 'fin'"), /ORDER_STOCK_OPERATION_REQUIRED/);
    // Old create (PDV and public with an admin user) still works and is recorded.
    await createOrder(db, 'o2', [itemJson('o2', 'burger', 1)]);
    await createOrder(db, 'p-old', [itemJson('p-old', 'soda', 1)], { source: 'PUBLIC_MENU', user_id: 'admin-1' });
  });
  assert.equal(await status(db, 'o1'), 'NEW');
  assert.equal(await status(db, 'fin'), 'FINISHED');
  assert.equal(await stock(db), 2, 'nada foi devolvido por caminho antigo; o pedido novo baixou 2');
  assert.equal(await movements(db, 'o2'), 1);
}));

// ---------------------------------------------------------------------------
// New orders: create, cancel, edit, delete
// ---------------------------------------------------------------------------

scenario('a new order records what it took and is returned exactly once', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)], {}, {
    id: 'pay-1', order_id: 'o1', method: 'PIX', amount: 40, status: 'PENDING',
  });
  assert.equal(await stock(db), 6);
  const first = await cancel(db, 'o1');
  assert.equal(first.already_canceled, false);
  assert.equal(first.stock_review_required, false);
  assert.equal(await stock(db), 10);
  assert.equal(await scalar(db, "select status from payments where id = 'pay-1'"), 'CANCELED');
  const second = await cancel(db, 'o1');
  assert.equal(second.already_canceled, true);
  assert.equal(await stock(db), 10, 'cancelamento repetido não devolve de novo');
}));

scenario('recipe changed or removed after the sale: the return follows what was taken', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'changed', [itemJson('changed', 'burger', 2)]);
  await db.query("update product_stock_items set quantity = 5 where id = 'link-burger-bun'");
  await cancel(db, 'changed');
  assert.equal(await stock(db), 10);
  await db.query("update product_stock_items set quantity = 2 where id = 'link-burger-bun'");
  await createOrder(db, 'removed', [itemJson('removed', 'burger', 2)]);
  await db.query("delete from product_stock_items where id = 'link-burger-bun'");
  await cancel(db, 'removed');
  assert.equal(await stock(db), 10);
}));

scenario('a product without recipe at sale time returns nothing when a recipe is added later', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'soda', 2)]);
  await db.query("insert into product_stock_items (id, product_id, stock_item_id, quantity) values ('link-soda-bun', 'soda', 'bun', 1)");
  const result = await cancel(db, 'o1');
  assert.deepEqual(result.restored, []);
  assert.equal(await stock(db), 10);
}));

scenario('by-weight items take and return weight / 1000 of the recipe', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'w1', [itemJson('w1', 'salad', 1, '1', { weight: 350, sale_type: 'WEIGHT' })]);
  assert.equal(await stock(db, 'lettuce'), 4.65);
  await cancel(db, 'w1');
  assert.equal(await stock(db, 'lettuce'), 5);
}));

scenario('a failure during the cancel rolls back status, stock and ledger together', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)]);
  await failAfterCancelTrigger(db);
  await assert.rejects(cancel(db, 'o1'), /simulated failure/);
  assert.equal(await status(db, 'o1'), 'NEW');
  assert.equal(await stock(db), 6);
  assert.equal(await movements(db, 'o1'), 1);
  await db.exec('drop trigger test_fail_status on orders;');
  await cancel(db, 'o1');
  assert.equal(await stock(db), 10);
}));

scenario('the database rechecks the waiter conditions inside the lock', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 1)], { source: 'WAITER', waiter_id: 'waiter-1' });
  await db.query("update orders set status = 'IN_PROGRESS' where id = 'o1'");
  await assert.rejects(cancel(db, 'o1', 'NEW', 'waiter-1'), /ORDER_CANCEL_PRECONDITION_FAILED/);
  await db.query("update orders set status = 'NEW' where id = 'o1'");
  await assert.rejects(cancel(db, 'o1', 'NEW', 'waiter-2'), /ORDER_CANCEL_PRECONDITION_FAILED/);
  assert.equal(await stock(db), 8);
  await cancel(db, 'o1', 'NEW', 'waiter-1');
  assert.equal(await stock(db), 10);
}));

scenario('editing items swaps items, stock, ledger and total in one step', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 1)]);
  const order = await editItems(db, 'o1', [itemJson('o1', 'burger', 3, '2')], { total: 60, customer_name: 'Bia' });
  assert.equal(Number(order.total), 60);
  assert.equal(order.customer_name, 'Bia');
  assert.deepEqual(await itemsOf(db, 'o1'), [{ product_id: 'burger', quantity: 3 }]);
  assert.equal(await stock(db), 4);
  await cancel(db, 'o1');
  assert.equal(await stock(db), 10);
}));

scenario('an edit that fails leaves items, stock, ledger and total untouched', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 1)], { total: 20 });
  const ledgerBefore = await movements(db, 'o1');
  // 6 burgers need 12 buns; only 8 are left.
  await assert.rejects(editItems(db, 'o1', [itemJson('o1', 'burger', 6, '2')], { total: 120 }), /Estoque insuficiente/);
  assert.deepEqual(await itemsOf(db, 'o1'), [{ product_id: 'burger', quantity: 1 }]);
  assert.equal(await stock(db), 8);
  assert.equal(await movements(db, 'o1'), ledgerBefore);
  assert.equal(Number(await scalar(db, "select total from orders where id = 'o1'")), 20);
  await cancel(db, 'o1');
  assert.equal(await stock(db), 10, 'o cancelamento seguinte devolve só o que saiu');
}));

scenario('editing is refused once the order is not NEW or belongs to another waiter', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 1)], { source: 'WAITER', waiter_id: 'waiter-1' });
  await assert.rejects(editItems(db, 'o1', [itemJson('o1', 'burger', 2, '2')], {}, 'waiter-2'), /ORDER_EDIT_PRECONDITION_FAILED/);
  await cancel(db, 'o1');
  await assert.rejects(editItems(db, 'o1', [itemJson('o1', 'burger', 2, '2')]), /ORDER_EDIT_PRECONDITION_FAILED/);
  assert.equal(await stock(db), 10);
  assert.deepEqual(await itemsOf(db, 'o1'), [{ product_id: 'burger', quantity: 1 }]);
}));

scenario('deleting an active order returns its stock once and keeps the ledger trail', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)], {}, {
    id: 'pay-1', order_id: 'o1', method: 'PIX', amount: 40, status: 'PENDING',
  });
  await deleteOrder(db, 'o1');
  assert.equal(await stock(db), 10);
  assert.equal(await scalar(db, "select count(*)::int from orders where id = 'o1'"), 0);
  assert.equal(await movements(db, 'o1'), 2, 'OUT e IN continuam no livro pelo order_ref');
  assert.equal(await scalar(db, "select count(*)::int from order_stock_movements where order_ref = 'o1' and order_id is null"), 2);
}));

scenario('deleting a FINISHED order keeps today\'s rule: no stock return', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)]);
  await db.query("update orders set status = 'FINISHED' where id = 'o1'");
  await deleteOrder(db, 'o1');
  assert.equal(await stock(db), 6);
}));

scenario('a delete blocked by an invoice leaves order, items, payment and stock intact', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)], {}, {
    id: 'pay-1', order_id: 'o1', method: 'PIX', amount: 40, status: 'PENDING',
  });
  await db.query(`insert into invoices (id, order_id, focus_ref, model, status, environment)
    values ('inv-1', 'o1', 'nfce_o1', '65', 'authorized', 'homologation')`);
  await assert.rejects(deleteOrder(db, 'o1'), (error) => error.code === '23503');
  assert.equal(await status(db, 'o1'), 'NEW');
  assert.deepEqual(await itemsOf(db, 'o1'), [{ product_id: 'burger', quantity: 2 }]);
  assert.equal(await scalar(db, "select count(*)::int from payments where order_id = 'o1'"), 1);
  assert.equal(await stock(db), 6);
}));

scenario('cancel then delete, or delete-restore twice, never returns twice', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)]);
  await cancel(db, 'o1');
  await deleteOrder(db, 'o1');
  assert.equal(await stock(db), 10);
  await createOrder(db, 'o2', [itemJson('o2', 'burger', 2)]);
  await db.query("select public.restore_stock_for_order('o2', 'ORDER_DELETED')");
  await db.query("select public.restore_stock_for_order('o2', 'ORDER_DELETED')");
  await cancel(db, 'o2');
  assert.equal(await stock(db), 10);
}));

scenario('cancelling the last order of a tab keeps closing the tab and releasing the table', withDb(migratedDatabase, async (db) => {
  await db.query("select public.open_table_tab('tab-1', 'table-4', 'session-1', 'João', 'waiter-1')");
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 1)], {
    type: 'DINE_IN', table_id: 'table-4', table_tab_id: 'tab-1', source: 'WAITER', waiter_id: 'waiter-1',
  });
  await cancel(db, 'o1');
  assert.equal(await scalar(db, "select status from table_tabs where id = 'tab-1'"), 'CLOSED');
  assert.equal(await scalar(db, "select status from tables where id = 'table-4'"), 'AVAILABLE');
}));

scenario('insufficient stock is still refused with the same message', withDb(migratedDatabase, async (db) => {
  await assert.rejects(createOrder(db, 'o1', [itemJson('o1', 'burger', 6)]), /Estoque insuficiente/);
  assert.equal(await stock(db), 10);
  assert.equal(await scalar(db, "select count(*)::int from orders where id = 'o1'"), 0);
}));

scenario('public orders may be stored without an operator; staff orders may not', withDb(migratedDatabase, async (db) => {
  const order = await createOrder(db, 'p1', [itemJson('p1', 'soda', 1)], { source: 'PUBLIC_MENU', user_id: null });
  assert.equal(order.user_id, null);
  for (const source of ['PDV', 'WAITER']) {
    await assert.rejects(
      createOrder(db, `x-${source}`, [itemJson(`x-${source}`, 'soda', 1)], { source, user_id: null }),
      (error) => error.code === '23514'
    );
  }
}));

// ---------------------------------------------------------------------------
// Stock item history
// ---------------------------------------------------------------------------

const restrictedByLedger = (error) =>
  error.code === '23001' && error.message.includes('order_stock_movements_stock_item_id_fkey');
const bunMovements = (db) => db.query(
  "select direction, quantity::float as quantity, reason from order_stock_movements where stock_item_id = 'bun' order by id"
).then((r) => r.rows);

scenario('STOCK ITEM: a stock item with order history cannot be deleted; OUT/IN are kept', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 2)]);
  await assert.rejects(db.query("delete from stock_items where id = 'bun'"), restrictedByLedger);
  assert.deepEqual(await bunMovements(db), [{ direction: 'OUT', quantity: 4, reason: 'ORDER_CREATED' }]);
  assert.equal(await stock(db), 6);
  // The order can still be cancelled afterwards, and the history keeps both rows.
  await cancel(db, 'o1');
  assert.equal(await stock(db), 10);
  await assert.rejects(db.query("delete from stock_items where id = 'bun'"), restrictedByLedger);
  assert.deepEqual(await bunMovements(db), [
    { direction: 'OUT', quantity: 4, reason: 'ORDER_CREATED' },
    { direction: 'IN', quantity: 4, reason: 'ORDER_CANCELED' },
  ]);
  // The service role (backend key) is refused the same way.
  await asRole(db, 'service_role', async () => {
    await assert.rejects(db.query("delete from stock_items where id = 'bun'"), restrictedByLedger);
  });
}));

scenario('STOCK ITEM: a stock item without history is deleted as before, with its links', withDb(migratedDatabase, async (db) => {
  await db.exec(`
    insert into stock_items (id, name, quantity, unit) values ('salt', 'Sal', 3, 'kg');
    insert into product_stock_items (id, product_id, stock_item_id, quantity) values ('link-soda-salt', 'soda', 'salt', 0.001);
    insert into suppliers (id, name) values ('sup-1', 'Fornecedor');
    insert into supplier_stock_items (id, price, supplier_id, stock_item_id) values ('price-1', 2.5, 'sup-1', 'salt');
  `);
  await db.query("delete from stock_items where id = 'salt'");
  assert.equal(await scalar(db, "select count(*)::int from stock_items where id = 'salt'"), 0);
  assert.equal(await scalar(db, "select count(*)::int from product_stock_items where stock_item_id = 'salt'"), 0);
  assert.equal(await scalar(db, "select count(*)::int from supplier_stock_items where stock_item_id = 'salt'"), 0);
}));

// ---------------------------------------------------------------------------
// Orders created before the ledger
// ---------------------------------------------------------------------------

async function legacyDatabase() {
  const db = await newDatabase();
  // Created by the previous flow (base functions).
  await createOrder(db, 'L-new', [itemJson('L-new', 'burger', 1)]);
  await createOrder(db, 'L-progress', [itemJson('L-progress', 'burger', 1)]);
  await db.query("update orders set status = 'IN_PROGRESS' where id = 'L-progress'");
  await createOrder(db, 'L-finished', [itemJson('L-finished', 'burger', 1)]);
  await db.query("update orders set status = 'FINISHED' where id = 'L-finished'");
  await createOrder(db, 'L-soda', [itemJson('L-soda', 'soda', 1)]);
  await createOrder(db, 'L-canceled', [itemJson('L-canceled', 'burger', 1)]);
  await db.query('select public.restore_order_stock($1::jsonb)', [await legacyItems(db, 'L-canceled')]);
  await db.query("update orders set status = 'CANCELED' where id = 'L-canceled'");
  // The recipe of the burger changes after those sales (2 -> 3 buns).
  await db.query("update product_stock_items set quantity = 3 where id = 'link-burger-bun'");
  assert.equal(await stock(db), 4);
  return db;
}

scenario('TRANSITION: the migration lists legacy orders with a labelled estimate and changes no stock', withDb(legacyDatabase, async (db) => {
  const stockBefore = { bun: await stock(db), lettuce: await stock(db, 'lettuce') };
  await applyIncremental(db);
  assert.deepEqual({ bun: await stock(db), lettuce: await stock(db, 'lettuce') }, stockBefore);
  assert.equal(await allMovements(db), 0, 'nenhuma estimativa vira movimentação');
  const rows = (await db.query(`select order_ref, status_at_migration, estimated_return, estimate_basis,
    items_without_current_recipe, resolution from order_stock_legacy_reviews order by order_ref`)).rows;
  assert.deepEqual(rows.map((r) => r.order_ref), ['L-finished', 'L-new', 'L-progress', 'L-soda']);
  const byRef = Object.fromEntries(rows.map((r) => [r.order_ref, r]));
  assert.equal(byRef['L-new'].status_at_migration, 'NEW');
  assert.equal(byRef['L-new'].estimate_basis, 'CURRENT_RECIPE_AT_MIGRATION');
  assert.deepEqual(byRef['L-new'].estimated_return, [{ stock_item_id: 'bun', quantity: 3 }],
    'estimativa pela receita atual (3), embora a venda tenha baixado 2');
  assert.deepEqual(byRef['L-soda'].estimated_return, []);
  assert.equal(byRef['L-soda'].items_without_current_recipe, 1);
  assert.ok(rows.every((r) => r.resolution === 'PENDING'));
  assert.equal(await scalar(db, 'select legacy_orders_listed from order_stock_ledger_rollout'), 4);
}));

scenario('TRANSITION: re-running the migration neither duplicates nor undoes later operations', withDb(legacyDatabase, async (db) => {
  await applyIncremental(db);
  await createOrder(db, 'after-1', [itemJson('after-1', 'burger', 1)]);
  await createOrder(db, 'after-unlinked', [itemJson('after-unlinked', 'soda', 1)]);
  await cancel(db, 'L-new');
  await resolve(db, 'L-new', 'RETURN_ESTIMATE');
  const snapshot = async () => ({
    reviews: (await db.query('select order_ref, resolution, order_event from order_stock_legacy_reviews order by order_ref')).rows,
    movements: await allMovements(db),
    bun: await stock(db),
  });
  const before = await snapshot();
  await applyIncremental(db);
  assert.deepEqual(await snapshot(), before);
  assert.equal(await scalar(db, "select count(*)::int from order_stock_legacy_reviews where order_ref like 'after-%'"), 0,
    'pedidos criados depois da migração nunca entram na lista, nem os sem receita');
}));

scenario('TRANSITION: cancelling a legacy order returns nothing automatically and flags it', withDb(legacyDatabase, async (db) => {
  await applyIncremental(db);
  const result = await cancel(db, 'L-progress');
  assert.equal(result.stock_review_required, true);
  assert.deepEqual(result.restored, []);
  assert.equal(await status(db, 'L-progress'), 'CANCELED');
  assert.equal(await stock(db), 4);
  assert.equal(await scalar(db, "select order_event from order_stock_legacy_reviews where order_ref = 'L-progress'"), 'CANCELED');
  assert.equal(await scalar(db, "select resolution from order_stock_legacy_reviews where order_ref = 'L-progress'"), 'PENDING');
}));

scenario('TRANSITION: review decisions are explicit, single and audited', withDb(legacyDatabase, async (db) => {
  await applyIncremental(db);
  await assert.rejects(resolve(db, 'L-new', 'RETURN_ESTIMATE'), /REQUIRES_CANCELED_ORDER/);
  await assert.rejects(resolve(db, 'L-new', 'NO_RETURN', null, ' ', 'x'), /REQUIRES_AUTHOR_AND_NOTE/);
  await assert.rejects(resolve(db, 'L-new', 'GUESS'), /INVALID_DECISION/);

  await cancel(db, 'L-new');
  await resolve(db, 'L-new', 'RETURN_COUNTED', [{ stock_item_id: 'bun', quantity: 2 }]);
  assert.equal(await stock(db), 6, 'devolvido o que a supervisora conferiu (2), não a estimativa (3)');
  await assert.rejects(resolve(db, 'L-new', 'RETURN_ESTIMATE'), /ALREADY_RESOLVED/);
  await cancel(db, 'L-new');
  assert.equal(await stock(db), 6);

  await cancel(db, 'L-progress');
  await resolve(db, 'L-progress', 'RETURN_ESTIMATE');
  assert.equal(await stock(db), 9);
  const reviewed = (await db.query(`select resolution, resolved_by, resolution_note, applied_return
    from order_stock_legacy_reviews where order_ref = 'L-progress'`)).rows[0];
  assert.equal(reviewed.resolution, 'RETURNED_ESTIMATE');
  assert.equal(reviewed.resolved_by, 'Supervisora');
  assert.deepEqual(reviewed.applied_return, [{ stock_item_id: 'bun', quantity: 3 }]);
  assert.equal(await scalar(db, "select count(*)::int from order_stock_movements where order_ref = 'L-progress' and reason = 'LEGACY_REVIEW_RETURN'"), 1);

  await resolve(db, 'L-finished', 'NO_RETURN');
  await cancel(db, 'L-finished');
  assert.equal(await stock(db), 9, 'decidido sem devolução: cancelar depois não devolve nada');
}));

scenario('TRANSITION: editing items or deleting a pending legacy order is refused', withDb(legacyDatabase, async (db) => {
  await applyIncremental(db);
  await assert.rejects(editItems(db, 'L-new', [itemJson('L-new', 'burger', 2, '2')]), /LEGACY_ORDER_ITEMS_LOCKED/);
  await assert.rejects(deleteOrder(db, 'L-new'), /LEGACY_ORDER_STOCK_REVIEW_REQUIRED/);
  assert.equal(await stock(db), 4);
  assert.deepEqual(await itemsOf(db, 'L-new'), [{ product_id: 'burger', quantity: 1 }]);
}));

// Simple case from the review, recipe unchanged: stock 10 -> legacy order
// takes 2 -> 8 -> migration -> NO_RETURN -> edit. Must never reach 6.
async function simpleLegacyDatabase() {
  const db = await newDatabase();
  await createOrder(db, 'S-new', [itemJson('S-new', 'burger', 1)]);
  assert.equal(await stock(db), 8);
  await applyIncremental(db);
  return db;
}

scenario('TRANSITION: NO_RETURN does not authorise replacing items of a legacy order', withDb(simpleLegacyDatabase, async (db) => {
  await resolve(db, 'S-new', 'NO_RETURN', null, 'Supervisora', 'Sem evidência; não devolver');
  // Same items and quantity.
  await assert.rejects(editItems(db, 'S-new', [itemJson('S-new', 'burger', 1, '2')]), /LEGACY_ORDER_ITEMS_LOCKED/);
  assert.equal(await stock(db), 8, 'a baixa antiga não pode ser repetida (8 -> 6)');
  // Different quantity.
  await assert.rejects(editItems(db, 'S-new', [itemJson('S-new', 'burger', 3, '2')]), /LEGACY_ORDER_ITEMS_LOCKED/);
  assert.equal(await stock(db), 8);
  assert.deepEqual(await itemsOf(db, 'S-new'), [{ product_id: 'burger', quantity: 1 }]);
  assert.equal(await movements(db, 'S-new'), 0, 'nenhuma baixa nova nem estimativa no livro');
  // A later cancel returns nothing (decision recorded), and is idempotent.
  await cancel(db, 'S-new');
  await cancel(db, 'S-new');
  assert.equal(await status(db, 'S-new'), 'CANCELED');
  assert.equal(await stock(db), 8);
  // The review cannot be repeated or changed after the fact.
  await assert.rejects(resolve(db, 'S-new', 'RETURN_COUNTED', [{ stock_item_id: 'bun', quantity: 2 }]), /ALREADY_RESOLVED/);
  assert.equal(await stock(db), 8);
  assert.equal(await scalar(db, "select resolution from order_stock_legacy_reviews where order_ref = 'S-new'"), 'NO_RETURN');
}));

scenario('TRANSITION: a repeated cancel keeps reporting a pending review until it is resolved', withDb(simpleLegacyDatabase, async (db) => {
  const first = await cancel(db, 'S-new');
  assert.equal(first.already_canceled, false);
  assert.equal(first.stock_review_required, true);
  const repeated = await cancel(db, 'S-new');
  assert.equal(repeated.already_canceled, true);
  assert.equal(repeated.stock_review_required, true, 'a pendência continua enquanto não houver conferência');
  await resolve(db, 'S-new', 'RETURN_COUNTED', [{ stock_item_id: 'bun', quantity: 2 }]);
  assert.equal(await stock(db), 10);
  const afterReview = await cancel(db, 'S-new');
  assert.equal(afterReview.stock_review_required, false);
  assert.equal(await stock(db), 10);
}));

// ---------------------------------------------------------------------------
// Recovery scripts (backend/supabase/rollbacks/*.sql, outside migrations/)
// ---------------------------------------------------------------------------

const ROLLBACK_DIR = path.join(__dirname, '../supabase/rollbacks');
const runScript = (db, file) => db.exec(fs.readFileSync(path.join(ROLLBACK_DIR, file), 'utf8'));
const catalogMatches = async (db) => {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/checks/verify_database_inventory.sql'), 'utf8');
  const results = await db.exec(sql);
  return results[results.length - 1].rows.map((row) => [row.category, row.matches]);
};

const migrationText = (file) => fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
const userIdNullable = (db) => scalar(db,
  "select is_nullable from information_schema.columns where table_name = 'orders' and column_name = 'user_id'");
const tableExists = (db, table) => scalar(db, `select to_regclass('public.${table}') is not null`);

scenario('RECOVERY 1: a failure inside migration 1 changes nothing', withDb(newDatabase, async (db) => {
  const failing = migrationText(INCREMENTAL_FILES[0]).replace(/commit;\s*$/, 'select 1 / 0;\ncommit;');
  await assert.rejects(db.exec(failing), /division by zero/);
  await db.exec('rollback');
  assert.equal(await userIdNullable(db), 'NO');
  assert.equal(await scalar(db, "select count(*)::int from pg_constraint where conname = 'orders_user_required_for_staff_sources'"), 0);
  for (const [category, matches] of await catalogMatches(db)) assert.equal(matches, true, category);
}));

scenario('RECOVERY 2: migration 1 applied and migration 2 failed leaves only migration 1; both exits work', withDb(legacyDatabase, async (db) => {
  await db.exec(migrationText(INCREMENTAL_FILES[0]));
  // Force migration 2 to fail late (after creating its tables and functions).
  await db.exec('create table public.order_stock_ledger_rollout (id integer);');
  await assert.rejects(db.exec(migrationText(INCREMENTAL_FILES[1])));
  await db.exec('rollback');
  await db.exec('drop table public.order_stock_ledger_rollout;');
  // Nothing of migration 2 survived; migration 1 did.
  assert.equal(await tableExists(db, 'order_stock_movements'), false);
  assert.equal(await tableExists(db, 'order_stock_legacy_reviews'), false);
  assert.equal(await scalar(db, "select count(*)::int from pg_proc where proname = 'cancel_order_with_stock'"), 0);
  assert.equal(await userIdNullable(db), 'YES');
  // The previous backend keeps working on this state (it always writes a user).
  const bunBefore = await stock(db);
  await asRole(db, 'service_role', async () => {
    await createOrder(db, 'old-after-m1', [itemJson('old-after-m1', 'burger', 1)]);
    await db.query('select public.restore_order_stock($1::jsonb)', [await legacyItems(db, 'old-after-m1')]);
    await db.query("update orders set status = 'CANCELED' where id = 'old-after-m1'");
  });
  assert.equal(await stock(db), bunBefore);
  // The compat script is not for this state and says so, changing nothing.
  await assert.rejects(runScript(db, 'rollback_compat_after_writes.sql'), /ROLLBACK_NOT_APPLICABLE/);
  await db.exec('rollback');
  assert.equal(await userIdNullable(db), 'YES');
  // Exit A (revert): rollback_before_writes.sql does not depend on migration 2 objects.
  await runScript(db, 'rollback_before_writes.sql');
  for (const [category, matches] of await catalogMatches(db)) assert.equal(matches, true, category);
}));

scenario('RECOVERY 2b: after a failed migration 2, fixing the cause and re-running it completes the upgrade', withDb(legacyDatabase, async (db) => {
  await db.exec(migrationText(INCREMENTAL_FILES[0]));
  await db.exec('create table public.order_stock_ledger_rollout (id integer);');
  await assert.rejects(db.exec(migrationText(INCREMENTAL_FILES[1])));
  await db.exec('rollback');
  await db.exec('drop table public.order_stock_ledger_rollout;');
  await db.exec(migrationText(INCREMENTAL_FILES[1]));
  assert.equal(await scalar(db, 'select legacy_orders_listed from order_stock_ledger_rollout'), 4);
  assert.equal(await allMovements(db), 0);
}));

scenario('ROLLBACK before writes: the schema returns to the canonical base catalog', withDb(legacyDatabase, async (db) => {
  await applyIncremental(db);
  assert.ok((await catalogMatches(db)).some(([, matches]) => matches === false), 'com as migrations o catálogo difere da base');
  const bunBefore = await stock(db);
  await runScript(db, 'rollback_before_writes.sql');
  for (const [category, matches] of await catalogMatches(db)) assert.equal(matches, true, category);
  assert.equal(await stock(db), bunBefore);
  // The previous backend flow works again.
  await asRole(db, 'service_role', async () => {
    await db.query('select public.restore_order_stock($1::jsonb)', [await legacyItems(db, 'L-new')]);
    await db.query("update orders set status = 'CANCELED' where id = 'L-new'");
  });
  assert.equal(await status(db, 'L-new'), 'CANCELED');
}));

scenario('ROLLBACK before writes refuses to run once the new model has data', withDb(migratedDatabase, async (db) => {
  await createOrder(db, 'o1', [itemJson('o1', 'burger', 1)]);
  await assert.rejects(runScript(db, 'rollback_before_writes.sql'), /ROLLBACK_REFUSED/);
  await db.exec('rollback'); // the refused script leaves its transaction aborted
  assert.equal(await movements(db, 'o1'), 1, 'nada foi removido');
  await assert.rejects(db.query("update orders set status = 'CANCELED' where id = 'o1'"), /ORDER_STOCK_OPERATION_REQUIRED/);
}));

scenario('ROLLBACK compat after writes keeps every row and lets the previous backend work', withDb(legacyDatabase, async (db) => {
  await applyIncremental(db);
  await createOrder(db, 'n1', [itemJson('n1', 'burger', 1)]);
  await createOrder(db, 'pub', [itemJson('pub', 'soda', 1)], { source: 'PUBLIC_MENU', user_id: null });
  await cancel(db, 'L-progress');
  const before = {
    movements: await allMovements(db),
    reviews: await scalar(db, 'select count(*)::int from order_stock_legacy_reviews'),
    pubUser: await scalar(db, "select user_id from orders where id = 'pub'"),
  };
  await runScript(db, 'rollback_compat_after_writes.sql');
  assert.equal(await allMovements(db), before.movements);
  assert.equal(await scalar(db, 'select count(*)::int from order_stock_legacy_reviews'), before.reviews);
  assert.equal(await scalar(db, "select count(*)::int from orders where id = 'pub' and user_id is null"), 1);
  assert.equal(before.pubUser, null);

  const bunBefore = await stock(db);
  await asRole(db, 'service_role', async () => {
    // Previous backend: cancel (restore by recipe + update), delete, create.
    await db.query('select public.restore_order_stock($1::jsonb)', [await legacyItems(db, 'n1')]);
    await db.query("update orders set status = 'CANCELED' where id = 'n1'");
    await db.query("delete from order_items where order_id = 'L-finished'");
    await db.query("delete from orders where id = 'L-finished'");
    await createOrder(db, 'old-create', [itemJson('old-create', 'soda', 1)]);
    await assert.rejects(db.query("select public.cancel_order_with_stock('L-new')"), /permission denied/);
  });
  assert.equal(await status(db, 'n1'), 'CANCELED');
  assert.equal(await stock(db), bunBefore + 3, 'cancelamento antigo devolve pela receita atual (3)');
  assert.equal(await movements(db, 'old-create'), 0, 'o livro deixa de receber registros após a reversão');
  assert.equal(await scalar(db, "select order_id from order_stock_legacy_reviews where order_ref = 'L-finished'"), null,
    'a lista de conferência sobrevive à exclusão do pedido');
}));

(async () => {
  let failed = 0;
  for (const { name, run } of scenarios) {
    try {
      await run();
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL: ${name}\n  ${error.message.split('\n')[0]}`);
    }
  }
  console.log(`${scenarios.length - failed}/${scenarios.length} scenarios passed`);
  if (failed) process.exitCode = 1;
})();
