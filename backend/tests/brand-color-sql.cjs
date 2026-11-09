// Isolated PostgreSQL (PGlite, in memory) test for migration
// 20261109120000_restaurant_brand_color.sql (Etapa 1B.7) on top of every
// previous active migration, plus its recovery script.
//
// From the repository root (helpers in the same ignored folder as the other
// *-sql.cjs tests; install both in ONE command, a --no-save install prunes the other):
//   npm install --prefix backend/node_modules/.stock-validation --no-package-lock --no-save @electric-sql/pglite@0.5.8 pg@8.23.1
//   node backend/tests/brand-color-sql.cjs
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
];
const MIGRATION = '20261109120000_restaurant_brand_color.sql';
const ROLLBACK = path.join(__dirname, '../supabase/rollbacks/20261109120000_restaurant_brand_color_down.sql');

// The columns v1.1.0-rc.2 reads (FULL_CONFIG_COLUMNS) and may write
// (toRestaurantConfigUpdate) in restaurant_config. It lists them explicitly.
const RC2_COLUMNS = [
  'id', 'name', 'address', 'phone', 'logo_url', 'banner_url',
  'opening_hours', 'opening_days', 'delivery_fee', 'urban_delivery_fee',
  'rural_delivery_fee', 'enabled_payments', 'cnpj', 'legal_name',
  'state_registration', 'tax_regime', 'fiscal_city_ibge_code',
  'fiscal_zip_code', 'fiscal_street', 'fiscal_number', 'fiscal_neighborhood',
  'fiscal_city', 'fiscal_state', 'default_cfop', 'default_ncm',
  'default_origin', 'default_tax_code', 'nfce_enabled', 'nfce_group_items',
  'nfce_grouped_item_description', 'updated_at',
];

const read = (file) => fs.readFileSync(file, 'utf8');

async function previousDatabase() {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  for (const file of PREVIOUS) await db.exec(read(path.join(MIGRATIONS, file)));
  await db.exec(`
    insert into restaurant_config (id, name, phone, logo_url, urban_delivery_fee, nfce_enabled)
    values ('config-1', 'Casa de Teste', '11999999999', 'https://example.test/logo.png', 7, true);
  `);
  return db;
}

const applyMigration = (db) => db.exec(read(path.join(MIGRATIONS, MIGRATION)));
const applyRollback = (db) => db.exec(read(ROLLBACK));
const row = async (db) => (await db.query('select * from restaurant_config where id = $1', ['config-1'])).rows[0];
const hasColumn = async (db) => (await db.query(`
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'restaurant_config' and column_name = 'brand_primary_color'`)).rows.length === 1;
const otherColumns = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'brand_primary_color'));
const setColor = (db, color) => db.query('update restaurant_config set brand_primary_color = $1 where id = $2', [color, 'config-1']);

const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });
const withDb = (run) => async () => {
  const db = await previousDatabase();
  try { await run(db); } finally { await db.close(); }
};

scenario('applies on the 7 previous migrations: nullable column, no default, existing row unchanged and NULL', withDb(async (db) => {
  const before = await row(db);
  await applyMigration(db);
  const after = await row(db);
  assert.equal(after.brand_primary_color, null, 'a migration não grava cor');
  assert.deepEqual(otherColumns(after), before, 'nenhum outro campo mudou');
  const column = (await db.query(`
    select is_nullable, column_default, data_type from information_schema.columns
    where table_name = 'restaurant_config' and column_name = 'brand_primary_color'`)).rows[0];
  assert.deepEqual(column, { is_nullable: 'YES', column_default: null, data_type: 'text' });
}));

scenario('check accepts lowercase #rrggbb and NULL, refuses anything else', withDb(async (db) => {
  await applyMigration(db);
  await setColor(db, '#1d4ed8');
  await setColor(db, null);
  for (const invalid of ['#1D4ED8', '1d4ed8', '#fff', '#1d4ed80', 'blue', '']) {
    await assert.rejects(setColor(db, invalid), /restaurant_config_brand_primary_color_format_check/, invalid);
  }
}));

scenario('re-running the migration is harmless and keeps the saved color', withDb(async (db) => {
  await applyMigration(db);
  await setColor(db, '#0f766e');
  await applyMigration(db);
  assert.equal((await row(db)).brand_primary_color, '#0f766e');
  const constraints = (await db.query(`
    select count(*)::int as n from pg_constraint
    where conname = 'restaurant_config_brand_primary_color_format_check'`)).rows[0].n;
  assert.equal(constraints, 1);
}));

scenario('v1.1.0-rc.2 shape: reads its explicit columns and saves every field without touching the color', withDb(async (db) => {
  await applyMigration(db);
  await setColor(db, '#7e22ce');
  const read2 = (await db.query(`select ${RC2_COLUMNS.join(', ')} from restaurant_config limit 1`)).rows[0];
  assert.equal(Object.hasOwn(read2, 'brand_primary_color'), false);
  // Full save from the old Settings screen: every column rc.2 can write.
  const writable = RC2_COLUMNS.filter((column) => !['id', 'updated_at'].includes(column));
  const values = { ...read2, name: 'Nome salvo pela rc.2', phone: '1133334444' };
  await db.query(
    `update restaurant_config set ${writable.map((column, index) => `${column} = $${index + 1}`).join(', ')} where id = $${writable.length + 1}`,
    [...writable.map((column) => values[column]), 'config-1']
  );
  const after = await row(db);
  assert.equal(after.name, 'Nome salvo pela rc.2');
  assert.equal(after.brand_primary_color, '#7e22ce', 'a gravação da versão anterior preserva a cor');
}));

scenario('rollback drops only the column, keeps the row, and can be re-run; the migration applies again', withDb(async (db) => {
  const before = await row(db);
  await applyMigration(db);
  await setColor(db, '#b91c1c');
  await applyRollback(db);
  assert.equal(await hasColumn(db), false);
  // updated_at muda pelo gatilho da tabela quando a cor foi gravada; o resto é igual.
  const withoutTimestamp = ({ updated_at: _ignored, ...rest }) => rest;
  assert.deepEqual(withoutTimestamp(await row(db)), withoutTimestamp(before), 'linha igual à de antes da migration');
  const constraints = (await db.query(`
    select count(*)::int as n from pg_constraint
    where conname = 'restaurant_config_brand_primary_color_format_check'`)).rows[0].n;
  assert.equal(constraints, 0);
  await applyRollback(db);
  await applyMigration(db);
  assert.equal(await hasColumn(db), true);
  assert.equal((await row(db)).brand_primary_color, null);
}));

(async () => {
  let failed = 0;
  for (const { name, run } of scenarios) {
    try {
      await run();
      console.log(`ok - ${name}`);
    } catch (error) {
      failed += 1;
      console.log(`not ok - ${name}\n  ${error.stack}`);
    }
  }
  console.log(`${scenarios.length - failed}/${scenarios.length} scenarios passed`);
  process.exit(failed ? 1 : 0);
})();
