// Isolated PostgreSQL (PGlite, in memory) test for the installation marker
// migration (Etapa 1B.1) on top of the real base and the Etapa 1A migrations.
//
// From the repository root (helpers in the same ignored folder as the other
// *-sql.cjs tests; install both in ONE command, a --no-save install prunes the other):
//   npm install --prefix backend/node_modules/.stock-validation --no-package-lock --no-save @electric-sql/pglite@0.5.8 pg@8.23.1
//   node backend/tests/app-installation-sql.cjs
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
];
const MIGRATION = '20261105120000_app_installation.sql';
const ROLLBACK = path.join(__dirname, '../supabase/rollbacks/20261105120000_app_installation_down.sql');

const read = (file) => fs.readFileSync(file, 'utf8');

async function previousDatabase() {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  // Same defaults a Supabase project gives its API roles.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  for (const file of PREVIOUS) await db.exec(read(path.join(MIGRATIONS, file)));
  await db.exec(`
    insert into users (id, name, email, password, role) values ('admin-1', 'Admin', 'admin@example.test', 'x', 'ADMIN');
    insert into stock_items (id, name, quantity, unit) values ('bun', 'Pão', 10, 'un');
    insert into categories (id, name) values ('food', 'Lanches');
  `);
  return db;
}

const applyMigration = (db) => db.exec(read(path.join(MIGRATIONS, MIGRATION)));
const scalar = async (db, sql, params = []) => Object.values((await db.query(sql, params)).rows[0] ?? {})[0];
const schemaSnapshot = (db) => db.query(`
  select table_name, column_name, data_type, is_nullable, coalesce(column_default, '') as column_default
  from information_schema.columns
  where table_schema = 'public' and table_name <> 'app_installation'
  order by table_name, ordinal_position`).then((r) => JSON.stringify(r.rows));
const businessRows = async (db) => ({
  users: await scalar(db, 'select count(*)::int from users'),
  stock: await scalar(db, "select quantity::float from stock_items where id = 'bun'"),
  categories: await scalar(db, 'select count(*)::int from categories'),
});
async function asRole(db, role, run) {
  await db.exec(`set role ${role}`);
  try { return await run(); } finally { await db.exec('reset role'); }
}
const configure = (db, id = 'mesa-teste-dev', environment = 'development') =>
  db.query('insert into public.app_installation (installation_id, environment) values ($1, $2)', [id, environment]);

const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });
const withDb = (run) => async () => {
  const db = await previousDatabase();
  try { await run(db); } finally { await db.close(); }
};

scenario('applies on base + 1A, creates an empty marker and touches no business table', withDb(async (db) => {
  const schemaBefore = await schemaSnapshot(db);
  const rowsBefore = await businessRows(db);
  await applyMigration(db);
  assert.equal(await scalar(db, 'select count(*)::int from app_installation'), 0, 'a migration não grava identidade');
  assert.equal(await schemaSnapshot(db), schemaBefore, 'nenhuma coluna de outra tabela mudou');
  assert.deepEqual(await businessRows(db), rowsBefore);
}));

scenario('re-applying is harmless and keeps the configured marker', withDb(async (db) => {
  await applyMigration(db);
  await configure(db);
  await applyMigration(db);
  assert.deepEqual((await db.query('select installation_id, environment from app_installation')).rows,
    [{ installation_id: 'mesa-teste-dev', environment: 'development' }]);
}));

scenario('only one row, a valid id and a known environment are accepted', withDb(async (db) => {
  await applyMigration(db);
  for (const [id, environment] of [['Mesa Farta', 'development'], ['ab', 'development'], ['-x-', 'development'],
    ['mesa-teste-dev', 'prod'], ['mesa-teste-dev', 'Production']]) {
    await assert.rejects(configure(db, id, environment), (error) => error.code === '23514', `${id}/${environment}`);
  }
  await configure(db);
  await assert.rejects(configure(db, 'outra-instalacao', 'production'), (error) => error.code === '23505');
  await assert.rejects(
    db.query("insert into app_installation (singleton, installation_id, environment) values (false, 'outra-instalacao', 'test')"),
    (error) => error.code === '23514'
  );
}));

scenario('the identity is stable unless changed on purpose in the same transaction', withDb(async (db) => {
  await applyMigration(db);
  await configure(db);
  await assert.rejects(db.query("update app_installation set installation_id = 'outro-cliente'"), /APP_INSTALLATION_IS_STABLE/);
  await assert.rejects(db.query("update app_installation set environment = 'production'"), /APP_INSTALLATION_IS_STABLE/);
  await assert.rejects(db.query('delete from app_installation'), /APP_INSTALLATION_IS_STABLE/);
  assert.equal(await scalar(db, 'select installation_id from app_installation'), 'mesa-teste-dev');
  await db.transaction(async (tx) => {
    await tx.exec("set local app.allow_installation_change = 'on'");
    await tx.query("update app_installation set installation_id = 'mesa-teste-dev-2'");
  });
  assert.equal(await scalar(db, 'select installation_id from app_installation'), 'mesa-teste-dev-2');
  // The flag does not leak out of that transaction.
  await assert.rejects(db.query("update app_installation set installation_id = 'mesa-teste-dev'"), /APP_INSTALLATION_IS_STABLE/);
}));

scenario('permissions: backend key reads only; anon and authenticated get nothing', withDb(async (db) => {
  await applyMigration(db);
  await configure(db);
  assert.equal(await scalar(db, "select relrowsecurity from pg_class where relname = 'app_installation'"), true);
  for (const privilege of ['insert', 'update', 'delete', 'truncate']) {
    assert.equal(await scalar(db, `select has_table_privilege('service_role', 'public.app_installation', '${privilege}')`), false, privilege);
  }
  assert.equal(await scalar(db, "select has_table_privilege('service_role', 'public.app_installation', 'select')"), true);
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ['select', 'insert', 'update', 'delete']) {
      assert.equal(await scalar(db, `select has_table_privilege('${role}', 'public.app_installation', '${privilege}')`), false, `${role} ${privilege}`);
    }
  }
  await asRole(db, 'service_role', async () => {
    assert.equal(await scalar(db, 'select installation_id from app_installation'), 'mesa-teste-dev');
    await assert.rejects(db.query("insert into app_installation (installation_id, environment) values ('x-y-z', 'test')"), /permission denied/);
    await assert.rejects(db.query("update app_installation set environment = 'production'"), /permission denied/);
    await assert.rejects(db.query('delete from app_installation'), /permission denied/);
  });
  await asRole(db, 'anon', async () => {
    await assert.rejects(db.query('select * from app_installation'), /permission denied/);
  });
}));

scenario('recovery script removes only the marker objects and can be re-run', withDb(async (db) => {
  await applyMigration(db);
  await configure(db);
  const schemaBefore = await schemaSnapshot(db);
  const rowsBefore = await businessRows(db);
  await db.exec(read(ROLLBACK));
  assert.equal(await scalar(db, "select to_regclass('public.app_installation') is null"), true);
  assert.equal(await scalar(db, "select count(*)::int from pg_proc where proname = 'protect_app_installation'"), 0);
  assert.equal(await schemaSnapshot(db), schemaBefore);
  assert.deepEqual(await businessRows(db), rowsBefore);
  await db.exec(read(ROLLBACK)); // idempotent
  // The migration can be applied again afterwards.
  await applyMigration(db);
  assert.equal(await scalar(db, 'select count(*)::int from app_installation'), 0);
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
