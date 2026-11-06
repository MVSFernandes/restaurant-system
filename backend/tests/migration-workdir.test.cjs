// Regression tests for `db:migrations:check -- --linked --workdir <dir>`:
// <dir>/supabase/migrations must hold exactly the verified active migrations
// (versions, file names, normalized sha256 from the manifest) before the
// remote is queried or any repair/push is suggested. No database and no
// Supabase project: the query functions are replaced by fakes.
//
//   node --test tests/migration-workdir.test.cjs        (from backend/)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lib = require('../scripts/migrations/lib.cjs');
const { main, checkWorkdirMigrations } = require('../scripts/migrations/check-migration-state.cjs');

const manifest = JSON.parse(fs.readFileSync(lib.MANIFEST_FILE, 'utf8'));
const ACTIVE = lib.activeMigrations();
const VERSIONS = ACTIVE.map((m) => m.version);

// ---------- fixtures ----------
const tempDirs = [];
test.after(() => { for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true }); });

// A workdir like the one `supabase link --workdir` creates (supabase/.temp
// only), optionally with a copy of the active migrations plus things the CLI
// ignores (history/, README.md, a non-migration .sql).
function makeWorkdir({ migrations = false, crlf = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-workdir-test-'));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'supabase', '.temp'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'supabase', '.temp', 'project-ref'), 'testprojectref00000');
  if (migrations) {
    const target = path.join(dir, 'supabase', 'migrations');
    fs.mkdirSync(path.join(target, 'history'), { recursive: true });
    for (const migration of ACTIVE) {
      const text = fs.readFileSync(migration.path, 'utf8').replace(/\r\n/g, '\n');
      fs.writeFileSync(path.join(target, migration.file), crlf ? text.replace(/\n/g, '\r\n') : text);
    }
    fs.writeFileSync(path.join(target, 'history', '20260622193500_old_change.sql'), 'select 1;\n');
    fs.writeFileSync(path.join(target, 'README.md'), '# not a migration\n');
    fs.writeFileSync(path.join(target, 'notes.sql'), '-- not a migration (no version prefix)\n');
  }
  return dir;
}
const migrationsDir = (workdir) => path.join(workdir, 'supabase', 'migrations');

// Fake remote: a database at the state after every active migration, no CLI
// history, development marker. Records every call.
function fakeRemote() {
  const calls = [];
  const rows = [...lib.expectedStates(manifest).states[VERSIONS.length]].map(([key, definition_hash]) => {
    const separator = key.indexOf(':');
    return { category: key.slice(0, separator), object_key: key.slice(separator + 1), definition_hash };
  });
  const state = {
    has_history: false,
    history_xml: null,
    marker_xml: '<table><row><installation_id>mesa-teste</installation_id><environment>development</environment></row></table>',
  };
  const answer = () => [rows, [state]];
  return {
    calls,
    linkedQuery: (sqlList, options) => { calls.push({ kind: 'linked', options }); return answer(); },
    dbUrlQuery: async (url) => { calls.push({ kind: 'db-url', url }); return answer(); },
  };
}

async function runCheck(argv) {
  const remote = fakeRemote();
  const out = [];
  const err = [];
  const code = await main(argv, { log: (text) => out.push(text), error: (text) => err.push(text), ...remote });
  return { code, out: out.join('\n'), err: err.join('\n'), calls: remote.calls };
}

const assertBlocked = (result) => {
  assert.equal(result.code, 2, 'blocking error');
  assert.deepEqual(result.calls, [], 'the remote is not queried');
  assert.equal(result.out, '', 'no report');
  assert.doesNotMatch(result.err, /npx supabase|migration repair --status|db push --linked/, 'no repair/push suggested');
  assert.match(result.err, /The --workdir migrations are not the verified active migrations/);
};

// ---------- workdir with only the link ----------
test('workdir with only the link (no supabase/migrations) is refused before querying', async () => {
  const workdir = makeWorkdir();
  const problems = checkWorkdirMigrations(manifest, workdir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /does not exist: the workdir has no migrations/);
  const result = await runCheck(['--linked', '--workdir', workdir]);
  assertBlocked(result);
  assert.match(result.err, /does not exist/);
});

test('workdir with an empty supabase/migrations reports every active migration as missing', async () => {
  const workdir = makeWorkdir();
  fs.mkdirSync(migrationsDir(workdir));
  const problems = checkWorkdirMigrations(manifest, workdir);
  assert.deepEqual(problems.map((p) => p.split(':')[0]), VERSIONS);
  for (const problem of problems) assert.match(problem, /missing from .* \(expected \d+_\w+\.sql\)/);
  assertBlocked(await runCheck(['--linked', '--workdir', workdir]));
});

// ---------- complete and identical ----------
test('complete and identical set: accepted, history/ and non-migration files ignored, remote queried with the same workdir', async () => {
  const workdir = makeWorkdir({ migrations: true });
  assert.deepEqual(checkWorkdirMigrations(manifest, workdir), []);
  const result = await runCheck(['--linked', '--workdir', workdir, '--json']);
  assert.equal(result.code, 10);
  assert.deepEqual(result.calls, [{ kind: 'linked', options: { workdir: path.resolve(workdir) } }]);
  const report = JSON.parse(result.out);
  assert.equal(report.verdict, 'needs_recording');
  assert.deepEqual(report.toRecord, VERSIONS);
  assert.equal(report.commands.repair, `npx supabase migration repair --status applied ${VERSIONS.join(' ')} --linked --workdir ${path.resolve(workdir)}`);
});

test('line endings do not matter (hash normalized like the manifest)', () => {
  const workdir = makeWorkdir({ migrations: true, crlf: true });
  assert.ok(fs.readFileSync(path.join(migrationsDir(workdir), ACTIVE[0].file), 'utf8').includes('\r\n'));
  assert.deepEqual(checkWorkdirMigrations(manifest, workdir), []);
});

test('backend/ itself as workdir is the identical set', () => {
  assert.deepEqual(checkWorkdirMigrations(manifest, lib.BACKEND_DIR), []);
});

// ---------- missing or altered file ----------
test('missing migration file is refused', async () => {
  const workdir = makeWorkdir({ migrations: true });
  const removed = ACTIVE[2];
  fs.rmSync(path.join(migrationsDir(workdir), removed.file));
  assert.deepEqual(checkWorkdirMigrations(manifest, workdir), [`${removed.version}: missing from ${migrationsDir(workdir)} (expected ${removed.file})`]);
  assertBlocked(await runCheck(['--linked', '--workdir', workdir]));
});

test('altered migration file is refused', async () => {
  const workdir = makeWorkdir({ migrations: true });
  const altered = ACTIVE[ACTIVE.length - 1];
  fs.appendFileSync(path.join(migrationsDir(workdir), altered.file), '\n-- changed\n');
  assert.deepEqual(checkWorkdirMigrations(manifest, workdir), [`${altered.version}: ${altered.file} in the workdir differs from the verified migration (sha256)`]);
  assertBlocked(await runCheck(['--linked', '--workdir', workdir]));
});

test('renamed migration file (same version, other name) is refused', async () => {
  const workdir = makeWorkdir({ migrations: true });
  const renamed = ACTIVE[1];
  fs.renameSync(path.join(migrationsDir(workdir), renamed.file), path.join(migrationsDir(workdir), `${renamed.version}_renamed.sql`));
  assert.deepEqual(checkWorkdirMigrations(manifest, workdir), [`${renamed.version}: file name ${renamed.version}_renamed.sql differs from ${renamed.file}`]);
  assertBlocked(await runCheck(['--linked', '--workdir', workdir]));
});

// ---------- duplicate or additional version ----------
test('duplicate version in the workdir is refused', async () => {
  const workdir = makeWorkdir({ migrations: true });
  const original = ACTIVE[0];
  const copy = `${original.version}_copy.sql`;
  fs.copyFileSync(path.join(migrationsDir(workdir), original.file), path.join(migrationsDir(workdir), copy));
  const problems = checkWorkdirMigrations(manifest, workdir);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].startsWith(`${original.version}: duplicate version in ${migrationsDir(workdir)}`), problems[0]);
  assert.ok(problems[0].includes(original.file) && problems[0].includes(copy), problems[0]);
  assertBlocked(await runCheck(['--linked', '--workdir', workdir]));
});

test('additional migration in the workdir is refused', async () => {
  const workdir = makeWorkdir({ migrations: true });
  fs.writeFileSync(path.join(migrationsDir(workdir), '29990101000000_extra.sql'), 'select 1;\n');
  assert.deepEqual(checkWorkdirMigrations(manifest, workdir), [`29990101000000: additional migration 29990101000000_extra.sql in ${migrationsDir(workdir)} is not an active migration of backend/`]);
  assertBlocked(await runCheck(['--linked', '--workdir', workdir]));
});

// ---------- destinations already supported ----------
test('--linked from backend/ (no --workdir) is unchanged: no workdir validation, same command', async () => {
  const result = await runCheck(['--linked', '--json']);
  assert.equal(result.code, 10);
  assert.deepEqual(result.calls, [{ kind: 'linked', options: { workdir: null } }]);
  const report = JSON.parse(result.out);
  assert.deepEqual(report.target, { kind: 'linked', workdir: null });
  assert.equal(report.commands.repair, `npx supabase migration repair --status applied ${VERSIONS.join(' ')} --linked`);
  const text = await runCheck(['--linked']);
  assert.equal(text.code, 10);
  assert.match(text.out, /Verdict: NEEDS_RECORDING/);
  assert.doesNotMatch(text.out, /--workdir|--db-url/);
});

test('--db-url is unchanged: no workdir validation, placeholder command, no password', async () => {
  const url = 'postgresql://postgres:s3cr3t-Pa55@db.example.test:5432/postgres';
  const result = await runCheck(['--db-url', url, '--json']);
  assert.equal(result.code, 10);
  assert.deepEqual(result.calls, [{ kind: 'db-url', url }]);
  const report = JSON.parse(result.out);
  assert.equal(report.commands.repair, `npx supabase migration repair --status applied ${VERSIONS.join(' ')} --db-url <DB_URL>`);
  assert.doesNotMatch(result.out, /s3cr3t/);
  const text = await runCheck(['--db-url', url]);
  assert.doesNotMatch(text.out, /s3cr3t|--linked|--workdir/);
  assert.match(text.out, /--db-url <DB_URL>/);
});

test('--workdir with --db-url is still refused', async () => {
  await assert.rejects(runCheck(['--db-url', 'postgres://x@localhost/db', '--workdir', makeWorkdir({ migrations: true })]), /--workdir only applies to --linked/);
});
