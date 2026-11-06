// Shared helpers for the migration control scripts (Etapa 1B.2).
//
// The control mechanism is the Supabase CLI history table
// (supabase_migrations.schema_migrations). These helpers only add what the CLI
// does not do: prove, from the catalog, which migrations a database really has
// before anything is recorded or pushed.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BACKEND_DIR = path.join(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'supabase', 'migrations');
const CATALOG_QUERY_FILE = path.join(BACKEND_DIR, 'supabase', 'checks', 'catalog_objects.sql');
const MANIFEST_FILE = path.join(BACKEND_DIR, 'supabase', 'checks', 'migration_catalog.json');

// Same rule as the Supabase CLI: <digits>_<name>.sql directly inside
// supabase/migrations. Subfolders (history/) and other files are not migrations.
const MIGRATION_PATTERN = /^([0-9]+)_(.*)\.sql$/;

function activeMigrations(dir = MIGRATIONS_DIR) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIGRATION_PATTERN.test(entry.name))
    .map((entry) => {
      const [, version, name] = entry.name.match(MIGRATION_PATTERN);
      const file = path.join(dir, entry.name);
      return { version, name, file: entry.name, path: file, sha256: sha256File(file) };
    })
    .sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
}

// Line endings are normalised so a Windows checkout and a Linux checkout of
// the same file have the same checksum.
function sha256File(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(text).digest('hex');
}

const readCatalogQuery = () => fs.readFileSync(CATALOG_QUERY_FILE, 'utf8');

const objectKey = (row) => `${row.category}:${row.object_key}`;

function rowsToMap(rows) {
  const map = new Map();
  for (const row of rows) map.set(objectKey(row), row.definition_hash);
  return map;
}

// Expected catalog after each migration, rebuilt from the manifest deltas.
// states[0] is the empty database; states[i] is after manifest.migrations[i-1].
function expectedStates(manifest) {
  const duplicates = duplicateVersions(manifest.migrations);
  if (duplicates.length) throw new Error(`Duplicate versions in the manifest: ${duplicates.map((d) => d.version).join(', ')}.`);
  const states = [new Map()];
  const owner = [new Map()];
  for (const migration of manifest.migrations) {
    const state = new Map(states[states.length - 1]);
    const setBy = new Map(owner[owner.length - 1]);
    for (const [key, hash] of Object.entries(migration.added)) { state.set(key, hash); setBy.set(key, migration.version); }
    for (const [key, hash] of Object.entries(migration.changed)) { state.set(key, hash); setBy.set(key, migration.version); }
    for (const key of migration.removed) { state.delete(key); setBy.set(key, migration.version); }
    states.push(state);
    owner.push(setBy);
  }
  return { states, owner };
}

function diffMaps(expected, actual) {
  const missing = [];
  const different = [];
  const unexpected = [];
  for (const [key, hash] of expected) {
    if (!actual.has(key)) missing.push(key);
    else if (actual.get(key) !== hash) different.push(key);
  }
  for (const key of actual.keys()) if (!expected.has(key)) unexpected.push(key);
  return { missing: missing.sort(), different: different.sort(), unexpected: unexpected.sort() };
}

const diffSize = (diff) => diff.missing.length + diff.different.length + diff.unexpected.length;

function deltaBetween(previous, next) {
  const added = {};
  const changed = {};
  const removed = [];
  for (const [key, hash] of next) {
    if (!previous.has(key)) added[key] = hash;
    else if (previous.get(key) !== hash) changed[key] = hash;
  }
  for (const key of previous.keys()) if (!next.has(key)) removed.push(key);
  return { added: sortObject(added), changed: sortObject(changed), removed: removed.sort() };
}

const sortObject = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : 1)));

function isLocalUrl(url) {
  const host = new URL(url).hostname;
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
}

// Hide passwords in connection strings before printing anything: the userinfo
// password and the libpq query parameters that can carry one.
const SECRET_URL_PARAMS = ['password', 'sslpassword'];
const redactUrl = (url) => {
  try {
    const copy = new URL(url);
    if (copy.password) copy.password = '***';
    for (const name of SECRET_URL_PARAMS) if (copy.searchParams.has(name)) copy.searchParams.set(name, '***');
    return copy.toString();
  } catch {
    return '[invalid url]';
  }
};

// Versions that appear more than once in a list of { version, ... } entries.
// Used before anything is put in a Map keyed by version, so a duplicate can
// never hide behind the last entry with that key.
function duplicateVersions(entries, describe = (entry) => entry.file || entry.name || entry.version) {
  const seen = new Map();
  for (const entry of entries) {
    if (!seen.has(entry.version)) seen.set(entry.version, []);
    seen.get(entry.version).push(describe(entry));
  }
  return [...seen].filter(([, items]) => items.length > 1).map(([version, items]) => ({ version, items }));
}

// The pg driver is not a backend dependency; the SQL tests install it in an
// ignored helper folder (see tests/*-sql.cjs). Fall back to a normal install.
function loadPg() {
  const candidates = [
    path.join(BACKEND_DIR, 'node_modules', '.stock-validation', 'node_modules', 'pg'),
    'pg',
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* try the next one */ }
  }
  throw new Error('The "pg" driver is not installed. Run: npm install --prefix backend/node_modules/.stock-validation --no-package-lock --no-save @electric-sql/pglite@0.5.8 pg@8.23.1');
}

// What a new Supabase project gives the API roles before any migration runs,
// for local disposable databases only (never sent to a Supabase project).
const SUPABASE_ROLE_SETUP = `
  do $roles$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  end;
  $roles$;
`;
const SUPABASE_DATABASE_SETUP = `
  create schema if not exists extensions;
  create extension if not exists pgcrypto with schema extensions;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

module.exports = {
  BACKEND_DIR,
  MIGRATIONS_DIR,
  CATALOG_QUERY_FILE,
  MANIFEST_FILE,
  MIGRATION_PATTERN,
  activeMigrations,
  sha256File,
  readCatalogQuery,
  rowsToMap,
  expectedStates,
  diffMaps,
  diffSize,
  deltaBetween,
  isLocalUrl,
  redactUrl,
  duplicateVersions,
  loadPg,
  SUPABASE_ROLE_SETUP,
  SUPABASE_DATABASE_SETUP,
};
