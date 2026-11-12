// Isolated PostgreSQL (PGlite, in memory) test for migration
// 20261112120000_order_promised_at.sql on top of every previous active
// migration, plus its recovery script.
//
// From the repository root (helpers in the same ignored folder as the other
// *-sql.cjs tests; install both in ONE command, a --no-save install prunes the other):
//   npm install --prefix backend/node_modules/.stock-validation --no-package-lock --no-save @electric-sql/pglite@0.5.8 pg@8.23.1
//   node backend/tests/order-promise-sql.cjs
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
];
const MIGRATION = '20261112120000_order_promised_at.sql';
const ROLLBACK = path.join(__dirname, '../supabase/rollbacks/20261112120000_order_promised_at_down.sql');
const PROMISE_COLUMNS = ['dine_in_promise_minutes', 'take_away_promise_minutes', 'delivery_promise_minutes'];

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
    insert into products (id, name, price, category_id) values ('soda', 'Refrigerante', 6, 'food');
    insert into tables (id, number, status) values ('table-4', 4, 'AVAILABLE');
  `);
  return db;
}

const applyMigration = (db) => db.exec(read(path.join(MIGRATIONS, MIGRATION)));
const applyRollback = (db) => db.exec(read(ROLLBACK));

// p_order exactly as the backend builds it (toOrderInsert): no promised_at.
const orderJson = (id, type, overrides = {}) => ({
  id, type, source: 'PDV', status: 'NEW', total: 6, delivery_fee: 0,
  customer_name: 'Cliente Fictício', user_id: 'admin-1', waiter_id: null,
  cash_register_session_id: 'session-1', table_id: null, table_tab_id: null,
  ...overrides,
});
const channelOrder = {
  // PDV: the three types (DINE_IN needs a table; the trigger opens the tab).
  pdv: (id, type) => orderJson(id, type, type === 'DINE_IN' ? { table_id: 'table-4' } : {}),
  // Waiter: DINE_IN at a table.
  waiter: (id) => orderJson(id, 'DINE_IN', { source: 'WAITER', user_id: 'waiter-1', waiter_id: 'waiter-1', table_id: 'table-4' }),
  // Public menu: TAKE_AWAY or DELIVERY, no operator, pending payment.
  publicMenu: (id, type) => orderJson(id, type, { source: 'PUBLIC_MENU', user_id: null }),
};

async function create(db, order, { payment = false, idempotencyKey = null } = {}) {
  const pOrder = idempotencyKey ? { ...order, idempotency_key: idempotencyKey } : order;
  const items = [{ id: `${order.id}-i1`, order_id: order.id, product_id: 'soda', product_name: 'Refrigerante', quantity: 1, price: 6 }];
  const pPayment = payment
    ? { id: `${order.id}-pay`, order_id: order.id, method: 'PIX', amount: 6, status: 'PENDING', transaction_id: null }
    : null;
  const result = await db.query(
    'select public.create_order_with_stock($1::jsonb, $2::jsonb, $3::jsonb) as order',
    [JSON.stringify(pOrder), JSON.stringify(items), pPayment ? JSON.stringify(pPayment) : null]
  );
  return result.rows[0].order;
}

const stored = async (db, id) => (await db.query(
  `select type, created_at, promised_at,
          extract(epoch from (promised_at - created_at))::int as seconds
   from orders where id = $1`, [id])).rows[0];
const setMinutes = (db, values) => db.query(
  `update restaurant_config set dine_in_promise_minutes = $1, take_away_promise_minutes = $2,
     delivery_promise_minutes = $3 where id = 'config-1'`,
  [values.DINE_IN ?? null, values.TAKE_AWAY ?? null, values.DELIVERY ?? null]
);
const columnsOf = async (db, table) => (await db.query(
  `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [table]
)).rows.map((row) => row.column_name);
// Line endings normalized: on a Windows checkout the migration files may be CRLF.
const functionDefinition = async (db) => (await db.query(
  "select pg_get_functiondef('public.create_order_with_stock(jsonb, jsonb, jsonb)'::regprocedure) as def"
)).rows[0].def.replace(/\r\n/g, '\n');
const functionGrants = async (db) => (await db.query(`
  select grantee, privilege_type from information_schema.routine_privileges
  where routine_schema = 'public' and routine_name = 'create_order_with_stock'
  order by grantee, privilege_type`)).rows;

const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });
const withDb = (run) => async () => {
  const db = await previousDatabase();
  try { await run(db); } finally { await db.close(); }
};

scenario('applies on the 8 previous migrations: nullable columns without default, older order keeps NULL, no backfill', withDb(async (db) => {
  await create(db, channelOrder.pdv('old-order', 'DELIVERY'));
  const configBefore = (await db.query('select * from restaurant_config')).rows[0];
  await applyMigration(db);

  for (const column of PROMISE_COLUMNS) {
    const info = (await db.query(`
      select data_type, is_nullable, column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'restaurant_config' and column_name = $1`, [column])).rows[0];
    assert.deepEqual(info, { data_type: 'integer', is_nullable: 'YES', column_default: null }, column);
  }
  const promised = (await db.query(`
    select data_type, is_nullable, column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'promised_at'`)).rows[0];
  assert.deepEqual(promised, { data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null });

  const configAfter = (await db.query('select * from restaurant_config')).rows[0];
  for (const column of PROMISE_COLUMNS) assert.equal(configAfter[column], null, column);
  for (const [key, value] of Object.entries(configBefore)) assert.deepEqual(configAfter[key], value, key);
  assert.equal((await stored(db, 'old-order')).promised_at, null);
}));

scenario('default (no type configured): every channel and type stores NULL', withDb(async (db) => {
  await applyMigration(db);
  await create(db, channelOrder.pdv('pdv-dine', 'DINE_IN'));
  await create(db, channelOrder.pdv('pdv-take', 'TAKE_AWAY'));
  await create(db, channelOrder.pdv('pdv-delivery', 'DELIVERY'));
  await create(db, channelOrder.waiter('waiter-dine'));
  await create(db, channelOrder.publicMenu('public-take', 'TAKE_AWAY'), { payment: true });
  await create(db, channelOrder.publicMenu('public-delivery', 'DELIVERY'), { payment: true });
  const rows = (await db.query('select id, promised_at from orders order by id')).rows;
  assert.equal(rows.length, 6);
  for (const row of rows) assert.equal(row.promised_at, null, row.id);
}));

scenario('configured types: promised_at = created_at + minutes of the real type, in the INSERT itself; unconfigured type = NULL', withDb(async (db) => {
  await applyMigration(db);
  await setMinutes(db, { TAKE_AWAY: 20, DELIVERY: 45 });

  const returned = await create(db, channelOrder.pdv('pdv-delivery', 'DELIVERY'));
  await create(db, channelOrder.pdv('pdv-take', 'TAKE_AWAY'));
  await create(db, channelOrder.pdv('pdv-dine', 'DINE_IN'));
  await create(db, channelOrder.waiter('waiter-dine'));
  await create(db, channelOrder.publicMenu('public-take', 'TAKE_AWAY'), { payment: true });
  await create(db, channelOrder.publicMenu('public-delivery', 'DELIVERY'), { payment: true });

  // The RPC return (what the backend maps) already carries the value.
  assert.ok(returned.promised_at, 'o retorno da RPC deveria trazer promised_at');
  assert.equal((await stored(db, 'pdv-delivery')).seconds, 45 * 60);
  assert.equal((await stored(db, 'pdv-take')).seconds, 20 * 60);
  assert.equal((await stored(db, 'public-take')).seconds, 20 * 60);
  assert.equal((await stored(db, 'public-delivery')).seconds, 45 * 60);
  assert.equal((await stored(db, 'pdv-dine')).promised_at, null);
  assert.equal((await stored(db, 'waiter-dine')).promised_at, null);

  await setMinutes(db, { DINE_IN: 15, TAKE_AWAY: 20, DELIVERY: 45 });
  await create(db, channelOrder.waiter('waiter-dine-2'));
  assert.equal((await stored(db, 'waiter-dine-2')).seconds, 15 * 60);
}));

scenario('a promised_at sent in p_order is always ignored', withDb(async (db) => {
  await applyMigration(db);
  await create(db, { ...channelOrder.pdv('forged-null', 'DELIVERY'), promised_at: '2030-01-01T00:00:00Z' });
  assert.equal((await stored(db, 'forged-null')).promised_at, null);
  await setMinutes(db, { DELIVERY: 30 });
  await create(db, { ...channelOrder.pdv('forged-set', 'DELIVERY'), promised_at: '2000-01-01T00:00:00Z' });
  assert.equal((await stored(db, 'forged-set')).seconds, 30 * 60);
}));

scenario('changing or clearing the configuration only affects new orders', withDb(async (db) => {
  await create(db, channelOrder.pdv('before-migration', 'DELIVERY'));
  await applyMigration(db);
  await setMinutes(db, { DELIVERY: 45 });
  await create(db, channelOrder.pdv('first', 'DELIVERY'));
  const first = await stored(db, 'first');

  await setMinutes(db, { DELIVERY: 60 });
  await create(db, channelOrder.pdv('second', 'DELIVERY'));
  assert.deepEqual(await stored(db, 'first'), first, 'pedido anterior não pode ser recalculado');
  assert.equal((await stored(db, 'second')).seconds, 60 * 60);

  await setMinutes(db, {});
  await create(db, channelOrder.pdv('third', 'DELIVERY'));
  assert.equal((await stored(db, 'third')).promised_at, null);
  assert.deepEqual(await stored(db, 'first'), first);
  assert.equal((await stored(db, 'second')).seconds, 60 * 60);
  assert.equal((await stored(db, 'before-migration')).promised_at, null);
}));

scenario('idempotent replay returns the stored order without recalculating', withDb(async (db) => {
  await applyMigration(db);
  await setMinutes(db, { TAKE_AWAY: 20 });
  const first = await create(db, channelOrder.publicMenu('idem-1', 'TAKE_AWAY'), { payment: true, idempotencyKey: 'key-1' });
  await setMinutes(db, { TAKE_AWAY: 90 });
  const replay = await create(db, channelOrder.publicMenu('idem-2', 'TAKE_AWAY'), { payment: true, idempotencyKey: 'key-1' });
  assert.equal(replay.id, 'idem-1');
  assert.equal(replay.promised_at, first.promised_at);
  assert.equal(Number((await db.query('select count(*) from orders')).rows[0].count), 1);
}));

scenario('the database refuses zero and negative minutes; NULL and positive integers pass', withDb(async (db) => {
  await applyMigration(db);
  for (const column of PROMISE_COLUMNS) {
    for (const value of [0, -1]) {
      await assert.rejects(
        db.query(`update restaurant_config set ${column} = $1`, [value]),
        new RegExp(`restaurant_config_${column}_check`),
        `${column} = ${value}`
      );
    }
    await db.query(`update restaurant_config set ${column} = 1`);
    await db.query(`update restaurant_config set ${column} = null`);
  }
}));

scenario('the previous backend keeps working: same call, same signature, same grants, payment and stock unchanged', withDb(async (db) => {
  const grantsBefore = await functionGrants(db);
  await applyMigration(db);
  assert.deepEqual(await functionGrants(db), grantsBefore);

  const order = await create(db, channelOrder.publicMenu('old-backend', 'DELIVERY'), { payment: true });
  assert.equal(order.status, 'NEW');
  const payment = (await db.query("select status, amount::float as amount from payments where order_id = 'old-backend'")).rows[0];
  assert.deepEqual(payment, { status: 'PENDING', amount: 6 });
  const items = (await db.query("select count(*)::int as n from order_items where order_id = 'old-backend'")).rows[0];
  assert.equal(items.n, 1);

  // The columns the previous version lists explicitly in restaurant_config still read and write.
  await db.query("update restaurant_config set name = 'Outro nome', brand_primary_color = '#1d4ed8' where id = 'config-1'");
}));

scenario('re-running the migration is harmless and keeps the configured minutes', withDb(async (db) => {
  await applyMigration(db);
  await setMinutes(db, { DELIVERY: 45 });
  await applyMigration(db);
  assert.equal((await db.query('select delivery_promise_minutes from restaurant_config')).rows[0].delivery_promise_minutes, 45);
  const constraints = (await db.query(`
    select count(*)::int as n from pg_constraint
    where conrelid = 'public.restaurant_config'::regclass and conname like '%promise_minutes_check'`)).rows[0];
  assert.equal(constraints.n, 3);
}));

scenario('recovery restores the previous function and drops the columns; orders keep being created; re-apply works', withDb(async (db) => {
  const definitionBefore = await functionDefinition(db);
  const grantsBefore = await functionGrants(db);
  await applyMigration(db);
  await setMinutes(db, { DELIVERY: 45 });
  await create(db, channelOrder.pdv('during', 'DELIVERY'));
  assert.notEqual(await functionDefinition(db), definitionBefore);

  await applyRollback(db);
  assert.equal(await functionDefinition(db), definitionBefore);
  assert.deepEqual(await functionGrants(db), grantsBefore);
  assert.equal((await columnsOf(db, 'orders')).includes('promised_at'), false);
  for (const column of PROMISE_COLUMNS) assert.equal((await columnsOf(db, 'restaurant_config')).includes(column), false);
  await create(db, channelOrder.pdv('after-rollback', 'DELIVERY'));
  assert.equal(Number((await db.query("select count(*) from orders where id in ('during','after-rollback')")).rows[0].count), 2);

  await applyRollback(db); // re-runnable
  await applyMigration(db);
  await create(db, channelOrder.pdv('after-reapply', 'DELIVERY'));
  assert.equal((await stored(db, 'after-reapply')).promised_at, null);
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
