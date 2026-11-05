// Regenerates backend/src/types/database.ts from the Supabase project named by
// SUPABASE_PROJECT_ID (Etapa 1B.1: no hard-coded project id).
//
//   npm run supabase:types            (from backend/)
//
// - SUPABASE_PROJECT_ID comes from the environment or from backend/.env. It is
//   the project reference (20 lowercase letters), not a secret, and must be the
//   DEVELOPMENT project. Run this only after the database has every migration.
// - The Supabase CLI must be logged in (supabase login / SUPABASE_ACCESS_TOKEN).
// - The current file is replaced only when generation succeeds; on any error it
//   is left untouched. The generated content and credentials are never printed.
// - The line endings of the current file are preserved.
//
// Options for tests: --out <file>; SUPABASE_TYPES_ENV_FILE (env file to read);
// SUPABASE_TYPES_GENERATOR (a node script used instead of the Supabase CLI).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const backendDir = path.join(__dirname, '..');
const envFile = process.env.SUPABASE_TYPES_ENV_FILE || path.join(backendDir, '.env');
require(path.join(backendDir, 'node_modules', 'dotenv')).config({ path: envFile, quiet: true });

const outIndex = process.argv.indexOf('--out');
const target = outIndex > -1 ? path.resolve(process.argv[outIndex + 1]) : path.join(backendDir, 'src', 'types', 'database.ts');

const fail = (message) => {
  console.error(`supabase:types: ${message}`);
  console.error(`supabase:types: ${path.relative(process.cwd(), target) || target} was not changed.`);
  process.exit(1);
};

// Hide anything that looks like a credential in messages from the CLI.
const redact = (text) => {
  let result = String(text || '')
    .replace(/sbp_[A-Za-z0-9]+/g, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[redacted]');
  for (const name of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD']) {
    const value = process.env[name];
    if (value && value.length >= 8) result = result.split(value).join('[redacted]');
  }
  return result.trim();
};

const projectId = (process.env.SUPABASE_PROJECT_ID || '').trim();
if (!projectId) {
  fail('SUPABASE_PROJECT_ID is not set. Set it (environment or backend/.env) to the reference of the DEVELOPMENT project.');
}
if (!/^[a-z]{20}$/.test(projectId)) {
  fail('SUPABASE_PROJECT_ID must be a Supabase project reference (20 lowercase letters). The value is not shown.');
}

const generator = process.env.SUPABASE_TYPES_GENERATOR;
const isWindows = process.platform === 'win32';
const run = generator
  ? spawnSync(process.execPath, [generator, '--project-id', projectId], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  : spawnSync(isWindows ? 'npx.cmd' : 'npx', ['supabase', 'gen', 'types', 'typescript', '--project-id', projectId], {
    cwd: backendDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // Node refuses to spawn .cmd files without a shell on Windows; the only
    // argument from configuration is validated above (letters only).
    shell: isWindows,
  });

if (run.error) fail(`could not run the generator (${run.error.code || 'error'}).`);
if (run.status !== 0) {
  const detail = redact(run.stderr);
  fail(`the generator failed (exit code ${run.status})${detail ? `:\n${detail}` : '.'}`);
}
const generated = run.stdout || '';
if (!/export type Database\b/.test(generated)) {
  fail('the generator output does not look like Supabase types (no "export type Database").');
}

let output = generated.replace(/\r\n/g, '\n');
if (fs.existsSync(target) && fs.readFileSync(target, 'utf8').includes('\r\n')) {
  output = output.replace(/\n/g, '\r\n');
}

const temporary = `${target}.tmp-${process.pid}`;
try {
  fs.writeFileSync(temporary, output, 'utf8');
  fs.renameSync(temporary, target);
} catch (error) {
  try { fs.rmSync(temporary, { force: true }); } catch { /* nothing to clean */ }
  fail(`could not write the types file (${error.code || 'error'}).`);
}
console.log(`supabase:types: ${path.relative(process.cwd(), target) || target} updated (${output.split('\n').length} lines).`);
