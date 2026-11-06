// Unit tests of the migration check (Etapa 1B.2), without any database:
// ambiguity of the catalog fingerprint, destination of the printed commands
// and duplicate versions. The PostgreSQL rehearsal is tests/migration-control-pg.cjs.
//
//   node --test tests/migration-check.test.cjs        (from backend/)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lib = require('../scripts/migrations/lib.cjs');
const {
  analyse, checkFiles, commandsFor, formatReport, parseArgs, describeTarget, EXIT,
} = require('../scripts/migrations/check-migration-state.cjs');

const manifest = JSON.parse(fs.readFileSync(lib.MANIFEST_FILE, 'utf8'));
const VERSIONS = manifest.migrations.map((m) => m.version);
const LAST = VERSIONS[VERSIONS.length - 1];

// Catalog rows of a database that is exactly at the expected state after the
// first `count` migrations of `source`.
const catalogAfter = (source, count) => [...lib.expectedStates(source).states[count]].map(([key, definition_hash]) => {
  const separator = key.indexOf(':');
  return { category: key.slice(0, separator), object_key: key.slice(separator + 1), definition_hash };
});
const recordedVersions = (versions) => versions.map((version) => ({ version, name: 'x' }));
const traceless = (version) => ({ version, name: 'data_only', sha256: 'f'.repeat(64), added: {}, changed: {}, removed: [] });
const render = (report, target) => formatReport(report, { source: 'test', marker: [], commands: commandsFor(report, target) });
const DIRECT = { kind: 'db-url', url: 'postgresql://postgres:s3cr3t-Pa55@db.example.test:5432/postgres?sslmode=require&password=other-s3cr3t' };
const LINKED = { kind: 'linked', workdir: null };

// ---------- 1. ambiguity of the fingerprint ----------
test('a new migration with the same fingerprint as the previous one, not executed, is not offered for recording', () => {
  const NEW = '29990101000000';
  const withNew = { ...manifest, migrations: [...manifest.migrations, traceless(NEW)] };
  // Database installed by hand up to the current last migration; NEW never ran.
  const report = analyse({ manifest: withNew, catalogRows: catalogAfter(manifest, VERSIONS.length), history: [], hasHistory: false });

  assert.equal(report.verdict, 'ambiguous');
  assert.equal(EXIT[report.verdict], 30, 'blocking exit code');
  assert.deepEqual(report.toRecord, [], 'nothing is offered for recording');
  assert.deepEqual(report.pending, [], 'nothing is offered for push either');
  assert.deepEqual(report.ambiguity.undetermined, [NEW]);
  assert.deepEqual(report.ambiguity.candidates_after, [LAST, NEW]);
  assert.deepEqual(report.ambiguity.proven, VERSIONS);
  assert.match(report.reasons.join(' '), new RegExp(`${NEW} does not change the fingerprinted catalog`));

  for (const target of [DIRECT, LINKED]) {
    const commands = commandsFor(report, target);
    assert.deepEqual(commands, { repair: null, push_dry_run: null, push: null, placeholder: null });
    const text = render(report, target);
    assert.doesNotMatch(text, /npx supabase/, 'no command is printed');
    assert.match(text, /Verdict: AMBIGUOUS/);
    assert.match(text, /nothing is recommended/);
    assert.match(text, new RegExp(`${NEW}  catalog: undetermined`));
  }
});

test('ambiguity is not settled by a history that stops before the traceless migration', () => {
  const NEW = '29990101000000';
  const withNew = { ...manifest, migrations: [...manifest.migrations, traceless(NEW)] };
  const report = analyse({ manifest: withNew, catalogRows: catalogAfter(manifest, VERSIONS.length), history: recordedVersions(VERSIONS), hasHistory: true });
  assert.equal(report.verdict, 'ambiguous', 'pushing it could run it twice; recording it could skip it');
  assert.deepEqual(report.toRecord, []);
  assert.deepEqual(report.pending, []);
});

test('a history that records every candidate settles it (consistent with the catalog), with a note', () => {
  const NEW = '29990101000000';
  const withNew = { ...manifest, migrations: [...manifest.migrations, traceless(NEW)] };
  const report = analyse({ manifest: withNew, catalogRows: catalogAfter(manifest, VERSIONS.length), history: recordedVersions([...VERSIONS, NEW]), hasHistory: true });
  assert.equal(report.verdict, 'up_to_date');
  assert.match(report.notes.join(' '), new RegExp(`${NEW} are taken as applied from the CLI history, not proven by the catalog`));
  const withUnknown = analyse({ manifest: withNew, catalogRows: catalogAfter(manifest, VERSIONS.length), history: recordedVersions(['20260622193500']), hasHistory: true });
  assert.equal(withUnknown.verdict, 'divergent', 'unknown history versions stay divergent');
});

test('a traceless migration in the middle is not proven by the later ones', () => {
  const MIDDLE = `${VERSIONS[VERSIONS.length - 2].slice(0, -1)}9`; // sorts between the last two
  assert.ok(MIDDLE > VERSIONS[VERSIONS.length - 2] && MIDDLE < LAST);
  const migrations = [...manifest.migrations];
  migrations.splice(migrations.length - 1, 0, traceless(MIDDLE));
  const withMiddle = { ...manifest, migrations };
  // Every migration ran by hand except MIDDLE: the catalog is the same either way.
  const report = analyse({ manifest: withMiddle, catalogRows: catalogAfter(manifest, VERSIONS.length), history: [], hasHistory: false });
  assert.equal(report.verdict, 'ambiguous');
  assert.deepEqual(report.toRecord, []);
  assert.deepEqual(report.ambiguity.undetermined, [MIDDLE]);
  assert.deepEqual(report.ambiguity.proven, VERSIONS);
  // Once the history records it, the others can be recorded normally.
  const recorded = analyse({ manifest: withMiddle, catalogRows: catalogAfter(manifest, VERSIONS.length), history: recordedVersions([MIDDLE]), hasHistory: true });
  assert.equal(recorded.verdict, 'needs_recording');
  assert.deepEqual(recorded.toRecord, VERSIONS);
});

test('the committed manifest has no traceless migration: the normal reconciliation is unaffected', () => {
  const report = analyse({ manifest, catalogRows: catalogAfter(manifest, VERSIONS.length), history: [], hasHistory: false });
  assert.equal(report.verdict, 'needs_recording');
  assert.deepEqual(report.toRecord, VERSIONS);
  const states = lib.expectedStates(manifest).states;
  for (let index = 1; index < states.length; index += 1) {
    assert.notDeepEqual([...states[index]], [...states[index - 1]], `${VERSIONS[index - 1]} changes the fingerprint`);
  }
});

// ---------- 2. destination of the commands ----------
const needsRecording = () => analyse({ manifest, catalogRows: catalogAfter(manifest, VERSIONS.length - 1), history: [], hasHistory: false });
const pending = () => analyse({ manifest, catalogRows: catalogAfter(manifest, VERSIONS.length - 1), history: recordedVersions(VERSIONS.slice(0, -1)), hasHistory: true });

test('direct connection (--db-url): commands target the same URL through a placeholder, never --linked, never the password', () => {
  for (const report of [needsRecording(), pending()]) {
    const commands = commandsFor(report, DIRECT);
    const text = render(report, DIRECT);
    const printed = [commands.repair, commands.push_dry_run, commands.push].filter(Boolean);
    assert.ok(printed.length > 0);
    for (const command of printed) {
      assert.match(command, /--db-url <DB_URL>/);
      assert.doesNotMatch(command, /--linked/);
    }
    assert.match(commands.placeholder, /<DB_URL> = the same database that was checked \(postgresql:\/\/postgres:\*\*\*@db\.example\.test:5432\/postgres\?sslmode=require&password=\*\*\*\)/);
    assert.doesNotMatch(text, /--linked/);
    assert.doesNotMatch(text, /s3cr3t/, 'no password in the text output');
    assert.doesNotMatch(JSON.stringify({ target: describeTarget(DIRECT), commands }), /s3cr3t/, 'no password in the JSON output');
  }
  assert.equal(commandsFor(needsRecording(), DIRECT).repair, `npx supabase migration repair --status applied ${VERSIONS.slice(0, -1).join(' ')} --db-url <DB_URL>`);
  assert.equal(commandsFor(pending(), DIRECT).push, 'npx supabase db push --db-url <DB_URL>');
  assert.equal(commandsFor(pending(), DIRECT).push_dry_run, 'npx supabase db push --db-url <DB_URL> --dry-run');
});

test('linked (default link of backend/): commands use --linked only', () => {
  const repair = commandsFor(needsRecording(), LINKED);
  assert.equal(repair.repair, `npx supabase migration repair --status applied ${VERSIONS.slice(0, -1).join(' ')} --linked`);
  assert.equal(repair.placeholder, null);
  const push = commandsFor(pending(), LINKED);
  assert.equal(push.push_dry_run, 'npx supabase db push --linked --dry-run');
  assert.equal(push.push, 'npx supabase db push --linked');
  assert.doesNotMatch(render(pending(), LINKED), /--db-url|--workdir/);
});

test('linked with --workdir: the same workdir (absolute) is kept in every command, quoted when needed', () => {
  const { target } = parseArgs(['--linked', '--workdir', '../tmp/link dir']);
  const absolute = path.resolve(lib.BACKEND_DIR, '../tmp/link dir');
  assert.deepEqual(target, { kind: 'linked', workdir: absolute });
  const repair = commandsFor(needsRecording(), target);
  assert.equal(repair.repair, `npx supabase migration repair --status applied ${VERSIONS.slice(0, -1).join(' ')} --linked --workdir "${absolute}"`);
  const push = commandsFor(pending(), target);
  assert.equal(push.push_dry_run, `npx supabase db push --linked --workdir "${absolute}" --dry-run`);
  assert.equal(push.push, `npx supabase db push --linked --workdir "${absolute}"`);
  const plain = parseArgs(['--linked', '--workdir', path.join(os.tmpdir(), 'rs-link')]).target;
  assert.equal(commandsFor(pending(), plain).push, `npx supabase db push --linked --workdir ${path.join(os.tmpdir(), 'rs-link')}`);
});

test('arguments: one source only, --workdir only with --linked, values required', () => {
  assert.throws(() => parseArgs([]), /exactly one source/);
  assert.throws(() => parseArgs(['--linked', '--db-url', 'postgres://x@localhost/db']), /exactly one source/);
  assert.throws(() => parseArgs(['--db-url', 'postgres://x@localhost/db', '--workdir', 'somewhere']), /--workdir only applies to --linked/);
  assert.throws(() => parseArgs(['--db-url', '--json']), /--db-url needs a value/);
  assert.throws(() => parseArgs(['--linked', '--workdir']), /--workdir needs a value/);
  assert.deepEqual(parseArgs(['--db-url', DIRECT.url, '--json']), { json: true, target: DIRECT });
  assert.deepEqual(describeTarget(DIRECT), { kind: 'db-url', url: 'postgresql://postgres:***@db.example.test:5432/postgres?sslmode=require&password=***' });
});

test('blocking verdicts print no command', () => {
  const divergent = analyse({ manifest, catalogRows: catalogAfter(manifest, VERSIONS.length), history: recordedVersions(['20260622193500']), hasHistory: true });
  assert.equal(divergent.verdict, 'divergent');
  for (const target of [DIRECT, LINKED]) assert.doesNotMatch(render(divergent, target), /npx supabase/);
});

// ---------- 3. duplicate versions ----------
const localFiles = manifest.migrations.map((m) => ({ version: m.version, name: m.name, file: `${m.version}_${m.name}.sql`, sha256: m.sha256 }));

test('duplicate version in the local files is refused even when one of them matches the manifest', () => {
  const first = localFiles[0];
  const duplicate = { ...first, name: 'other', file: `${first.version}_other.sql`, sha256: '0'.repeat(64) };
  for (const files of [[...localFiles, duplicate], [duplicate, ...localFiles]]) {
    const problems = checkFiles(manifest, files);
    assert.deepEqual(problems, [`${first.version}: duplicate version in supabase/migrations (${files.filter((f) => f.version === first.version).map((f) => f.file).join(', ')})`]);
  }
});

test('duplicate version in the manifest is refused, and expectedStates refuses it too', () => {
  const second = manifest.migrations[1];
  const doubled = { ...manifest, migrations: [...manifest.migrations, { ...second, name: 'again' }] };
  assert.deepEqual(checkFiles(doubled, localFiles), [`${second.version}: appears 2 times in the manifest (${second.name}, again)`]);
  assert.throws(() => lib.expectedStates(doubled), new RegExp(`Duplicate versions in the manifest: ${second.version}`));
});

test('duplicate files on disk are found by activeMigrations + checkFiles (real directory)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-migration-dup-'));
  try {
    fs.writeFileSync(path.join(dir, '20990101000000_first.sql'), 'select 1;\n');
    fs.writeFileSync(path.join(dir, '20990101000000_second.sql'), 'select 2;\n');
    fs.writeFileSync(path.join(dir, '20990102000000_third.sql'), 'select 3;\n');
    const files = lib.activeMigrations(dir);
    assert.equal(files.length, 3, 'both files with the same version are listed');
    const local = Object.fromEntries(files.map((f) => [f.file, f]));
    const fake = { migrations: [
      { version: '20990101000000', name: 'first', sha256: local['20990101000000_first.sql'].sha256 },
      { version: '20990102000000', name: 'third', sha256: local['20990102000000_third.sql'].sha256 },
    ] };
    assert.deepEqual(checkFiles(fake, files), ['20990101000000: duplicate version in supabase/migrations (20990101000000_first.sql, 20990101000000_second.sql)']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('committed files and manifest have no duplicates', () => {
  assert.deepEqual(lib.duplicateVersions(lib.activeMigrations()), []);
  assert.deepEqual(lib.duplicateVersions(manifest.migrations), []);
  assert.deepEqual(checkFiles(manifest, lib.activeMigrations()), []);
});
