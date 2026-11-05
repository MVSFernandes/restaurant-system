const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { startStub } = require('../scripts/postgrest-marker-stub.cjs');

// Sobe o servidor de verdade (src/server.ts) num processo separado. O
// diretório de trabalho é uma pasta vazia, para o dotenv não achar nenhum
// .env: só vale o que o teste passa. Nenhum valor aqui é segredo real.
// O banco é um stub local do PostgREST (scripts/postgrest-marker-stub.cjs)
// que só responde à leitura do marcador da instalação: nada remoto.
const serverEntry = path.join(__dirname, '../src/server.ts');
const tsNode = require.resolve('ts-node/register/transpile-only');
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-startup-'));

const INSTALLATION = { installationId: 'test-installation', environment: 'test' };
const stubs = {};

before(async () => {
  stubs.test = await startStub({ mode: 'found', marker: INSTALLATION });
  stubs.production = await startStub({ mode: 'found', marker: { installationId: 'test-installation', environment: 'production' } });
  stubs.otherInstallation = await startStub({ mode: 'found', marker: { installationId: 'other-installation', environment: 'test' } });
  stubs.empty = await startStub({ mode: 'empty' });
  stubs.tableMissing = await startStub({ mode: 'table-missing' });
  stubs.serverError = await startStub({ mode: 'server-error' });
  stubs.forbidden = await startStub({ mode: 'forbidden' });
  stubs.slow = await startStub({ mode: 'found', marker: INSTALLATION, delayMs: 1500 });
});

after(async () => {
  await Promise.all(Object.values(stubs).map((stub) => stub.close()));
});

const validEnv = () => ({
  JWT_SECRET: 'test-only-jwt-secret',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret',
  SUPABASE_URL: stubs.test.url,
  SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
  FOCUS_NFE_TOKEN: 'test-only-focus-token',
  FOCUS_NFE_ENVIRONMENT: 'homologation',
  FOCUS_NFE_WEBHOOK_SECRET: 'test-only-webhook-secret',
  FRONTEND_URL: 'http://localhost:5173',
  INSTALLATION_ID: INSTALLATION.installationId,
  APP_ENV: INSTALLATION.environment,
});
const REQUIRED_NAMES = [
  'JWT_SECRET', 'JWT_REFRESH_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'FOCUS_NFE_TOKEN', 'FOCUS_NFE_ENVIRONMENT', 'FOCUS_NFE_WEBHOOK_SECRET', 'FRONTEND_URL',
  'INSTALLATION_ID', 'APP_ENV',
];
const SECRET_VALUES = ['test-only-jwt-secret', 'test-only-refresh-secret', 'test-only-service-key',
  'test-only-focus-token', 'test-only-webhook-secret'];

const baseEnv = () => {
  const env = { ...process.env };
  for (const name of [...REQUIRED_NAMES, 'PORT', 'NODE_ENV', 'FOCUS_NFE_ENABLED', 'FOCUS_NFE_BASE_URL']) delete env[name];
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
  const env = validEnv();
  delete env[name];
  return env;
};

const assertNoSecrets = (result) => {
  for (const secret of SECRET_VALUES) {
    assert.ok(!result.stderr.includes(secret) && !result.stdout.includes(secret), 'nenhum segredo pode aparecer na saída');
  }
  assert.doesNotMatch(result.stderr, /at .*\.ts:\d+/, 'a recusa é uma mensagem, não um stack trace');
};

const assertRefused = (result, pattern) => {
  assert.equal(result.started, false, result.stdout);
  assert.equal(result.code, 1);
  assert.match(result.stderr, pattern);
  assert.ok(!result.stdout.includes('Server is running'));
  assertNoSecrets(result);
};

// ---------------------------------------------------------------------------
// Configuração (antes de qualquer acesso ao banco)
// ---------------------------------------------------------------------------

test('server refuses to start without JWT_SECRET and names the variable', async () => {
  const result = await startServer(without('JWT_SECRET'));
  assertRefused(result, /Configuração inválida; o servidor não vai subir\./);
  assert.match(result.stderr, /- JWT_SECRET não está definida\./);
});

for (const name of REQUIRED_NAMES.filter((name) => name !== 'JWT_SECRET')) {
  test(`server refuses to start without ${name}`, async () => {
    const result = await startServer(without(name));
    assert.equal(result.code, 1);
    assert.match(result.stderr, new RegExp(`- ${name} não está definida\\.`));
  });
}

test('a blank value counts as missing', async () => {
  const result = await startServer({ ...validEnv(), JWT_SECRET: '   ' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /- JWT_SECRET não está definida\./);
});

// O caso real: o token da Focus colado no lugar do ambiente. Antes o sistema
// aceitava e caía em homologação sem avisar.
test('FOCUS_NFE_ENVIRONMENT holding the token refuses to start without printing it', async () => {
  const env = validEnv();
  const result = await startServer({ ...env, FOCUS_NFE_ENVIRONMENT: env.FOCUS_NFE_TOKEN });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /- FOCUS_NFE_ENVIRONMENT tem um valor fora dos aceitos \(production ou homologation\)\./);
  assert.match(result.stderr, /O valor é igual ao de FOCUS_NFE_TOKEN\./);
  assertNoSecrets(result);
});

for (const value of ['homologacao', 'Production', 'prod', 'production ']) {
  test(`FOCUS_NFE_ENVIRONMENT=${JSON.stringify(value)} refuses to start`, async () => {
    const result = await startServer({ ...validEnv(), FOCUS_NFE_ENVIRONMENT: value });
    assert.equal(result.code, 1);
    // A linha é só o texto fixo: nada do valor encontrado entra nela.
    assert.deepEqual(result.stderr.trim().split(/\r?\n/), [
      'Configuração inválida; o servidor não vai subir.',
      '- FOCUS_NFE_ENVIRONMENT tem um valor fora dos aceitos (production ou homologation). O valor não é exibido porque pode ser um segredo.',
    ]);
  });
}

test('every missing variable is listed at once', async () => {
  const result = await startServer({});
  assert.equal(result.code, 1);
  for (const name of REQUIRED_NAMES) {
    assert.match(result.stderr, new RegExp(`- ${name} não está definida\\.`));
  }
});

for (const [label, value] of [['an unknown name', 'producao'], ['uppercase', 'PRODUCTION'], ['a pasted secret', 'test-only-service-key']]) {
  test(`APP_ENV with ${label} refuses to start without printing the value`, async () => {
    const result = await startServer({ ...validEnv(), APP_ENV: value });
    assertRefused(result, /- APP_ENV tem um valor fora dos aceitos \(development, test, staging, production\)\./);
    assert.ok(!result.stderr.includes(value));
  });
}

for (const value of ['Mesa Farta', 'ab', '-starts-with-hyphen', 'test-only-service-key ']) {
  test(`INSTALLATION_ID=${JSON.stringify(value)} refuses to start`, async () => {
    const result = await startServer({ ...validEnv(), INSTALLATION_ID: value });
    assertRefused(result, /- INSTALLATION_ID deve ter de 3 a 64 caracteres/);
  });
}

// ---------------------------------------------------------------------------
// Ambiente fiscal
// ---------------------------------------------------------------------------

for (const appEnv of ['development', 'test', 'staging']) {
  test(`APP_ENV=${appEnv} cannot use FOCUS_NFE_ENVIRONMENT=production`, async () => {
    const result = await startServer({ ...validEnv(), APP_ENV: appEnv, FOCUS_NFE_ENVIRONMENT: 'production' });
    assertRefused(result, new RegExp(`- APP_ENV=${appEnv} não pode usar FOCUS_NFE_ENVIRONMENT=production\\.`));
  });
}

test('outside production, FOCUS_NFE_BASE_URL cannot point to the Focus production API', async () => {
  const result = await startServer({ ...validEnv(), FOCUS_NFE_BASE_URL: 'https://api.focusnfe.com.br/v2' });
  assertRefused(result, /não pode usar FOCUS_NFE_BASE_URL apontando para a API de produção/);
});

test('outside production, fiscal production stays refused even with emission disabled', async () => {
  const result = await startServer({ ...validEnv(), FOCUS_NFE_ENABLED: 'false', FOCUS_NFE_ENVIRONMENT: 'production' });
  assertRefused(result, /não pode usar FOCUS_NFE_ENVIRONMENT=production/);
});

test('FOCUS_NFE_ENABLED accepts only true or false', async () => {
  const result = await startServer({ ...validEnv(), FOCUS_NFE_ENABLED: 'yes' });
  assertRefused(result, /- FOCUS_NFE_ENABLED aceita apenas true ou false\./);
});

test('production with FOCUS_NFE_ENVIRONMENT=production starts', async () => {
  const port = await freePort();
  const result = await startServer({
    ...validEnv(), APP_ENV: 'production', FOCUS_NFE_ENVIRONMENT: 'production',
    SUPABASE_URL: stubs.production.url, PORT: String(port),
  });
  result.child.kill();
  assert.equal(result.started, true, result.stderr);
});

test('production with fiscal emission disabled starts without any Focus credential', async () => {
  const port = await freePort();
  const env = { ...validEnv(), APP_ENV: 'production', SUPABASE_URL: stubs.production.url, FOCUS_NFE_ENABLED: 'false', PORT: String(port) };
  delete env.FOCUS_NFE_TOKEN;
  delete env.FOCUS_NFE_ENVIRONMENT;
  delete env.FOCUS_NFE_WEBHOOK_SECRET;
  const result = await startServer(env);
  result.child.kill();
  assert.equal(result.started, true, result.stderr);
});

// ---------------------------------------------------------------------------
// Identidade da instalação (marcador no banco)
// ---------------------------------------------------------------------------

test('a database without the marker refuses to start and does not create it', async () => {
  const before = stubs.empty.requests.length;
  const result = await startServer({ ...validEnv(), SUPABASE_URL: stubs.empty.url });
  assertRefused(result, /Identidade da instalação não confirmada; o servidor não vai subir\./);
  assert.match(result.stderr, /ainda não tem identidade de instalação/);
  const requests = stubs.empty.requests.slice(before);
  assert.ok(requests.length >= 1, 'o marcador foi consultado');
  assert.ok(requests.every((request) => request.method === 'GET'), 'nenhuma escrita: o servidor não cria o marcador');
});

test('a database without the app_installation table names the missing migration', async () => {
  const result = await startServer({ ...validEnv(), SUPABASE_URL: stubs.tableMissing.url });
  assertRefused(result, /A tabela app_installation não existe neste banco: aplique a migration 20261105120000_app_installation\.sql\./);
});

test('a database of another installation refuses to start', async () => {
  const result = await startServer({ ...validEnv(), SUPABASE_URL: stubs.otherInstallation.url });
  assertRefused(result, /O banco pertence à instalação "other-installation", diferente de INSTALLATION_ID\./);
  assert.ok(!result.stderr.includes(`"${INSTALLATION.installationId}"`), 'o valor de INSTALLATION_ID não aparece');
});

test('a database of another environment refuses to start', async () => {
  const result = await startServer({ ...validEnv(), APP_ENV: 'development' });
  assertRefused(result, /O banco é do ambiente "test", mas APP_ENV=development\./);
});

test('an unreachable database is reported as a connection failure, not a mismatch', async () => {
  const closedPort = await freePort();
  const result = await startServer({ ...validEnv(), SUPABASE_URL: `http://127.0.0.1:${closedPort}` });
  assertRefused(result, /Não foi possível consultar o banco para conferir a instalação \(falha de rede\)\./);
  assert.match(result.stderr, /Isto é falha de conexão, não divergência de identidade/);
  assert.ok(!result.stderr.includes(String(closedPort)), 'o endereço do banco não aparece');
});

test('a database answering 5xx is reported as a connection failure', async () => {
  const result = await startServer({ ...validEnv(), SUPABASE_URL: stubs.serverError.url });
  assertRefused(result, /\(o banco respondeu HTTP 503\)\. Isto é falha de conexão/);
});

test('a refused read (key or permission) is reported as such', async () => {
  const result = await startServer({ ...validEnv(), SUPABASE_URL: stubs.forbidden.url });
  assertRefused(result, /Não foi possível ler a identidade da instalação: o banco recusou a leitura \(HTTP 401, código 42501\)/);
});

test('server starts and answers when the marker matches', async () => {
  const port = await freePort();
  const result = await startServer({ ...validEnv(), PORT: String(port) });
  try {
    assert.equal(result.started, true, result.stderr);
    assert.match(result.stdout, /Instalação confirmada: test-installation \(test\)\./);
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
    assertNoSecrets(result);
  } finally {
    result.child.kill();
  }
});

test('the port is not opened before the marker is confirmed', async () => {
  const port = await freePort();
  const before = stubs.slow.requests.length;
  const pending = startServer({ ...validEnv(), SUPABASE_URL: stubs.slow.url, PORT: String(port) });
  // Wait until the server has asked for the marker (the stub holds the answer
  // for 1.5 s). While that read is pending, the port must not be listening.
  const deadline = Date.now() + 20_000;
  while (stubs.slow.requests.length === before && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(stubs.slow.requests.length > before, 'o servidor consultou o marcador');
  const early = await fetch(`http://127.0.0.1:${port}/health`).then(() => 'answered', () => 'refused');
  const result = await pending;
  try {
    assert.equal(early, 'refused', 'nenhuma requisição é aceita antes da conferência');
    assert.equal(result.started, true, result.stderr);
  } finally {
    result.child.kill();
  }
});
