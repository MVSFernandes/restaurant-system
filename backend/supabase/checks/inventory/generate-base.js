
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const inventoryDate = process.argv[2] || '2026-10-03';
const dir = path.join(__dirname, inventoryDate);
const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
const checksDir = path.resolve(__dirname, '..');

function read(name) {
  return fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, '');
}

function markdownRows(name) {
  return read(name).split(/\r?\n/).filter((line) => /^\|/.test(line)).map((line) =>
    line.split('|').slice(1, -1).map((cell) => cell.trim())
  ).filter((cells) => cells.length > 0 && !/^[-:]+$/.test(cells[0]) && ![
    'schema_name', 'table_name', 'routine_name', 'signature'
  ].includes(cells[0]));
}

const columns = [
  ...markdownRows('Colunas_parte1.txt'),
  ...markdownRows('Colunas_parte2.txt'),
  ...markdownRows('Colunas_parte3.txt'),
].map(([schema, table, ordinal, name, type, nullable, defaultValue, identity, generated]) => ({
  schema, table, ordinal: Number(ordinal), name, type, nullable: nullable === 'true',
  defaultValue: defaultValue === 'null' ? null : defaultValue,
  identity: identity === 'null' ? null : identity,
  generated: generated === 'null' ? null : generated,
}));

const constraintMap = new Map();
for (const row of [...markdownRows('Constraints.txt'), ...markdownRows('Constraints_parte2.txt')]) {
  const [schema, table, name, type, validated, deferrable, deferred, definition] = row;
  constraintMap.set(table + '.' + name, {
    schema, table, name, type, validated: validated === 'true',
    deferrable: deferrable === 'true', deferred: deferred === 'true', definition,
  });
}
const constraints = [...constraintMap.values()];

const indexes = [
  ...markdownRows('Indices_do_schema.txt'),
  ...markdownRows('Indices_do_schema_parte2.txt'),
].map(([table, name, origin, unique, valid, definition]) => ({
  table, name, origin, unique: unique === 'true', valid: valid === 'true', definition,
}));

const functionLines = read('Codigo_funcoes_aplicacao.txt').split(/\r?\n/);
const functions = [];
for (const line of functionLines) {
  const match = line.match(/^\|\s*([a-z_][a-z0-9_]*)\s*\|\s*(public\.[^|]+?)\s*\|\s*(CREATE OR REPLACE FUNCTION.*)\|\s*$/);
  if (!match) continue;
  const rawDefinition = match[3].trimEnd().replaceAll('<br>', '\n').replaceAll('\\|', '|').trim();
  let definition = rawDefinition;
  if (!definition.endsWith(';')) definition += ';';
  const signature = match[2].trim();
  const args = signature.slice(signature.indexOf('(') + 1, -1).trim();
  const identityTypes = args === '' ? '' : args.split(',').map((arg) => arg.trim().replace(/^[a-z_][a-z0-9_]*\s+/i, '')).join(', ');
  functions.push({ name: match[1], signature, identitySignature: `public.${match[1]}(${identityTypes})`, rawDefinition, definition });
}

const triggers = markdownRows('Triggers.txt').map(([
  schema, table, name, timing, events, orientation, enabled, calledFunction, definition
]) => ({ schema, table, name, timing, events, orientation, enabled, calledFunction, definition }));

const tableNames = [...new Set(columns.map((column) => column.table))].sort();
const byTable = new Map(tableNames.map((table) => [table, columns.filter((column) => column.table === table).sort((a, b) => a.ordinal - b.ordinal)]));

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}
function md5(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}
function canonicalColumn(column) {
  return [
    column.table, String(column.ordinal), column.name, column.type,
    String(column.nullable), column.defaultValue ?? 'null',
    column.identity ?? 'null', column.generated ?? 'null',
  ].join('|');
}
function canonicalConstraint(item) {
  return [
    item.table, item.name, item.type, String(item.validated),
    String(item.deferrable), String(item.deferred), item.definition,
  ].join('|');
}
function canonicalIndex(item) {
  return [
    item.table, item.name, item.origin, String(item.unique),
    String(item.valid), item.definition,
  ].join('|');
}
function canonicalFunction(item) {
  return `${item.rawDefinition}|owner=postgres|anon=false|authenticated=false|service_role=true`;
}
function triggerEnabledCode(enabled) {
  return ({ ENABLED: 'O', DISABLED: 'D', REPLICA: 'R', ALWAYS: 'A' })[enabled];
}
function canonicalTrigger(item) {
  return `${item.definition.trim()}|${triggerEnabledCode(item.enabled)}`;
}
function canonicalRls(table) {
  return `${table}|true|false`;
}

if (columns.length !== 230) throw new Error(`Expected 230 columns, got ${columns.length}`);
if (tableNames.length !== 22) throw new Error(`Expected 22 tables, got ${tableNames.length}`);
if (constraints.length !== 116) throw new Error(`Expected 116 constraints, got ${constraints.length}`);
if (indexes.length !== 97) throw new Error(`Expected 97 indexes, got ${indexes.length}`);
if (functions.length !== 21) throw new Error(`Expected 21 functions, got ${functions.length}`);
if (triggers.length !== 22) throw new Error(`Expected 22 triggers, got ${triggers.length}`);

const standaloneIndexes = indexes.filter((item) => item.origin === 'STANDALONE_INDEX');
const constraintIndexes = indexes.filter((item) => item.origin !== 'STANDALONE_INDEX');
if (standaloneIndexes.length !== 63 || constraintIndexes.length !== 34) {
  throw new Error(`Expected 63 standalone and 34 constraint indexes, got ${standaloneIndexes.length}/${constraintIndexes.length}`);
}

const structure = [];
structure.push(`-- Canonical database base captured from the live Supabase catalog.`);
structure.push(`-- Platform-managed extensions (pg_stat_statements, supabase_vault, uuid-ossp`);
structure.push(`-- and plpgsql) are intentionally not created here.`);
structure.push(`begin;`);
structure.push(``);
structure.push(`create schema if not exists extensions;`);
structure.push(``);
structure.push(`create extension if not exists pg_trgm with schema public;`);
structure.push(`create extension if not exists pgcrypto with schema extensions;`);
structure.push(``);
structure.push(`do $extensions$`);
structure.push(`declare`);
structure.push(`  v_schema text;`);
structure.push(`begin`);
structure.push(`  select namespace.nspname into v_schema`);
structure.push(`  from pg_extension as extension`);
structure.push(`  join pg_namespace as namespace on namespace.oid = extension.extnamespace`);
structure.push(`  where extension.extname = 'pg_trgm';`);
structure.push(``);
structure.push(`  if v_schema is distinct from 'public' then`);
structure.push(`    alter extension pg_trgm set schema public;`);
structure.push(`  end if;`);
structure.push(``);
structure.push(`  select namespace.nspname into v_schema`);
structure.push(`  from pg_extension as extension`);
structure.push(`  join pg_namespace as namespace on namespace.oid = extension.extnamespace`);
structure.push(`  where extension.extname = 'pgcrypto';`);
structure.push(``);
structure.push(`  if v_schema is distinct from 'extensions' then`);
structure.push(`    alter extension pgcrypto set schema extensions;`);
structure.push(`  end if;`);
structure.push(`end;`);
structure.push(`$extensions$;`);
structure.push(``);
structure.push(`set local search_path = public, extensions, pg_catalog;`);
structure.push(``);
structure.push(`-- Tables and columns. Constraints are added after every table exists.`);
for (const table of tableNames) {
  structure.push(`create table if not exists public.${table} (`);
  const tableColumns = byTable.get(table);
  tableColumns.forEach((column, index) => {
    const parts = [`  ${column.name} ${column.type}`];
    if (!column.nullable) parts.push('not null');
    if (column.defaultValue !== null) parts.push(`default ${column.defaultValue}`);
    if (column.identity === 'GENERATED ALWAYS') parts.push('generated always as identity');
    if (column.identity === 'GENERATED BY DEFAULT') parts.push('generated by default as identity');
    let text = parts.join(' ');
    if (index < tableColumns.length - 1) text += ',';
    structure.push(text);
  });
  structure.push(`);`);
  structure.push(``);
}

const nonForeign = constraints.filter((item) => item.type !== 'FOREIGN KEY').sort((a, b) => (a.table + '.' + a.name).localeCompare(b.table + '.' + b.name));
const foreign = constraints.filter((item) => item.type === 'FOREIGN KEY').sort((a, b) => (a.table + '.' + a.name).localeCompare(b.table + '.' + b.name));
structure.push(`-- Add catalog constraints only when absent. Existing matching databases remain untouched.`);
structure.push(`do $constraints$`);
structure.push(`begin`);
for (const item of [...nonForeign, ...foreign]) {
  structure.push(`  if not exists (`);
  structure.push(`    select 1`);
  structure.push(`    from pg_constraint`);
  structure.push(`    where conrelid = 'public.${item.table}'::regclass`);
  structure.push(`      and conname = ${sqlLiteral(item.name)}`);
  structure.push(`  ) then`);
  structure.push(`    alter table public.${item.table} drop constraint if exists ${item.name};`);
  let suffix = '';
  if (item.deferrable) suffix += ' deferrable';
  if (item.deferred) suffix += ' initially deferred';
  if (!item.validated) suffix += ' not valid';
  structure.push(`    alter table public.${item.table} add constraint ${item.name} ${item.definition}${suffix};`);
  structure.push(`  end if;`);
  structure.push(``);
}
structure.push(`end;`);
structure.push(`$constraints$;`);
structure.push(``);
structure.push(`-- The 34 PRIMARY KEY/UNIQUE indexes are created by their constraints above.`);
structure.push(`-- The remaining 63 standalone indexes follow their live catalog definitions.`);
for (const item of standaloneIndexes.sort((a, b) => (a.table + '.' + a.name).localeCompare(b.table + '.' + b.name))) {
  const statement = item.definition.replace(/^CREATE (UNIQUE )?INDEX /i, (_, unique) => `create ${unique ? 'unique ' : ''}index if not exists `);
  structure.push(statement + ';');
}
structure.push(``);
structure.push(`commit;`);
structure.push(``);
fs.writeFileSync(path.join(migrationsDir, '20261003130000_base_schema.sql'), structure.join('\n'));

const functionSql = [];
functionSql.push(`-- Canonical application functions captured from the live Supabase catalog.`);
functionSql.push(`begin;`);
functionSql.push(``);
functionSql.push(`set local search_path = public, extensions, pg_catalog;`);
functionSql.push(``);
for (const item of functions.sort((a, b) => a.name.localeCompare(b.name))) {
  functionSql.push(item.definition);
  functionSql.push(``);
}
functionSql.push(`-- Application functions are backend-only. Trigger execution does not require`);
functionSql.push(`-- callers to hold EXECUTE on the trigger function.`);
for (const item of functions) {
  functionSql.push(`revoke all on function ${item.identitySignature} from public, anon, authenticated;`);
  functionSql.push(`grant execute on function ${item.identitySignature} to service_role;`);
}
functionSql.push(``);
functionSql.push(`commit;`);
functionSql.push(``);
fs.writeFileSync(path.join(migrationsDir, '20261003131000_base_functions.sql'), functionSql.join('\n'));

const expected = [];
for (const table of tableNames) expected.push(['tables', table, md5(table)]);
for (const item of columns) expected.push(['columns', `${item.table}.${item.name}`, md5(canonicalColumn(item))]);
for (const item of constraints) expected.push(['constraints', `${item.table}.${item.name}`, md5(canonicalConstraint(item))]);
for (const item of indexes) expected.push(['indexes', `${item.table}.${item.name}`, md5(canonicalIndex(item))]);
for (const item of functions) expected.push(['functions', item.name, md5(canonicalFunction(item))]);
for (const item of triggers) expected.push(['triggers', `${item.table}.${item.name}`, md5(canonicalTrigger(item))]);
for (const table of tableNames) expected.push(['rls', table, md5(canonicalRls(table))]);

function buildVerificationQuery() {
  const q = [];
  q.push(`with expected_objects(category, object_key, definition_hash) as (`);
  q.push(`  values`);
  expected.forEach((row, index) => {
    q.push(`    (${sqlLiteral(row[0])}, ${sqlLiteral(row[1])}, ${sqlLiteral(row[2])})${index < expected.length - 1 ? ',' : ''}`);
  });
  q.push(`),`);
  q.push(`expected_categories(category, expected_count, sort_order) as (`);
  q.push(`  values`);
  q.push(`    ('tables', 22, 1),`);
  q.push(`    ('columns', 230, 2),`);
  q.push(`    ('constraints', 116, 3),`);
  q.push(`    ('indexes', 97, 4),`);
  q.push(`    ('functions', 21, 5),`);
  q.push(`    ('triggers', 22, 6),`);
  q.push(`    ('rls', 22, 7),`);
  q.push(`    ('policies', 0, 8)`);
  q.push(`),`);
  q.push(`actual_objects(category, object_key, definition_hash) as (`);
  q.push(`  select`);
  q.push(`    'tables',`);
  q.push(`    table_row.relname,`);
  q.push(`    md5(table_row.relname)`);
  q.push(`  from pg_class as table_row`);
  q.push(`  join pg_namespace as namespace on namespace.oid = table_row.relnamespace`);
  q.push(`  where namespace.nspname = 'public'`);
  q.push(`    and table_row.relkind in ('r', 'p')`);
  q.push(``);
  q.push(`  union all`);
  q.push(``);
  q.push(`  select`);
  q.push(`    'columns',`);
  q.push(`    table_row.relname || '.' || attribute.attname,`);
  q.push(`    md5(concat_ws(`);
  q.push(`      '|',`);
  q.push(`      table_row.relname,`);
  q.push(`      attribute.attnum::text,`);
  q.push(`      attribute.attname,`);
  q.push(`      format_type(attribute.atttypid, attribute.atttypmod),`);
  q.push(`      (not attribute.attnotnull)::text,`);
  q.push(`      coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), 'null'),`);
  q.push(`      coalesce(case attribute.attidentity when 'a' then 'GENERATED ALWAYS' when 'd' then 'GENERATED BY DEFAULT' end, 'null'),`);
  q.push(`      coalesce(case attribute.attgenerated when 's' then 'STORED' when 'v' then 'VIRTUAL' end, 'null')`);
  q.push(`    ))`);
  q.push(`  from pg_class as table_row`);
  q.push(`  join pg_namespace as namespace on namespace.oid = table_row.relnamespace`);
  q.push(`  join pg_attribute as attribute on attribute.attrelid = table_row.oid`);
  q.push(`  left join pg_attrdef as default_row`);
  q.push(`    on default_row.adrelid = table_row.oid and default_row.adnum = attribute.attnum`);
  q.push(`  where namespace.nspname = 'public'`);
  q.push(`    and table_row.relkind in ('r', 'p')`);
  q.push(`    and attribute.attnum > 0`);
  q.push(`    and not attribute.attisdropped`);
  q.push(``);
  q.push(`  union all`);
  q.push(``);
  q.push(`  select`);
  q.push(`    'constraints',`);
  q.push(`    table_row.relname || '.' || constraint_row.conname,`);
  q.push(`    md5(concat_ws(`);
  q.push(`      '|',`);
  q.push(`      table_row.relname,`);
  q.push(`      constraint_row.conname,`);
  q.push(`      case constraint_row.contype`);
  q.push(`        when 'p' then 'PRIMARY KEY' when 'u' then 'UNIQUE' when 'f' then 'FOREIGN KEY'`);
  q.push(`        when 'c' then 'CHECK' when 'x' then 'EXCLUDE'`);
  q.push(`      end,`);
  q.push(`      constraint_row.convalidated::text,`);
  q.push(`      constraint_row.condeferrable::text,`);
  q.push(`      constraint_row.condeferred::text,`);
  q.push(`      pg_get_constraintdef(constraint_row.oid, true)`);
  q.push(`    ))`);
  q.push(`  from pg_constraint as constraint_row`);
  q.push(`  join pg_class as table_row on table_row.oid = constraint_row.conrelid`);
  q.push(`  join pg_namespace as namespace on namespace.oid = table_row.relnamespace`);
  q.push(`  where namespace.nspname = 'public'`);
  q.push(`    and constraint_row.contype in ('p', 'u', 'f', 'c', 'x')`);
  q.push(``);
  q.push(`  union all`);
  q.push(``);
  q.push(`  select`);
  q.push(`    'indexes',`);
  q.push(`    table_row.relname || '.' || index_row.relname,`);
  q.push(`    md5(concat_ws(`);
  q.push(`      '|',`);
  q.push(`      table_row.relname,`);
  q.push(`      index_row.relname,`);
  q.push(`      case constraint_row.contype`);
  q.push(`        when 'p' then 'PRIMARY_KEY_CONSTRAINT'`);
  q.push(`        when 'u' then 'UNIQUE_CONSTRAINT'`);
  q.push(`        when 'x' then 'EXCLUDE_CONSTRAINT'`);
  q.push(`        else 'STANDALONE_INDEX'`);
  q.push(`      end,`);
  q.push(`      index_meta.indisunique::text,`);
  q.push(`      index_meta.indisvalid::text,`);
  q.push(`      pg_get_indexdef(index_row.oid)`);
  q.push(`    ))`);
  q.push(`  from pg_class as index_row`);
  q.push(`  join pg_namespace as namespace on namespace.oid = index_row.relnamespace`);
  q.push(`  join pg_index as index_meta on index_meta.indexrelid = index_row.oid`);
  q.push(`  join pg_class as table_row on table_row.oid = index_meta.indrelid`);
  q.push(`  left join pg_constraint as constraint_row`);
  q.push(`    on constraint_row.conindid = index_row.oid and constraint_row.contype in ('p', 'u', 'x')`);
  q.push(`  where namespace.nspname = 'public'`);
  q.push(``);
  q.push(`  union all`);
  q.push(``);
  q.push(`  select`);
  q.push(`    'functions',`);
  q.push(`    procedure_row.proname,`);
  q.push(`    md5(`);
  q.push(`      btrim(pg_get_functiondef(procedure_row.oid))`);
  q.push(`      || '|owner=' || owner_role.rolname`);
  q.push(`      || '|anon=' || has_function_privilege('anon', procedure_row.oid, 'EXECUTE')::text`);
  q.push(`      || '|authenticated=' || has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')::text`);
  q.push(`      || '|service_role=' || has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')::text`);
  q.push(`    )`);
  q.push(`  from pg_proc as procedure_row`);
  q.push(`  join pg_namespace as namespace on namespace.oid = procedure_row.pronamespace`);
  q.push(`  join pg_roles as owner_role on owner_role.oid = procedure_row.proowner`);
  q.push(`  where namespace.nspname = 'public'`);
  q.push(`    and procedure_row.prokind = 'f'`);
  q.push(`    and not exists (`);
  q.push(`      select 1`);
  q.push(`      from pg_depend as dependency`);
  q.push(`      join pg_extension as extension on extension.oid = dependency.refobjid`);
  q.push(`      where dependency.classid = 'pg_proc'::regclass`);
  q.push(`        and dependency.objid = procedure_row.oid`);
  q.push(`        and dependency.deptype = 'e'`);
  q.push(`    )`);
  q.push(``);
  q.push(`  union all`);
  q.push(``);
  q.push(`  select`);
  q.push(`    'triggers',`);
  q.push(`    table_row.relname || '.' || trigger_row.tgname,`);
  q.push(`    md5(btrim(pg_get_triggerdef(trigger_row.oid, true)) || '|' || trigger_row.tgenabled::text)`);
  q.push(`  from pg_trigger as trigger_row`);
  q.push(`  join pg_class as table_row on table_row.oid = trigger_row.tgrelid`);
  q.push(`  join pg_namespace as namespace on namespace.oid = table_row.relnamespace`);
  q.push(`  where namespace.nspname = 'public'`);
  q.push(`    and not trigger_row.tgisinternal`);
  q.push(``);
  q.push(`  union all`);
  q.push(``);
  q.push(`  select`);
  q.push(`    'rls',`);
  q.push(`    table_row.relname,`);
  q.push(`    md5(concat_ws('|', table_row.relname, table_row.relrowsecurity::text, table_row.relforcerowsecurity::text))`);
  q.push(`  from pg_class as table_row`);
  q.push(`  join pg_namespace as namespace on namespace.oid = table_row.relnamespace`);
  q.push(`  where namespace.nspname = 'public'`);
  q.push(`    and table_row.relkind in ('r', 'p')`);
  q.push(``);
  q.push(`  union all`);
  q.push(``);
  q.push(`  select`);
  q.push(`    'policies',`);
  q.push(`    policy.tablename || '.' || policy.policyname,`);
  q.push(`    md5(concat_ws(`);
  q.push(`      '|', policy.tablename, policy.policyname, policy.permissive,`);
  q.push(`      array_to_string(policy.roles, ','), policy.cmd,`);
  q.push(`      coalesce(policy.qual, 'null'), coalesce(policy.with_check, 'null')`);
  q.push(`    ))`);
  q.push(`  from pg_policies as policy`);
  q.push(`  where policy.schemaname = 'public'`);
  q.push(`),`);
  q.push(`expected_summary as (`);
  q.push(`  select`);
  q.push(`    category,`);
  q.push(`    count(*)::integer as object_count,`);
  q.push(`    md5(coalesce(string_agg(object_key || ':' || definition_hash, E'\\n' order by object_key), '')) as category_hash`);
  q.push(`  from expected_objects`);
  q.push(`  group by category`);
  q.push(`),`);
  q.push(`actual_summary as (`);
  q.push(`  select`);
  q.push(`    category,`);
  q.push(`    count(*)::integer as object_count,`);
  q.push(`    md5(coalesce(string_agg(object_key || ':' || definition_hash, E'\\n' order by object_key), '')) as category_hash`);
  q.push(`  from actual_objects`);
  q.push(`  group by category`);
  q.push(`),`);
  q.push(`differences as (`);
  q.push(`  select`);
  q.push(`    category.category,`);
  q.push(`    array(`);
  q.push(`      select expected.object_key`);
  q.push(`      from expected_objects as expected`);
  q.push(`      left join actual_objects as actual`);
  q.push(`        on actual.category = expected.category and actual.object_key = expected.object_key`);
  q.push(`      where expected.category = category.category`);
  q.push(`        and (actual.object_key is null or actual.definition_hash is distinct from expected.definition_hash)`);
  q.push(`      order by expected.object_key`);
  q.push(`    ) as missing_or_different,`);
  q.push(`    array(`);
  q.push(`      select actual.object_key`);
  q.push(`      from actual_objects as actual`);
  q.push(`      left join expected_objects as expected`);
  q.push(`        on expected.category = actual.category and expected.object_key = actual.object_key`);
  q.push(`      where actual.category = category.category`);
  q.push(`        and expected.object_key is null`);
  q.push(`      order by actual.object_key`);
  q.push(`    ) as unexpected`);
  q.push(`  from expected_categories as category`);
  q.push(`),`);
  q.push(`extension_status as (`);
  q.push(`  select`);
  q.push(`    extension.extname,`);
  q.push(`    extension.extversion,`);
  q.push(`    namespace.nspname as extension_schema`);
  q.push(`  from pg_extension as extension`);
  q.push(`  join pg_namespace as namespace on namespace.oid = extension.extnamespace`);
  q.push(`  where extension.extname in ('pg_trgm', 'pgcrypto')`);
  q.push(`),`);
  q.push(`results as (`);
  q.push(`  select`);
  q.push(`    category.sort_order,`);
  q.push(`    category.category,`);
  q.push(`    category.expected_count,`);
  q.push(`    coalesce(actual.object_count, 0) as found_count,`);
  q.push(`    (`);
  q.push(`      category.expected_count = coalesce(actual.object_count, 0)`);
  q.push(`      and coalesce(expected.category_hash, md5('')) = coalesce(actual.category_hash, md5(''))`);
  q.push(`    ) as matches,`);
  q.push(`    coalesce(expected.category_hash, md5('')) as expected_hash,`);
  q.push(`    coalesce(actual.category_hash, md5('')) as found_hash,`);
  q.push(`    coalesce(differences.missing_or_different, array[]::text[]) as missing_or_different,`);
  q.push(`    coalesce(differences.unexpected, array[]::text[]) as unexpected,`);
  q.push(`    null::text as extension_schema,`);
  q.push(`    null::text as extension_version`);
  q.push(`  from expected_categories as category`);
  q.push(`  left join expected_summary as expected on expected.category = category.category`);
  q.push(`  left join actual_summary as actual on actual.category = category.category`);
  q.push(`  left join differences on differences.category = category.category`);
  q.push(``);
  q.push(`  union all`);
  q.push(``);
  q.push(`  select`);
  q.push(`    9,`);
  q.push(`    'extension:pg_trgm',`);
  q.push(`    1,`);
  q.push(`    count(*)::integer,`);
  q.push(`    count(*) = 1 and min(extension_schema) = 'public',`);
  q.push(`    null,`);
  q.push(`    null,`);
  q.push(`    array[]::text[],`);
  q.push(`    array[]::text[],`);
  q.push(`    min(extension_schema),`);
  q.push(`    min(extversion)`);
  q.push(`  from extension_status`);
  q.push(`  where extname = 'pg_trgm'`);
  q.push(``);
  q.push(`  union all`);
  q.push(``);
  q.push(`  select`);
  q.push(`    10,`);
  q.push(`    'extension:pgcrypto',`);
  q.push(`    1,`);
  q.push(`    count(*)::integer,`);
  q.push(`    count(*) = 1 and min(extension_schema) = 'extensions',`);
  q.push(`    null,`);
  q.push(`    null,`);
  q.push(`    array[]::text[],`);
  q.push(`    array[]::text[],`);
  q.push(`    min(extension_schema),`);
  q.push(`    min(extversion)`);
  q.push(`  from extension_status`);
  q.push(`  where extname = 'pgcrypto'`);
  q.push(`)`);
  q.push(`select`);
  q.push(`  category,`);
  q.push(`  expected_count as expected,`);
  q.push(`  found_count as found,`);
  q.push(`  matches,`);
  q.push(`  expected_hash,`);
  q.push(`  found_hash,`);
  q.push(`  missing_or_different,`);
  q.push(`  unexpected,`);
  q.push(`  extension_schema,`);
  q.push(`  extension_version`);
  q.push(`from results`);
  q.push(`order by sort_order;`);
  return q.join('\n');
}

const verification = buildVerificationQuery();

const runtime = [];
runtime.push(`-- Canonical triggers and row-level security captured from the live Supabase catalog.`);
runtime.push(`begin;`);
runtime.push(``);
runtime.push(`set local search_path = public, extensions, pg_catalog;`);
runtime.push(``);
for (const item of triggers.sort((a, b) => (a.table + '.' + a.name).localeCompare(b.table + '.' + b.name))) {
  runtime.push(`drop trigger if exists ${item.name} on public.${item.table};`);
  runtime.push(item.definition + ';');
  runtime.push(``);
}
runtime.push(`-- RLS is enabled on every application table. The live catalog has no policies.`);
for (const table of tableNames) runtime.push(`alter table public.${table} enable row level security;`);
runtime.push(``);
runtime.push(`commit;`);
runtime.push(``);
runtime.push(`-- The extension version is reported separately because Supabase may install a`);
runtime.push(`-- different minor extension version on PostgreSQL 17.11 than on 17.6.`);
runtime.push(verification);
runtime.push(``);
fs.writeFileSync(path.join(migrationsDir, '20261003132000_base_runtime.sql'), runtime.join('\n'));

const check = [];
check.push(`-- Compare the live public schema with the canonical restaurant database base.`);
check.push(`-- Output is limited to ten summary rows so it is not truncated by the Supabase editor.`);
check.push(verification);
check.push(``);
fs.writeFileSync(path.join(checksDir, 'verify_database_inventory.sql'), check.join('\n'));

const summary = {
  tables: tableNames.length,
  columns: columns.length,
  constraints: constraints.length,
  indexes: indexes.length,
  standaloneIndexes: standaloneIndexes.length,
  constraintIndexes: constraintIndexes.length,
  functions: functions.length,
  triggers: triggers.length,
  expectedCheckObjects: expected.length,
  files: [
    path.join(migrationsDir, '20261003130000_base_schema.sql'),
    path.join(migrationsDir, '20261003131000_base_functions.sql'),
    path.join(migrationsDir, '20261003132000_base_runtime.sql'),
    path.join(checksDir, 'verify_database_inventory.sql'),
  ].map((file) => ({
    name: path.basename(file),
    lines: fs.readFileSync(file, 'utf8').split('\n').length,
    bytes: fs.statSync(file).size,
  })),
};
console.log(JSON.stringify(summary, null, 2));


