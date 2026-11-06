// Read-only check of a database against the active migrations (Etapa 1B.2).
//
//   npm run db:migrations:check -- --linked                    (project linked with `supabase link`)
//   npm run db:migrations:check -- --linked --workdir <dir>    (link stored in <dir>/supabase/.temp)
//   npm run db:migrations:check -- --db-url <url>              (any PostgreSQL, e.g. a local test database)
//   add --json for a machine-readable report
//
// What it does, without writing anything:
// 1. Confirms the active migration files are exactly the ones described in
//    supabase/checks/migration_catalog.json (an applied file must never change,
//    and a version may appear only once, in the files and in the manifest).
// 2. Reads the catalog fingerprint (supabase/checks/catalog_objects.sql) and
//    finds which migrations the database really has: the catalog must be
//    IDENTICAL to the expected state after some migration N. Having a few of
//    the tables is not enough.
// 3. Reads the Supabase CLI history (supabase_migrations.schema_migrations),
//    if it exists, and compares it with that result.
//
// Verdicts and exit codes:
//   0  up_to_date        catalog = last migration and every version recorded
//   10 needs_recording   catalog proves versions that are not recorded yet:
//                        record them with `supabase migration repair --status applied` (no SQL runs)
//   20 pending           catalog and history agree; newer migrations still to apply (`supabase db push`)
//   30 ambiguous         a migration that is not recorded left no trace in the
//                        fingerprint (empty delta, or the catalog is identical
//                        to the expected state after more than one migration),
//                        so the catalog cannot say whether it ran: stop,
//                        nothing is recommended
//   1  divergent         catalog matches no expected state, or the history
//                        disagrees with it: stop, investigate, record nothing
//   2  error             could not run the check
//
// The repair/push commands it prints always target the connection that was
// checked: --linked (with the same --workdir, resolved to an absolute path) or
// --db-url with a <DB_URL> placeholder (credentials are never printed).
//
// With --db-url the session is READ ONLY (default_transaction_read_only=on).
// With --linked the queries go through `supabase db query --linked`, which
// uses the Management API of the linked project.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  BACKEND_DIR, MANIFEST_FILE, CATALOG_QUERY_FILE, activeMigrations, rowsToMap,
  expectedStates, diffMaps, diffSize, redactUrl, duplicateVersions, loadPg,
} = require('./lib.cjs');

const STATE_QUERY = `
select
  to_regclass('supabase_migrations.schema_migrations') is not null as has_history,
  case when to_regclass('supabase_migrations.schema_migrations') is null then null
       else query_to_xml('select version, name from supabase_migrations.schema_migrations order by version', false, true, '')::text
  end as history_xml,
  case when to_regclass('public.app_installation') is null then null
       else query_to_xml('select installation_id, environment from public.app_installation', false, true, '')::text
  end as marker_xml`;

const xmlRows = (xml, fields) => {
  if (!xml) return [];
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(([, body]) =>
    Object.fromEntries(fields.map((field) => [field, (body.match(new RegExp(`<${field}>([^<]*)</${field}>`)) || [])[1] ?? null])));
};

// ---------- arguments and target ----------
// The target is the connection that is verified; every command printed later
// is built from it, so a check made with --db-url never suggests --linked.
function parseArgs(argv) {
  const valueOf = (flag) => {
    const index = argv.indexOf(flag);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
    return value;
  };
  const linked = argv.includes('--linked');
  const url = valueOf('--db-url');
  const workdir = valueOf('--workdir');
  if (Boolean(url) === linked) throw new Error('Choose exactly one source: --linked or --db-url <url>.');
  if (workdir && !linked) throw new Error('--workdir only applies to --linked.');
  const target = linked
    ? { kind: 'linked', workdir: workdir ? path.resolve(BACKEND_DIR, workdir) : null }
    : { kind: 'db-url', url };
  return { json: argv.includes('--json'), target };
}

// What may be printed or put in the JSON report about the target.
const describeTarget = (target) => (target.kind === 'linked'
  ? { kind: 'linked', workdir: target.workdir }
  : { kind: 'db-url', url: redactUrl(target.url) });

const DB_URL_PLACEHOLDER = '<DB_URL>';
const shellQuote = (value) => (/[\s"'`$&|;<>()]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value);

function targetFlags(target) {
  if (target.kind === 'linked') return target.workdir ? `--linked --workdir ${shellQuote(target.workdir)}` : '--linked';
  return `--db-url ${DB_URL_PLACEHOLDER}`;
}

function commandsFor(report, target) {
  const flags = targetFlags(target);
  const commands = { repair: null, push_dry_run: null, push: null, placeholder: null };
  if (report.verdict === 'needs_recording') {
    commands.repair = `npx supabase migration repair --status applied ${report.toRecord.join(' ')} ${flags}`;
  }
  if (report.verdict === 'pending') {
    commands.push_dry_run = `npx supabase db push ${flags} --dry-run`;
    commands.push = `npx supabase db push ${flags}`;
  }
  if (target.kind === 'db-url' && (commands.repair || commands.push)) {
    commands.placeholder = `${DB_URL_PLACEHOLDER} = the same database that was checked (${redactUrl(target.url)}); fill in its password yourself, never another database.`;
  }
  return commands;
}

// ---------- sources ----------
async function queryDbUrl(url, sqlList) {
  const { Client } = loadPg();
  const client = new Client({ connectionString: url, options: '-c default_transaction_read_only=on' });
  await client.connect();
  try {
    await client.query('begin transaction read only');
    const results = [];
    for (const sql of sqlList) results.push((await client.query(sql)).rows);
    await client.query('rollback');
    return results;
  } finally {
    await client.end();
  }
}

// The CLI installed by the backend devDependency `supabase`, run directly (no shell).
const supabaseBinary = () => path.join(BACKEND_DIR, 'node_modules', 'supabase', 'bin', process.platform === 'win32' ? 'supabase.exe' : 'supabase');

function queryLinked(sqlList, { workdir } = {}) {
  const tempDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'rs-migration-check-'));
  try {
    return sqlList.map((sql, index) => {
      const file = path.join(tempDir, `query-${index}.sql`);
      fs.writeFileSync(file, sql, 'utf8');
      const args = ['db', 'query', '--linked', '--agent', 'yes', '-o', 'json', '-f', file];
      if (workdir) args.push('--workdir', workdir);
      const run = spawnSync(supabaseBinary(), args, { cwd: BACKEND_DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (run.error) throw new Error(`could not run the Supabase CLI (${run.error.code || 'error'})`);
      if (run.status !== 0) {
        const detail = String(run.stderr || '').split('\n').filter((line) => !/new version|recommend updating/i.test(line)).join('\n').trim();
        throw new Error(`supabase db query failed (exit ${run.status})${detail ? `:\n${detail}` : ''}`);
      }
      const parsed = JSON.parse(run.stdout);
      return Array.isArray(parsed) ? parsed : parsed.rows;
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ---------- analysis ----------
// Duplicates are checked first and on the raw lists: a Map keyed by version
// would keep only the last entry and hide the other file.
function checkFiles(manifest, migrations) {
  const problems = [];
  for (const { version, items } of duplicateVersions(migrations)) {
    problems.push(`${version}: duplicate version in supabase/migrations (${items.join(', ')})`);
  }
  for (const { version, items } of duplicateVersions(manifest.migrations)) {
    problems.push(`${version}: appears ${items.length} times in the manifest (${items.join(', ')})`);
  }
  if (problems.length) return problems;

  const local = new Map(migrations.map((m) => [m.version, m]));
  for (const expected of manifest.migrations) {
    const file = local.get(expected.version);
    if (!file) problems.push(`${expected.version}: in the manifest but missing from supabase/migrations`);
    else if (file.sha256 !== expected.sha256) problems.push(`${expected.version}: file content differs from the manifest (applied migrations must not change)`);
  }
  for (const file of migrations) {
    if (!manifest.migrations.some((m) => m.version === file.version)) {
      problems.push(`${file.version}: not in the manifest (run build-migration-catalog.cjs after adding a migration)`);
    }
  }
  return problems;
}

const sameVersions = (a, b) => a.length === b.length && a.every((version) => b.includes(version));
const stateName = (versions, index) => (index === 0 ? 'no migration' : versions[index - 1]);

function analyse({ manifest, catalogRows, history, hasHistory }) {
  const live = rowsToMap(catalogRows);
  const { states, owner } = expectedStates(manifest);
  const versions = manifest.migrations.map((m) => m.version);
  const diffs = states.map((state) => diffMaps(state, live));
  const exact = diffs.map((diff, index) => (diffSize(diff) === 0 ? index : -1)).filter((index) => index >= 0);
  const recorded = history.map((row) => row.version);

  const report = {
    versions, recorded, hasHistory, appliedCount: null, catalog: versions.map(() => 'unknown'),
    verdict: null, reasons: [], notes: [], divergence: null, ambiguity: null, toRecord: [], pending: [],
  };

  if (exact.length === 0) {
    let closest = 0;
    diffs.forEach((diff, index) => { if (diffSize(diff) < diffSize(diffs[closest])) closest = index; });
    const attribute = (key) => owner[closest].get(key) || null;
    const nextVersion = versions[closest] || null;
    report.verdict = 'divergent';
    report.reasons.push(`The catalog matches no expected state. Closest: after ${stateName(versions, closest)} (${diffSize(diffs[closest])} differences).`);
    report.divergence = {
      closest_after: closest === 0 ? null : versions[closest - 1],
      missing: diffs[closest].missing.map((key) => ({ key, set_by: attribute(key) })),
      different: diffs[closest].different.map((key) => ({ key, set_by: attribute(key) })),
      unexpected: diffs[closest].unexpected.map((key) => ({ key, next_migration_touches_it: nextVersion && isTouchedBy(manifest, nextVersion, key) ? nextVersion : null })),
    };
    return report;
  }

  const unknown = recorded.filter((version) => !versions.includes(version));
  const recordedActive = recorded.filter((version) => versions.includes(version));
  const first = exact[0];
  const last = exact[exact.length - 1];

  // More than one expected state is identical to the catalog: the migrations
  // between them left no trace in the fingerprint (data-only migration, a
  // change outside the query, or a later one undoing it). The catalog cannot
  // tell whether they ran. Only a CLI history that already records every
  // version up to the last candidate is consistent with all of them; anything
  // else would mean guessing, so nothing is recorded or pushed.
  if (exact.length > 1 && !sameVersions(recordedActive, versions.slice(0, last))) {
    const undetermined = versions.slice(first, last);
    report.catalog = versions.map((_, index) => (index < first ? 'applied' : index < last ? 'undetermined' : 'not applied'));
    report.ambiguity = {
      candidates_after: exact.map((index) => (index === 0 ? null : versions[index - 1])),
      proven: versions.slice(0, first),
      undetermined,
    };
    const beyond = recordedActive.filter((version) => versions.indexOf(version) >= last);
    if (unknown.length) report.reasons.push(`History has versions that are not active migrations: ${unknown.join(', ')}.`);
    if (beyond.length) report.reasons.push(`History records versions the catalog does not show: ${beyond.join(', ')}.`);
    if (report.reasons.length) {
      report.verdict = 'divergent';
      return report;
    }
    report.verdict = 'ambiguous';
    report.reasons.push(`The catalog is identical to the expected state after ${exact.map((index) => stateName(versions, index)).join(' and after ')}.`);
    report.reasons.push(`${undetermined.join(', ')} ${undetermined.length === 1 ? 'does' : 'do'} not change the fingerprinted catalog, so the catalog cannot tell whether ${undetermined.length === 1 ? 'it' : 'they'} ran, and the CLI history does not record ${undetermined.length === 1 ? 'it' : 'them all'}.`);
    return report;
  }

  const applied = last;
  report.appliedCount = applied;
  report.catalog = versions.map((_, index) => (index < applied ? 'applied' : 'not applied'));
  const appliedVersions = versions.slice(0, applied);
  report.pending = versions.slice(applied);
  if (exact.length > 1) {
    report.notes.push(`The catalog also matches the state after ${exact.slice(0, -1).map((index) => stateName(versions, index)).join(', ')}; ${versions.slice(first, last).join(', ')} are taken as applied from the CLI history, not proven by the catalog.`);
  }
  const recordedNotApplied = recordedActive.filter((version) => !appliedVersions.includes(version));
  report.toRecord = appliedVersions.filter((version) => !recorded.includes(version));

  if (unknown.length) report.reasons.push(`History has versions that are not active migrations: ${unknown.join(', ')}.`);
  if (recordedNotApplied.length) report.reasons.push(`History records versions the catalog does not show: ${recordedNotApplied.join(', ')}.`);

  // A migration with an empty delta leaves no trace even when a later one
  // does: the catalog after the later one is the same whether it ran or not.
  const traceless = report.toRecord.filter((version) => isTraceless(manifest, version));
  if (!report.reasons.length && traceless.length) {
    report.verdict = 'ambiguous';
    report.catalog = versions.map((version, index) => (traceless.includes(version) ? 'undetermined' : report.catalog[index]));
    report.ambiguity = {
      candidates_after: exact.map((index) => (index === 0 ? null : versions[index - 1])),
      proven: appliedVersions.filter((version) => !traceless.includes(version)),
      undetermined: traceless,
    };
    report.reasons.push(`${traceless.join(', ')} ${traceless.length === 1 ? 'does' : 'do'} not change the fingerprinted catalog and ${traceless.length === 1 ? 'is' : 'are'} not recorded in the CLI history, so nothing proves ${traceless.length === 1 ? 'it' : 'they'} ran.`);
    report.notes = [];
    report.toRecord = [];
    report.pending = [];
    return report;
  }

  if (report.reasons.length) {
    report.verdict = 'divergent';
  } else if (report.toRecord.length) {
    report.verdict = 'needs_recording';
  } else if (report.pending.length) {
    report.verdict = 'pending';
  } else {
    report.verdict = 'up_to_date';
  }
  return report;
}

function isTraceless(manifest, version) {
  const migration = manifest.migrations.find((m) => m.version === version);
  return Boolean(migration && !Object.keys(migration.added).length && !Object.keys(migration.changed).length && !migration.removed.length);
}

function isTouchedBy(manifest, version, key) {
  const migration = manifest.migrations.find((m) => m.version === version);
  return Boolean(migration && (key in migration.added || key in migration.changed || migration.removed.includes(key)));
}

const EXIT = { up_to_date: 0, needs_recording: 10, pending: 20, ambiguous: 30, divergent: 1 };

function formatReport(report, { source, marker, commands }) {
  const out = [];
  out.push(`Source: ${source}`);
  if (marker.length) out.push(`Installation marker: ${marker.map((row) => `${row.installation_id} (${row.environment})`).join(', ')}`);
  else out.push('Installation marker: none');
  out.push(`CLI history table: ${report.hasHistory ? `present, ${report.recorded.length} version(s)` : 'absent'}`);
  out.push('');
  for (const [index, version] of report.versions.entries()) {
    const inCatalog = report.divergence ? '?' : report.catalog[index];
    const inHistory = report.recorded.includes(version) ? 'recorded' : 'not recorded';
    out.push(`  ${version}  catalog: ${inCatalog.padEnd(12)}  history: ${inHistory}`);
  }
  out.push('');
  out.push(`Verdict: ${report.verdict.toUpperCase()}`);
  for (const reason of report.reasons) out.push(`  - ${reason}`);
  for (const note of report.notes) out.push(`  Note: ${note}`);
  if (commands.repair) {
    out.push('  The catalog proves these versions are applied but they are not recorded. Record them WITHOUT running SQL:');
    out.push(`    ${commands.repair}`);
    if (report.pending.length) out.push(`  Afterwards, still pending: ${report.pending.join(', ')}.`);
  }
  if (commands.push) {
    out.push(`  Pending migrations: ${report.pending.join(', ')}. Review, then apply:`);
    out.push(`    ${commands.push_dry_run}`);
    out.push(`    ${commands.push}`);
  }
  if (commands.placeholder) out.push(`  ${commands.placeholder}`);
  if (report.ambiguity) {
    out.push('  Not enough evidence: nothing is recommended. Do not run migration repair or db push for these versions.');
    out.push(`  Establish by other means (their data effects, who applied what) whether ${report.ambiguity.undetermined.join(', ')} ran.`);
    out.push('  See "Limits of the catalog check" in supabase/migrations/README.md.');
  }
  if (report.divergence) {
    const list = (title, items, describe) => {
      if (!items.length) return;
      out.push(`  ${title} (${items.length}):`);
      for (const item of items.slice(0, 40)) out.push(`    ${item.key}${describe(item)}`);
      if (items.length > 40) out.push(`    ... ${items.length - 40} more (use --json)`);
    };
    list('missing', report.divergence.missing, (item) => (item.set_by ? `  [expected from ${item.set_by}]` : ''));
    list('different', report.divergence.different, (item) => (item.set_by ? `  [last set by ${item.set_by}]` : ''));
    list('unexpected', report.divergence.unexpected, (item) => (item.next_migration_touches_it ? `  [changed by ${item.next_migration_touches_it}: partially applied?]` : ''));
  }
  if (report.verdict === 'divergent') out.push('  Do not run migration repair or db push until the difference is explained.');
  return out.join('\n');
}

async function main(argv) {
  const { json, target } = parseArgs(argv);

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  const fileProblems = checkFiles(manifest, activeMigrations());
  if (fileProblems.length) {
    console.error(`Migration files do not match ${path.relative(BACKEND_DIR, MANIFEST_FILE)}:\n  - ${fileProblems.join('\n  - ')}`);
    return 2;
  }

  const catalogQuery = fs.readFileSync(CATALOG_QUERY_FILE, 'utf8');
  let results;
  let source;
  if (target.kind === 'linked') {
    results = queryLinked([catalogQuery, STATE_QUERY], { workdir: target.workdir });
    source = `linked Supabase project (supabase db query --linked${target.workdir ? ` --workdir ${shellQuote(target.workdir)}` : ''})`;
  } else {
    results = await queryDbUrl(target.url, [catalogQuery, STATE_QUERY]);
    source = redactUrl(target.url);
  }
  const [catalogRows, [state]] = results;
  const history = xmlRows(state.history_xml, ['version', 'name']);
  const marker = xmlRows(state.marker_xml, ['installation_id', 'environment']);
  const report = analyse({ manifest, catalogRows, history, hasHistory: state.has_history === true || state.has_history === 't' });
  const commands = commandsFor(report, target);

  if (json) console.log(JSON.stringify({ source, target: describeTarget(target), marker, ...report, commands }, null, 2));
  else console.log(formatReport(report, { source, marker, commands }));
  return EXIT[report.verdict];
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`db:migrations:check: ${error.message}`);
      process.exit(2);
    });
}

module.exports = { analyse, checkFiles, commandsFor, formatReport, parseArgs, describeTarget, xmlRows, STATE_QUERY, EXIT };
