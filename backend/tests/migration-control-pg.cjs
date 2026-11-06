// Rehearsal of the migration control procedure (Etapa 1B.2) on a disposable
// LOCAL PostgreSQL server, with the Supabase CLI from the backend devDependency.
//
// Scenarios:
//   1. new database: `supabase db push` applies everything in order and records it;
//   2. existing database installed by hand (no CLI history): the check proves
//      every version from the catalog, `migration repair --status applied`
//      records them without running SQL, and data/marker stay untouched;
//   3. repetition: push and repair again change nothing (no DDL in public);
//   4. existing database one migration behind: record what exists, push the rest
//      (the printed repair/push commands target the checked --db-url through
//      a <DB_URL> placeholder, never --linked, never the password);
//   5. divergences: changed privilege, partially applied migration, history
//      that disagrees with the catalog, a history/ version recorded, and a
//      modified migration file are all refused;
//   6. ambiguity: a data-only migration does not change the catalog, so it is
//      reported AMBIGUOUS (not recorded, not pushed) whether it ran or not;
//   7. duplicate versions (files or manifest) are refused before any query.
// Pure unit tests of the same rules: tests/migration-check.test.cjs.
//
// Safety:
// - only localhost / 127.0.0.1 / ::1 are accepted;
// - every scenario creates its own database (rs_migration_control_<random>)
//   and drops only that database; API roles are created only if missing and
//   only the roles created here are dropped;
// - no Supabase project and no real credentials are used.
//
// Requirements: the `pg` helper used by the other *-sql tests, and a server
// with ssl=on (the Supabase CLI refuses plain connections even on localhost).
// Example (Docker), from the repository root:
//   docker run --rm -d --name rs-migrations-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17 \
//     -c ssl=on -c ssl_cert_file=/etc/ssl/certs/ssl-cert-snakeoil.pem -c ssl_key_file=/etc/ssl/private/ssl-cert-snakeoil.key
//   npm install --prefix backend/node_modules/.stock-validation --no-package-lock --no-save @electric-sql/pglite@0.5.8 pg@8.23.1
//   MIGRATION_CHECK_PG_URL=postgres://postgres:postgres@127.0.0.1:55432/postgres node backend/tests/migration-control-pg.cjs
//   docker stop rs-migrations-pg
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const lib = require('../scripts/migrations/lib.cjs');
const { analyse, checkFiles } = require('../scripts/migrations/check-migration-state.cjs');

const serverUrl = process.env.MIGRATION_CHECK_PG_URL;
if (!serverUrl) {
  console.log('NOT RUN: set MIGRATION_CHECK_PG_URL to a local PostgreSQL server with ssl=on (see header).');
  process.exit(2);
}
if (!lib.isLocalUrl(serverUrl)) {
  console.error(`REFUSED: ${new URL(serverUrl).hostname} is not a local host. This test creates and drops databases.`);
  process.exit(2);
}

const { Client } = lib.loadPg();
const BACKEND = lib.BACKEND_DIR;
const SUPABASE = path.join(BACKEND, 'node_modules', 'supabase', 'bin', process.platform === 'win32' ? 'supabase.exe' : 'supabase');
const CHECK = path.join(BACKEND, 'scripts', 'migrations', 'check-migration-state.cjs');
const MIGRATIONS = lib.activeMigrations();
const VERSIONS = MIGRATIONS.map((m) => m.version);
const manifest = JSON.parse(fs.readFileSync(lib.MANIFEST_FILE, 'utf8'));
const API_ROLES = ['anon', 'authenticated', 'service_role'];

const urlFor = (database) => {
  const copy = new URL(serverUrl);
  copy.pathname = `/${database}`;
  return copy.toString();
};

const cli = (...args) => {
  const run = spawnSync(SUPABASE, args, { cwd: BACKEND, encoding: 'utf8', input: 'y\n' });
  const output = `${run.stdout || ''}${run.stderr || ''}`;
  return { status: run.status, output };
};

const check = (url) => {
  const run = spawnSync(process.execPath, [CHECK, '--db-url', url, '--json'], { cwd: BACKEND, encoding: 'utf8' });
  assert.ok([0, 1, 10, 20, 30].includes(run.status), `check failed to run (exit ${run.status}): ${run.stderr}`);
  return { status: run.status, report: JSON.parse(run.stdout) };
};
const checkText = (url) => spawnSync(process.execPath, [CHECK, '--db-url', url], { cwd: BACKEND, encoding: 'utf8' });

// The test URL carries a password; it must never be printed.
const PASSWORD = new URL(serverUrl).password;
const assertNoSecret = (text) => {
  if (PASSWORD) assert.ok(!text.includes(`:${PASSWORD}@`), 'the password is not printed');
};

const query = async (url, sql, params = []) => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try { return (await client.query(sql, params)).rows; } finally { await client.end(); }
};

// Applies migration files the way an administrator does in the SQL editor:
// whole file, no CLI history.
const applyByHand = async (url, files) => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const migration of files) await client.query(fs.readFileSync(migration.path, 'utf8'));
  } finally { await client.end(); }
};

// Records every DDL command that touches the public schema from now on, so a
// scenario can prove that a step ran no application SQL.
const watchPublicDdl = (url) => query(url, `
  create table if not exists public.zz_test_ddl_log (tag text, object_identity text);
  create or replace function public.zz_test_log_ddl() returns event_trigger language plpgsql as $f$
  declare r record;
  begin
    for r in select * from pg_event_trigger_ddl_commands() loop
      if r.schema_name = 'public' and r.object_identity not like 'public.zz_test%' then
        insert into public.zz_test_ddl_log values (r.command_tag, r.object_identity);
      end if;
    end loop;
  end; $f$;
  drop event trigger if exists zz_test_ddl;
  create event trigger zz_test_ddl on ddl_command_end execute function public.zz_test_log_ddl();
`);
const publicDdl = async (url) => (await query(url, 'select tag, object_identity from public.zz_test_ddl_log')).map((r) => `${r.tag} ${r.object_identity}`);
const stopWatching = (url) => query(url, `
  drop event trigger if exists zz_test_ddl;
  drop function if exists public.zz_test_log_ddl();
  drop table if exists public.zz_test_ddl_log;
`);

const history = async (url) => {
  const [{ present }] = await query(url, "select to_regclass('supabase_migrations.schema_migrations') is not null as present");
  return present ? (await query(url, 'select version from supabase_migrations.schema_migrations order by version')).map((r) => r.version) : null;
};

const seedBusinessData = (url) => query(url, `
  insert into public.users (id, name, email, password, role) values ('admin-1', 'Admin', 'admin@example.test', 'not-a-real-hash', 'ADMIN');
  insert into public.stock_items (id, name, quantity, unit) values ('bun', 'Pão', 10, 'un');
  insert into public.categories (id, name) values ('food', 'Lanches');
`);
const setMarker = (url) => query(url, "insert into public.app_installation (installation_id, environment) values ('mesa-teste-dev', 'development')");
const businessState = async (url) => JSON.stringify(await query(url, `
  select (select count(*) from public.users)::int as users,
         (select quantity::float from public.stock_items where id = 'bun') as bun,
         (select count(*) from public.categories)::int as categories,
         (select count(*) from public.orders)::int as orders,
         (select json_agg(row_to_json(m)) from (select installation_id, environment, configured_at from public.app_installation) m) as marker,
         (select json_agg(row_to_json(r)) from (select * from public.order_stock_ledger_rollout) r) as rollout`));

// ---------- harness ----------
const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });
let createdRoles = [];

async function withDatabase(run) {
  const database = `rs_migration_control_${crypto.randomBytes(4).toString('hex')}`;
  const admin = new Client({ connectionString: serverUrl });
  await admin.connect();
  await admin.query(`create database ${database}`);
  await admin.end();
  const url = urlFor(database);
  await query(url, lib.SUPABASE_DATABASE_SETUP);
  try {
    await run(url);
  } finally {
    const cleanup = new Client({ connectionString: serverUrl });
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${database} with (force)`);
    await cleanup.end();
  }
}

// ---------- scenarios ----------
scenario('new database: db push applies every active migration in order and records it; history/ is ignored', () => withDatabase(async (url) => {
  const empty = check(url);
  assert.equal(empty.status, 20, 'a fresh project (pgcrypto already in extensions) is pending from zero');
  assert.deepEqual(empty.report.pending, VERSIONS);
  const dry = cli('db', 'push', '--db-url', url, '--dry-run');
  assert.equal(dry.status, 0, dry.output);
  const listed = [...dry.output.matchAll(/• (\d+)_/g)].map((m) => m[1]);
  assert.deepEqual(listed, VERSIONS, 'dry run lists exactly the active migrations, in order');
  assert.doesNotMatch(dry.output, /20260622193500|20261003120000/, 'no history/ version is considered');

  const push = cli('db', 'push', '--db-url', url, '--yes');
  assert.equal(push.status, 0, push.output);
  assert.deepEqual(await history(url), VERSIONS);
  const { status, report } = check(url);
  assert.equal(status, 0);
  assert.equal(report.verdict, 'up_to_date');
  assert.equal((await query(url, 'select count(*)::int as n from public.app_installation'))[0].n, 0, 'the marker is never written by migrations');
}));

scenario('repetition after a new install: push and repair change nothing', () => withDatabase(async (url) => {
  assert.equal(cli('db', 'push', '--db-url', url, '--yes').status, 0);
  await seedBusinessData(url);
  await setMarker(url);
  const before = await businessState(url);
  await watchPublicDdl(url);

  const again = cli('db', 'push', '--db-url', url, '--yes');
  assert.equal(again.status, 0, again.output);
  assert.match(again.output, /Remote database is up to date/);
  const repair = cli('migration', 'repair', '--status', 'applied', ...VERSIONS, '--db-url', url);
  assert.equal(repair.status, 0, repair.output);

  assert.deepEqual(await publicDdl(url), [], 'no application SQL ran');
  await stopWatching(url);
  assert.equal(await businessState(url), before);
  assert.deepEqual(await history(url), VERSIONS);
  assert.equal(check(url).report.verdict, 'up_to_date');
}));

scenario('existing database installed by hand: proven by the catalog, recorded by repair without running SQL', () => withDatabase(async (url) => {
  await applyByHand(url, MIGRATIONS);
  await seedBusinessData(url);
  await setMarker(url);
  assert.equal(await history(url), null, 'no CLI history, like the development project');

  const first = check(url);
  assert.equal(first.status, 10);
  assert.equal(first.report.verdict, 'needs_recording');
  assert.deepEqual(first.report.toRecord, VERSIONS);
  assert.deepEqual(first.report.marker, [{ installation_id: 'mesa-teste-dev', environment: 'development' }]);

  const before = await businessState(url);
  await watchPublicDdl(url);
  const repair = cli('migration', 'repair', '--status', 'applied', ...first.report.toRecord, '--db-url', url);
  assert.equal(repair.status, 0, repair.output);
  assert.deepEqual(await publicDdl(url), [], 'repair touched only supabase_migrations');
  assert.deepEqual(await history(url), VERSIONS);

  // Repetition: nothing to push, repair again is harmless.
  const push = cli('db', 'push', '--db-url', url, '--yes');
  assert.equal(push.status, 0, push.output);
  assert.match(push.output, /Remote database is up to date/);
  assert.equal(cli('migration', 'repair', '--status', 'applied', ...VERSIONS, '--db-url', url).status, 0);
  assert.deepEqual(await publicDdl(url), []);
  await stopWatching(url);
  assert.equal(await businessState(url), before, 'business rows and marker unchanged');
  assert.deepEqual(await history(url), VERSIONS);

  const second = check(url);
  assert.equal(second.status, 0);
  assert.equal(second.report.verdict, 'up_to_date');
}));

scenario('existing database one migration behind: record what exists, then push only the missing one', () => withDatabase(async (url) => {
  const last = MIGRATIONS[MIGRATIONS.length - 1];
  await applyByHand(url, MIGRATIONS.slice(0, -1));
  await seedBusinessData(url);

  const first = check(url);
  assert.equal(first.report.verdict, 'needs_recording');
  assert.deepEqual(first.report.toRecord, VERSIONS.slice(0, -1));
  assert.deepEqual(first.report.pending, [last.version]);
  // The printed command targets the database that was checked, not --linked.
  assert.equal(first.report.commands.repair, `npx supabase migration repair --status applied ${VERSIONS.slice(0, -1).join(' ')} --db-url <DB_URL>`);
  const firstText = checkText(url);
  assert.equal(firstText.status, 10);
  assert.match(firstText.stdout, /--db-url <DB_URL>/);
  assert.match(firstText.stdout, /<DB_URL> = the same database that was checked \(postgres(ql)?:\/\/[^)]*\*\*\*@/);
  assert.doesNotMatch(firstText.stdout, /--linked/);
  assertNoSecret(`${firstText.stdout}${firstText.stderr}${JSON.stringify(first.report)}`);

  assert.equal(cli('migration', 'repair', '--status', 'applied', ...first.report.toRecord, '--db-url', url).status, 0);
  const second = check(url);
  assert.equal(second.status, 20);
  assert.equal(second.report.verdict, 'pending');
  assert.equal(second.report.commands.push, 'npx supabase db push --db-url <DB_URL>');
  assert.equal(second.report.commands.push_dry_run, 'npx supabase db push --db-url <DB_URL> --dry-run');
  const secondText = checkText(url);
  assert.doesNotMatch(secondText.stdout, /--linked/);
  assertNoSecret(`${secondText.stdout}${JSON.stringify(second.report)}`);

  await watchPublicDdl(url);
  const dry = cli('db', 'push', '--db-url', url, '--dry-run');
  assert.deepEqual([...dry.output.matchAll(/• (\d+)_/g)].map((m) => m[1]), [last.version]);
  const push = cli('db', 'push', '--db-url', url, '--yes');
  assert.equal(push.status, 0, push.output);
  const ddl = await publicDdl(url);
  // Objects the last migration creates or changes, from its manifest delta
  // (e.g. "functions:create_first_admin(...)" -> create_first_admin).
  const lastEntry = manifest.migrations.find((m) => m.version === last.version);
  const touched = [...Object.keys(lastEntry.added), ...Object.keys(lastEntry.changed), ...lastEntry.removed]
    .map((key) => key.slice(key.indexOf(':') + 1).split(/[.(@]/)[0]);
  const touchedPattern = new RegExp(`public\\.(${[...new Set(touched)].join('|')})\\b`);
  assert.ok(ddl.length > 0 && ddl.every((line) => touchedPattern.test(line)), `only the missing migration ran: ${ddl.join('; ')}`);
  await stopWatching(url);
  assert.deepEqual(await query(url, "select (select count(*) from public.users)::int as users, (select quantity::float from public.stock_items where id = 'bun') as bun"), [{ users: 1, bun: 10 }]);
  assert.equal(check(url).report.verdict, 'up_to_date');
}));

scenario('divergence: a changed privilege is reported against the migration that set it', () => withDatabase(async (url) => {
  await applyByHand(url, MIGRATIONS);
  await query(url, 'grant insert on public.app_installation to anon');
  const { status, report } = check(url);
  assert.equal(status, 1);
  assert.equal(report.verdict, 'divergent');
  const appInstallationVersion = MIGRATIONS.find((m) => m.name === 'app_installation').version;
  assert.deepEqual(report.divergence.different, [{ key: 'table_privileges:app_installation@anon', set_by: appInstallationVersion }]);
  assert.deepEqual(report.toRecord, [], 'nothing is offered for recording');
}));

scenario('divergence: a partially applied migration is not taken as applied nor as absent', () => withDatabase(async (url) => {
  await applyByHand(url, MIGRATIONS.slice(0, 4));
  // Only the first table of the Etapa 1A ledger, as if the file had been cut.
  await query(url, `create table public.order_stock_movements (
    id bigint generated by default as identity primary key, order_id text, order_ref text not null,
    stock_item_id text not null, direction text not null, quantity numeric not null, reason text not null,
    created_at timestamptz not null default now())`);
  const { status, report } = check(url);
  assert.equal(status, 1);
  assert.equal(report.divergence.closest_after, VERSIONS[3]);
  assert.ok(report.divergence.unexpected.some((item) => item.key === 'tables:order_stock_movements' && item.next_migration_touches_it === VERSIONS[4]));
}));

scenario('divergence: CLI history that disagrees with the catalog is refused', () => withDatabase(async (url) => {
  await applyByHand(url, MIGRATIONS.slice(0, -1));
  // Someone recorded the last version without applying it.
  assert.equal(cli('migration', 'repair', '--status', 'applied', ...VERSIONS, '--db-url', url).status, 0);
  const recordedAhead = check(url);
  assert.equal(recordedAhead.report.verdict, 'divergent');
  assert.match(recordedAhead.report.reasons.join(' '), new RegExp(`${VERSIONS[VERSIONS.length - 1]}`));

  // A version from history/ recorded as if it were active.
  await query(url, "insert into supabase_migrations.schema_migrations (version, name) values ('20261003120000', 'restrict_application_rpc_execute')");
  const legacy = check(url);
  assert.equal(legacy.report.verdict, 'divergent');
  assert.match(legacy.report.reasons.join(' '), /20261003120000/);
}));

scenario('ambiguity: a data-only migration leaves the catalog unchanged, so it is neither recorded nor pushed', () => withDatabase(async (url) => {
  // A hypothetical next migration that only changes data (it is not written to
  // supabase/migrations; the manifest entry is what build-migration-catalog
  // would produce for it: an empty delta).
  const DATA_ONLY = { version: '29990101000000', name: 'seed_default_category', sql: "insert into public.categories (id, name) values ('default', 'Geral')" };
  const withDataOnly = { ...manifest, migrations: [...manifest.migrations, { version: DATA_ONLY.version, name: DATA_ONLY.name, sha256: 'f'.repeat(64), added: {}, changed: {}, removed: [] }] };
  await applyByHand(url, MIGRATIONS);
  const catalog = () => query(url, lib.readCatalogQuery());

  const notRun = await catalog();
  const notRunReport = analyse({ manifest: withDataOnly, catalogRows: notRun, history: [], hasHistory: false });
  assert.equal(notRunReport.verdict, 'ambiguous', 'never executed: must not be offered for recording');
  assert.deepEqual(notRunReport.toRecord, []);
  assert.deepEqual(notRunReport.ambiguity.undetermined, [DATA_ONLY.version]);

  await query(url, DATA_ONLY.sql);
  const afterRun = await catalog();
  assert.deepEqual(lib.rowsToMap(afterRun), lib.rowsToMap(notRun), 'the fingerprint cannot see the data change');
  const afterRunReport = analyse({ manifest: withDataOnly, catalogRows: afterRun, history: [], hasHistory: false });
  assert.equal(afterRunReport.verdict, 'ambiguous', 'executed by hand: must not be offered for push either');
  assert.deepEqual(afterRunReport.pending, []);

  // The committed manifest (no data-only migration) still reconciles normally.
  assert.equal(analyse({ manifest, catalogRows: afterRun, history: [], hasHistory: false }).verdict, 'needs_recording');
}));

scenario('pure analysis: changed migration file and unknown file are reported before any database access', async () => {
  const altered = MIGRATIONS.map((m, index) => (index === 1 ? { ...m, sha256: '0'.repeat(64) } : m));
  assert.match(checkFiles(manifest, altered).join('\n'), new RegExp(`${VERSIONS[1]}: file content differs`));
  const extra = [...MIGRATIONS, { version: '29991231000000', name: 'future', sha256: 'x' }];
  assert.match(checkFiles(manifest, extra).join('\n'), /29991231000000: not in the manifest/);
  assert.deepEqual(checkFiles(manifest, MIGRATIONS), [], 'committed files match the committed manifest');
  const duplicateFile = { ...MIGRATIONS[0], name: 'copy', file: `${VERSIONS[0]}_copy.sql`, sha256: '0'.repeat(64) };
  assert.match(checkFiles(manifest, [...MIGRATIONS, duplicateFile]).join('\n'), new RegExp(`${VERSIONS[0]}: duplicate version in supabase/migrations`));
  const duplicateEntry = { ...manifest, migrations: [...manifest.migrations, manifest.migrations[0]] };
  assert.match(checkFiles(duplicateEntry, MIGRATIONS).join('\n'), new RegExp(`${VERSIONS[0]}: appears 2 times in the manifest`));
  // An empty database is "pending" from zero, never "applied".
  const empty = analyse({ manifest, catalogRows: [], history: [], hasHistory: false });
  assert.equal(empty.verdict, 'pending');
  assert.deepEqual(empty.pending, VERSIONS);
});

(async () => {
  const admin = new Client({ connectionString: serverUrl });
  await admin.connect();
  createdRoles = (await admin.query('select unnest($1::text[]) as role except select rolname from pg_roles', [API_ROLES])).rows.map((r) => r.role);
  await admin.query(lib.SUPABASE_ROLE_SETUP);
  await admin.end();
  let failed = 0;
  try {
    for (const { name, run } of scenarios) {
      try {
        await run();
        console.log(`ok - ${name}`);
      } catch (error) {
        failed += 1;
        console.log(`not ok - ${name}\n  ${String(error.stack || error).split('\n').join('\n  ')}`);
      }
    }
  } finally {
    const cleanup = new Client({ connectionString: serverUrl });
    await cleanup.connect();
    for (const role of createdRoles) await cleanup.query(`drop role if exists ${role}`).catch(() => {});
    await cleanup.end();
  }
  console.log(`\n${scenarios.length - failed}/${scenarios.length} scenarios passed`);
  process.exit(failed ? 1 : 0);
})();
