// Fails if a build carries a value that belongs to one installation.
// Usage: node scripts/check-public-bundle.mjs <build folder>
// Reports the file and the kind of value found, never the value itself.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const buildDir = process.argv[2];
if (!buildDir || !existsSync(buildDir)) {
  console.error('Informe uma pasta de build existente.');
  process.exit(2);
}

const PATTERNS = [
  ['token JWT', /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}/],
  ['chave publishable do Supabase', /sb_publishable_[A-Za-z0-9]/],
  ['chave secreta do Supabase', /sb_secret_[A-Za-z0-9]/],
  ['URL de projeto Supabase', /[a-z0-9]{20}\.supabase\.co/],
  ['URL local de desenvolvimento', /localhost:3001/],
];

// Values in the local env files, which a build must ignore. Read only when the
// files exist; the Docker build context does not include them.
function localEnvValues() {
  const frontendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const values = [];
  for (const name of readdirSync(frontendDir)) {
    if (!name.startsWith('.env') || name.endsWith('.example')) continue;
    for (const line of readFileSync(join(frontendDir, name), 'utf8').split(/\r?\n/)) {
      const match = /^\s*(?:VITE|PUBLIC)_(API_URL|SUPABASE_URL|SUPABASE_ANON_KEY)\s*=\s*(.*?)\s*$/.exec(line);
      const value = match?.[2].replace(/^["']|["']$/g, '');
      // A short value such as /api also appears in ordinary code.
      if (value && value.length >= 12) values.push(value);
    }
  }
  return values;
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const envValues = localEnvValues();
const problems = [];
const files = listFiles(buildDir);

for (const file of files) {
  const name = relative(buildDir, file);
  if (name === 'runtime-config.json') {
    problems.push(`${name}: o build não pode trazer a configuração de uma instalação`);
    continue;
  }
  const content = readFileSync(file).toString('latin1');
  for (const [label, pattern] of PATTERNS) {
    if (pattern.test(content)) problems.push(`${name}: ${label}`);
  }
  if (envValues.some((value) => content.includes(value))) {
    problems.push(`${name}: valor de um arquivo .env local`);
  }
}

if (problems.length > 0) {
  console.error('Build com valores de instalação:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Build sem valores de instalação: ${files.length} arquivos conferidos.`);
