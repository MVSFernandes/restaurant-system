// Concurrency test for the order stock functions with independent connections.
//
// PGlite has a single connection, so locks between sessions can only be shown
// against a real PostgreSQL server. Each scenario proves the overlap instead
// of relying on timing: the second session must appear in pg_blocking_pids()
// as blocked by the first one BEFORE the first one commits.
//
// Safety:
// - only localhost / 127.0.0.1 / ::1 are accepted;
// - the script creates its own database (rs_order_stock_test_<random>) and
//   drops only that database at the end;
// - it creates the Supabase API roles only if missing, and drops only the
//   roles it created.
//
// Example (Docker), from the repository root:
//   docker run --rm -d --name rs-order-stock-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17
//   # install both helpers in ONE command: a --no-save install prunes the other one
//   npm install --prefix backend/node_modules/.stock-validation --no-package-lock --no-save @electric-sql/pglite@0.5.8 pg@8.23.1
//   ORDER_CANCEL_PG_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres \
//     node backend/tests/order-cancel-concurrency-pg.cjs
//   docker stop rs-order-stock-pg
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const url = process.env.ORDER_CANCEL_PG_URL;
if (!url) {
  console.log('NOT RUN: set ORDER_CANCEL_PG_URL to a local PostgreSQL server (see header).');
  process.exit(2);
}
const serverUrl = new URL(url);
if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(serverUrl.hostname)) {
  console.error(`REFUSED: ${serverUrl.hostname} is not a local host. This test creates and drops a database.`);
  process.exit(2);
}

const { Client } = require(path.join(__dirname, '../node_modules/.stock-validation/node_modules/pg'));

const MIGRATIONS = path.join(__dirname, '../supabase/migrations');
const FILES = [
  '20261003130000_base_schema.sql',
  '20261003131000_base_functions.sql',
  '20261003132000_base_runtime.sql',
  '20261104220000_public_orders_without_operator.sql',
  '20261104221000_order_stock_movements_atomic_cancel.sql',
];
const API_ROLES = ['anon', 'authenticated', 'service_role'];
const testDatabase = `rs_order_stock_test_${crypto.randomBytes(4).toString('hex')}`;
const testUrl = (() => {
  const copy = new URL(url);
  copy.pathname = `/${testDatabase}`;
  return copy.toString();
})();

const connect = async (target = testUrl) => {
  const client = new Client({ connectionString: target });
  await client.connect();
  client.pid = (await client.query('select pg_backend_pid() as pid')).rows[0].pid;
  return client;
};

// Polls until `waiter` is blocked by `blocker` (or by any session when blocker
// is null). Fails if it never happens: then the operations did not overlap.
async function expectBlocked(observer, waiter, blocker = null, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const blockers = (await observer.query('select pg_blocking_pids($1) as pids', [waiter.pid])).rows[0].pids;
    if (blockers.length > 0 && (blocker === null || blockers.includes(blocker.pid))) return blockers;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`session ${waiter.pid} was never blocked${blocker ? ` by ${blocker.pid}` : ''}: no overlap`);
}

const createdRoles = [];
let databaseCreated = false;

async function setup() {
  const server = await connect(url);
  try {
    for (const role of API_ROLES) {
      const exists = (await server.query('select 1 from pg_roles where rolname = $1', [role])).rowCount > 0;
      if (!exists) {
        await server.query(`create role ${role}${role === 'service_role' ? ' bypassrls' : ''}`);
        createdRoles.push(role);
      }
    }
    await server.query(`create database ${testDatabase}`);
    databaseCreated = true;
  } finally {
    await server.end();
  }

  const admin = await connect();
  try {
    for (const file of FILES) await admin.query(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
    await admin.query(`
      insert into users (id, name, email, password, role) values ('admin-1', 'Admin', 'admin@example.test', 'x', 'ADMIN');
      insert into cash_register_sessions (id, status, opening_amount, opened_by_id) values ('session-1', 'OPEN', 0, 'admin-1');
      insert into categories (id, name) values ('food', 'Lanches');
      insert into products (id, name, price, category_id) values ('burger', 'Hambúrguer', 20, 'food');
      insert into stock_items (id, name, quantity, unit) values ('bun', 'Pão', 1000, 'un');
      insert into product_stock_items (id, product_id, stock_item_id, quantity) values ('link', 'burger', 'bun', 2);
    `);
  } finally {
    await admin.end();
  }
}

async function teardown() {
  const server = await connect(url);
  try {
    await server.query(`drop database if exists ${testDatabase} with (force)`);
    for (const role of createdRoles) await server.query(`drop role if exists ${role}`);
  } finally {
    await server.end();
  }
}

const item = (orderId, quantity, suffix = '1') => ({
  id: `${orderId}-${suffix}`, order_id: orderId, product_id: 'burger', product_name: 'burger', quantity, price: 0,
});

async function createOrder(client, id, quantity = 2) {
  await client.query('select public.create_order_with_stock($1::jsonb, $2::jsonb, null)', [
    JSON.stringify({
      id, type: 'TAKE_AWAY', source: 'PDV', status: 'NEW', total: 0, delivery_fee: 0,
      customer_name: 'Ana', user_id: 'admin-1', cash_register_session_id: 'session-1',
    }),
    JSON.stringify([item(id, quantity)]),
  ]);
}
const bun = async (client) => Number((await client.query("select quantity from stock_items where id = 'bun'")).rows[0].quantity);
const statusOf = async (client, id) => (await client.query('select status from orders where id = $1', [id])).rows[0]?.status ?? null;
const itemsOf = async (client, id) => (await client.query(
  'select quantity from order_items where order_id = $1 order by id', [id]
)).rows.map((row) => row.quantity);
const outstanding = async (client, id) => Number((await client.query(`
  select coalesce(sum(case direction when 'OUT' then quantity else -quantity end), 0) as balance
  from order_stock_movements where order_ref = $1`, [id])).rows[0].balance);

const CANCEL = 'select public.cancel_order_with_stock($1) as result';
const EDIT = 'select public.update_order_items_with_stock($1, $2::jsonb, $3::jsonb) as result';
const DELETE = 'select public.delete_order_with_stock($1) as result';

const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });

async function withSessions(count, run) {
  const sessions = await Promise.all(Array.from({ length: count }, () => connect()));
  try { return await run(...sessions); } finally { await Promise.all(sessions.map((s) => s.end())); }
}

// Controls.
// 1. expectBlocked() is not trivially satisfied: an idle session is reported
//    as "no overlap".
// 2. The legacy recipe-based return (as the previous backend used it) does
//    wait on the stock row lock, but nothing checks the order state, so after
//    the first commit the second session adds the same stock again.
scenario('CONTROL: lock detection fails for a session that is not blocked', (observer) =>
  withSessions(1, async (idle) => {
    await assert.rejects(expectBlocked(observer, idle, null, 500), /no overlap/);
  }));

scenario('CONTROL (legacy): two overlapping recipe-based returns give the stock back twice', (observer) =>
  withSessions(2, async (a, b) => {
    const start = await bun(observer);
    await createOrder(observer, 'legacy');
    const items = JSON.stringify([{ product_id: 'burger', quantity: 2, weight: null }]);
    await a.query('begin');
    await a.query('select public.restore_order_stock($1::jsonb)', [items]);
    const second = b.query('select public.restore_order_stock($1::jsonb)', [items]);
    try {
      await expectBlocked(observer, b, a);
      await a.query('commit');
    } finally {
      await second.catch(() => undefined);
    }
    assert.equal(await bun(observer), start + 4, 'problema reproduzido em PostgreSQL real: 4 pães saíram e 8 voltaram');
  }));

scenario('cancel vs cancel: the second waits for the lock and then returns nothing', (observer) =>
  withSessions(2, async (a, b) => {
    const start = await bun(observer);
    await createOrder(observer, 'cc');
    await a.query('begin');
    assert.equal((await a.query(CANCEL, ['cc'])).rows[0].result.already_canceled, false);
    const second = b.query(CANCEL, ['cc']);
    await expectBlocked(observer, b, a);
    await a.query('commit');
    assert.equal((await second).rows[0].result.already_canceled, true);
    assert.equal(await bun(observer), start, 'o estoque voltou exatamente uma vez');
    assert.equal(await outstanding(observer, 'cc'), 0);
  }));

scenario('eight simultaneous cancels, all held at a gate and released together, return once', (observer) =>
  withSessions(9, async (gate, ...cancellers) => {
    const start = await bun(observer);
    await createOrder(observer, 'many');
    await gate.query('begin');
    await gate.query("select 1 from orders where id = 'many' for update");
    const pending = cancellers.map((client) => client.query(CANCEL, ['many']));
    for (const client of cancellers) await expectBlocked(observer, client);
    await gate.query('rollback');
    const results = await Promise.all(pending);
    const fresh = results.filter((r) => r.rows[0].result.already_canceled === false);
    assert.equal(fresh.length, 1, 'só um cancelamento efetivo');
    assert.equal(await bun(observer), start);
    assert.equal(await statusOf(observer, 'many'), 'CANCELED');
  }));

scenario('cancel first, edit waiting: the edit is refused and nothing else changes', (observer) =>
  withSessions(2, async (a, b) => {
    const start = await bun(observer);
    await createOrder(observer, 'ce');
    await a.query('begin');
    await a.query(CANCEL, ['ce']);
    const edit = b.query(EDIT, ['ce', JSON.stringify([item('ce', 5, '2')]), JSON.stringify({ total: 100 })]);
    await expectBlocked(observer, b, a);
    await a.query('commit');
    await assert.rejects(edit, /ORDER_EDIT_PRECONDITION_FAILED/);
    assert.equal(await statusOf(observer, 'ce'), 'CANCELED');
    assert.deepEqual(await itemsOf(observer, 'ce'), [2], 'itens originais preservados');
    assert.equal(await bun(observer), start);
    assert.equal(await outstanding(observer, 'ce'), 0);
  }));

scenario('edit first, cancel waiting: the cancel returns the edited consumption', (observer) =>
  withSessions(2, async (a, b) => {
    const start = await bun(observer);
    await createOrder(observer, 'ec');
    await a.query('begin');
    await a.query(EDIT, ['ec', JSON.stringify([item('ec', 5, '2')]), JSON.stringify({ total: 100 })]);
    const cancel = b.query(CANCEL, ['ec']);
    await expectBlocked(observer, b, a);
    await a.query('commit');
    const result = (await cancel).rows[0].result;
    assert.equal(result.already_canceled, false);
    assert.deepEqual(result.restored, [{ stock_item_id: 'bun', quantity: 10 }]);
    assert.deepEqual(await itemsOf(observer, 'ec'), [5]);
    assert.equal(await statusOf(observer, 'ec'), 'CANCELED');
    assert.equal(await bun(observer), start);
  }));

scenario('cancel first, delete waiting: the stock goes back once and the order is removed', (observer) =>
  withSessions(2, async (a, b) => {
    const start = await bun(observer);
    await createOrder(observer, 'cd');
    await a.query('begin');
    await a.query(CANCEL, ['cd']);
    const removal = b.query(DELETE, ['cd']);
    await expectBlocked(observer, b, a);
    await a.query('commit');
    assert.deepEqual((await removal).rows[0].result.restored, [], 'pedido cancelado não devolve de novo ao excluir');
    assert.equal(await statusOf(observer, 'cd'), null);
    assert.equal(await bun(observer), start);
    assert.equal(await outstanding(observer, 'cd'), 0);
  }));

scenario('delete first, cancel waiting: the cancel finds no order and nothing returns twice', (observer) =>
  withSessions(2, async (a, b) => {
    const start = await bun(observer);
    await createOrder(observer, 'dc');
    await a.query('begin');
    await a.query(DELETE, ['dc']);
    const cancel = b.query(CANCEL, ['dc']);
    await expectBlocked(observer, b, a);
    await a.query('commit');
    await assert.rejects(cancel, /ORDER_NOT_FOUND/);
    assert.equal(await statusOf(observer, 'dc'), null);
    assert.equal(await bun(observer), start);
    assert.equal(await outstanding(observer, 'dc'), 0);
  }));

// A query left pending by a failed scenario must not kill the process before
// the teardown below drops the test database.
process.on('unhandledRejection', (error) => {
  console.log(`UNHANDLED (scenario left a pending query): ${error?.message ?? error}`);
  process.exitCode = 1;
});

(async () => {
  let failed = 0;
  try {
    await setup();
    console.log(`database ${testDatabase} created on ${serverUrl.hostname}:${serverUrl.port}`);
    const observer = await connect();
    try {
      const version = (await observer.query('show server_version')).rows[0].server_version;
      console.log(`PostgreSQL ${version}`);
      for (const { name, run } of scenarios) {
        try {
          await run(observer);
          console.log(`PASS: ${name}`);
        } catch (error) {
          failed += 1;
          console.log(`FAIL: ${name}\n  ${error.message.split('\n')[0]}`);
        }
      }
    } finally {
      await observer.end();
    }
  } catch (error) {
    failed += 1;
    console.error(`SETUP FAILED: ${error.message}`);
  } finally {
    if (databaseCreated || createdRoles.length) {
      await teardown();
      console.log(`database ${testDatabase} dropped; roles created by this run removed: [${createdRoles.join(', ')}]`);
    }
  }
  console.log(`${scenarios.length - Math.min(failed, scenarios.length)}/${scenarios.length} scenarios passed`);
  if (failed) process.exitCode = 1;
})();
