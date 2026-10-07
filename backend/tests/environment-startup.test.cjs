const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

// Sobe o servidor de verdade (src/server.ts) num processo separado. O
// diretório de trabalho é uma pasta vazia, para o dotenv não achar nenhum
// .env: só vale o que o teste passa. Nenhum valor aqui é segredo real.
const serverEntry = path.join(__dirname, '../src/server.ts');
const tsNode = require.resolve('ts-node/register/transpile-only');
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-startup-'));

const validEnv = {
  JWT_SECRET: 'test-only-jwt-secret',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret',
  SUPABASE_URL: 'https://database.example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
  FOCUS_NFE_TOKEN: 'test-only-focus-token',
  FOCUS_NFE_ENVIRONMENT: 'homologation',
  FOCUS_NFE_WEBHOOK_SECRET: 'test-only-webhook-secret',
  FRONTEND_URL: 'http://localhost:5173',
};

const baseEnv = () => {
  const env = { ...process.env };
  for (const name of [...Object.keys(validEnv), 'PORT', 'NODE_ENV']) delete env[name];
  return env;
};

const freePort = () => new Promise((resolve) => {
  const probe = net.createServer().listen(0, () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const startServer = (env) => new Promise((resolve) => {
  const child = spawn(process.execPath, ['-r', tsNode, serverEntry], {
    cwd: emptyDir,
    env: { ...baseEnv(), TS_NODE_PROJECT: path.join(__dirname, '../tsconfig.json'), ...env },
  });
  let stdout = '';
  let stderr = '';
  let settled = false;
  const finish = (result) => {
    if (settled) return;
    settled = true;
    resolve({ ...result, stdout, stderr, child });
  };
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes('Server is running')) finish({ started: true });
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('exit', (code) => finish({ started: false, code }));
});

const without = (name) => {
  const env = { ...validEnv };
  delete env[name];
  return env;
};

test('server refuses to start without JWT_SECRET and names the variable', async () => {
  const result = await startServer(without('JWT_SECRET'));
  assert.equal(result.started, false);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Configuração inválida; o servidor não vai subir\./);
  assert.match(result.stderr, /- JWT_SECRET não está definida\./);
  assert.doesNotMatch(result.stderr, /at .*\.ts:\d+/, 'a recusa é uma mensagem, não um stack trace');
});

for (const name of Object.keys(validEnv).filter((name) => name !== 'JWT_SECRET')) {
  test(`server refuses to start without ${name}`, async () => {
    const result = await startServer(without(name));
    assert.equal(result.code, 1);
    assert.match(result.stderr, new RegExp(`- ${name} não está definida\\.`));
  });
}

test('a blank value counts as missing', async () => {
  const result = await startServer({ ...validEnv, JWT_SECRET: '   ' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /- JWT_SECRET não está definida\./);
});

// O caso real: o token da Focus colado no lugar do ambiente. Antes o sistema
// aceitava e caía em homologação sem avisar.
test('FOCUS_NFE_ENVIRONMENT holding the token refuses to start without printing it', async () => {
  const result = await startServer({ ...validEnv, FOCUS_NFE_ENVIRONMENT: validEnv.FOCUS_NFE_TOKEN });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /- FOCUS_NFE_ENVIRONMENT tem um valor fora dos aceitos \(production ou homologation\)\./);
  assert.match(result.stderr, /O valor é igual ao de FOCUS_NFE_TOKEN\./);
  assert.ok(!result.stderr.includes(validEnv.FOCUS_NFE_TOKEN), 'o valor não pode aparecer na mensagem');
  assert.ok(!result.stdout.includes(validEnv.FOCUS_NFE_TOKEN), 'o valor não pode aparecer na mensagem');
});

for (const value of ['homologacao', 'Production', 'prod', 'production ']) {
  test(`FOCUS_NFE_ENVIRONMENT=${JSON.stringify(value)} refuses to start`, async () => {
    const result = await startServer({ ...validEnv, FOCUS_NFE_ENVIRONMENT: value });
    assert.equal(result.code, 1);
    // A linha é só o texto fixo: nada do valor encontrado entra nela.
    assert.deepEqual(result.stderr.trim().split(/\r?\n/), [
      'Configuração inválida; o servidor não vai subir.',
      '- FOCUS_NFE_ENVIRONMENT tem um valor fora dos aceitos (production ou homologation). O valor não é exibido porque pode ser um segredo.',
    ]);
  });
}

test('FOCUS_NFE_ENVIRONMENT=production is accepted', async () => {
  const port = await freePort();
  const result = await startServer({ ...validEnv, FOCUS_NFE_ENVIRONMENT: 'production', PORT: String(port) });
  result.child.kill();
  assert.equal(result.started, true, result.stderr);
});

test('every missing variable is listed at once', async () => {
  const result = await startServer({});
  assert.equal(result.code, 1);
  for (const name of Object.keys(validEnv)) {
    assert.match(result.stderr, new RegExp(`- ${name} não está definida\\.`));
  }
});

test('server starts and answers with every variable set', async () => {
  const port = await freePort();
  const result = await startServer({ ...validEnv, PORT: String(port) });
  try {
    assert.equal(result.started, true, result.stderr);
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
  } finally {
    result.child.kill();
  }
});
