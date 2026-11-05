// scripts/generate-supabase-types.cjs with an explicit fake generator: no
// network, no Supabase CLI, no real .env.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '../scripts/generate-supabase-types.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'supabase-types-'));
const ORIGINAL = 'export type Database = { old: true }\r\n// previous file\r\n';
const PROJECT_ID = 'abcdefghijklmnopqrst';

let generators;
before(() => {
  const write = (name, body) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, body);
    return file;
  };
  generators = {
    ok: write('ok.cjs', "process.stdout.write('export type Json = string\\nexport type Database = { fresh: true }\\n');"),
    failing: write('failing.cjs', "process.stderr.write('Unauthorized: token sbp_0123456789abcdef0123 rejected for project\\n'); process.exit(1);"),
    garbage: write('garbage.cjs', "process.stdout.write('<html>login required</html>');"),
    echoArgs: write('echo.cjs', "process.stdout.write('export type Database = ' + JSON.stringify(process.argv.slice(2)));"),
  };
});

const run = (env, name = 'database.ts') => {
  const out = path.join(dir, name);
  fs.writeFileSync(out, ORIGINAL);
  const result = spawnSync(process.execPath, [script, '--out', out], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      SUPABASE_TYPES_ENV_FILE: path.join(dir, 'missing.env'),
      ...env,
    },
  });
  return { ...result, content: fs.readFileSync(out, 'utf8') };
};

test('fails clearly without SUPABASE_PROJECT_ID and keeps the file', () => {
  const result = run({ SUPABASE_TYPES_GENERATOR: generators.ok });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SUPABASE_PROJECT_ID is not set/);
  assert.match(result.stderr, /was not changed/);
  assert.equal(result.content, ORIGINAL);
});

test('refuses a malformed project id without printing it', () => {
  const pasted = 'eyJhbGciOiJIUzI1NiJ9.secret.value';
  const result = run({ SUPABASE_PROJECT_ID: pasted, SUPABASE_TYPES_GENERATOR: generators.ok });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must be a Supabase project reference/);
  assert.ok(!result.stderr.includes(pasted) && !result.stdout.includes(pasted));
  assert.equal(result.content, ORIGINAL);
});

test('a failing generator keeps the file and hides tokens from its message', () => {
  const result = run({ SUPABASE_PROJECT_ID: PROJECT_ID, SUPABASE_TYPES_GENERATOR: generators.failing });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /the generator failed \(exit code 1\)/);
  assert.match(result.stderr, /\[redacted\]/);
  assert.ok(!result.stderr.includes('sbp_0123456789abcdef0123'));
  assert.equal(result.content, ORIGINAL);
});

test('output that is not Supabase types keeps the file', () => {
  const result = run({ SUPABASE_PROJECT_ID: PROJECT_ID, SUPABASE_TYPES_GENERATOR: generators.garbage });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not look like Supabase types/);
  assert.ok(!result.stderr.includes('<html>'));
  assert.equal(result.content, ORIGINAL);
});

test('a successful run replaces the file, keeps CRLF and prints no content', () => {
  const result = run({ SUPABASE_PROJECT_ID: PROJECT_ID, SUPABASE_TYPES_GENERATOR: generators.ok });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.content, 'export type Json = string\r\nexport type Database = { fresh: true }\r\n');
  assert.match(result.stdout, /updated/);
  assert.ok(!result.stdout.includes('fresh'));
  assert.deepEqual(fs.readdirSync(dir).filter((name) => name.includes('.tmp-')), [], 'no temporary file left');
});

test('the project id reaches the generator as --project-id', () => {
  const result = run({ SUPABASE_PROJECT_ID: PROJECT_ID, SUPABASE_TYPES_GENERATOR: generators.echoArgs }, 'echo.ts');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.content, `export type Database = ["--project-id","${PROJECT_ID}"]`);
});
