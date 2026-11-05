// Identidade da instalação e guardas fiscais (Etapa 1B.1).
// Configuração e dependências explícitas: cliente do banco falso, nenhum acesso
// remoto, nenhuma chamada à Focus NFe.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://installation.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const {
  confirmInstallation,
  readInstallationMarker,
  verifyInstallation,
  InstallationCheckError,
} = require('../src/config/installation');
const { findEnvironmentProblems, isFocusNfeEnabled } = require('../src/config/env');
const { focusNfeService } = require('../src/services/focusNfe.service');
const { invoiceService } = require('../src/services/invoice.service');
const { orderRepository } = require('../src/repositories/order.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { invoiceRepository } = require('../src/repositories/invoice.repository');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');

const expected = { installationId: 'mesa-teste-dev', environment: 'development' };

// Cliente falso com a mesma cadeia que o supabase-js usa na leitura.
const fakeClient = (respond) => {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            limit(count) {
              calls.push(['limit', count]);
              return { abortSignal: (signal) => respond(signal) };
            },
          };
        },
      };
    },
  };
};

// ---------------------------------------------------------------------------
// Leitura do marcador
// ---------------------------------------------------------------------------

test('reads the one-row marker from app_installation', async () => {
  const client = fakeClient(async () => ({
    data: [{ installation_id: 'mesa-teste-dev', environment: 'development' }], error: null, status: 200,
  }));
  const result = await readInstallationMarker(client);
  assert.deepEqual(result, { kind: 'found', marker: { installationId: 'mesa-teste-dev', environment: 'development' } });
  assert.deepEqual(client.calls, [['from', 'app_installation'], ['select', 'installation_id, environment'], ['limit', 2]]);
});

const classify = [
  ['an empty table', { data: [], error: null, status: 200 }, 'missing'],
  ['a missing table (PostgREST)', { data: null, error: { code: 'PGRST205', message: 'x' }, status: 404 }, 'table-missing'],
  ['a missing table (PostgreSQL)', { data: null, error: { code: '42P01', message: 'x' }, status: 404 }, 'table-missing'],
  ['a network failure', { data: null, error: { code: '', message: 'TypeError: fetch failed' }, status: 0 }, 'unreachable'],
  ['a 503 answer', { data: null, error: { code: '', message: 'Service Unavailable' }, status: 503 }, 'unreachable'],
  ['a 401 answer', { data: null, error: { code: '42501', message: 'permission denied' }, status: 401 }, 'refused'],
  ['two rows', { data: [{ installation_id: 'a' }, { installation_id: 'b' }], error: null, status: 200 }, 'refused'],
];
for (const [label, response, kind] of classify) {
  test(`classifies ${label} as ${kind}`, async () => {
    const result = await readInstallationMarker(fakeClient(async () => response));
    assert.equal(result.kind, kind);
  });
}

test('a thrown client error counts as unreachable', async () => {
  const result = await readInstallationMarker(fakeClient(async () => { throw new Error('socket hang up'); }));
  assert.deepEqual(result, { kind: 'unreachable', reason: 'falha de rede' });
});

test('a database that never answers times out as unreachable', async () => {
  const client = fakeClient((signal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve({ data: null, error: { code: '', message: 'AbortError' }, status: 0 }));
  }));
  const result = await readInstallationMarker(client, { timeoutMs: 50 });
  assert.deepEqual(result, { kind: 'unreachable', reason: 'o banco não respondeu dentro do tempo limite' });
});

// ---------------------------------------------------------------------------
// Conferência
// ---------------------------------------------------------------------------

const expectCode = (result, code, pattern) => {
  assert.throws(() => confirmInstallation(expected, result), (error) => {
    assert.ok(error instanceof InstallationCheckError);
    assert.equal(error.code, code);
    assert.match(error.message, /^Identidade da instalação não confirmada; o servidor não vai subir\./);
    if (pattern) assert.match(error.message, pattern);
    assert.ok(!error.message.includes(expected.installationId), 'o valor de INSTALLATION_ID não aparece');
    return true;
  });
};

test('missing marker', () => expectCode({ kind: 'missing' }, 'MARKER_MISSING', /o servidor não cria o marcador sozinho/));
test('missing table', () => expectCode({ kind: 'table-missing' }, 'MARKER_TABLE_MISSING', /20261105120000_app_installation\.sql/));
test('connection failure is not a mismatch', () =>
  expectCode({ kind: 'unreachable', reason: 'falha de rede' }, 'DATABASE_UNREACHABLE', /falha de conexão, não divergência/));
test('refused read', () => expectCode({ kind: 'refused', reason: 'x' }, 'MARKER_READ_REFUSED'));
test('marker of another installation', () =>
  expectCode({ kind: 'found', marker: { installationId: 'outro-cliente-prod', environment: 'development' } },
    'INSTALLATION_MISMATCH', /"outro-cliente-prod"/));
test('marker of another environment', () =>
  expectCode({ kind: 'found', marker: { installationId: 'mesa-teste-dev', environment: 'production' } },
    'ENVIRONMENT_MISMATCH', /"production", mas APP_ENV=development/));

test('a matching marker is confirmed', async () => {
  const marker = await verifyInstallation(expected, async () => ({ kind: 'found', marker: { ...expected } }));
  assert.deepEqual(marker, expected);
});

// ---------------------------------------------------------------------------
// Configuração fiscal por ambiente
// ---------------------------------------------------------------------------

const baseEnv = {
  JWT_SECRET: 'a', JWT_REFRESH_SECRET: 'b', SUPABASE_URL: 'https://x.example.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'c', FRONTEND_URL: 'http://localhost', INSTALLATION_ID: 'mesa-teste-dev',
  APP_ENV: 'development', FOCUS_NFE_TOKEN: 'd', FOCUS_NFE_ENVIRONMENT: 'homologation', FOCUS_NFE_WEBHOOK_SECRET: 'e',
};

test('a complete development configuration has no problems', () => {
  assert.deepEqual(findEnvironmentProblems(baseEnv), []);
});

test('fiscal credentials are optional only with FOCUS_NFE_ENABLED=false', () => {
  const env = { ...baseEnv };
  delete env.FOCUS_NFE_TOKEN;
  delete env.FOCUS_NFE_ENVIRONMENT;
  delete env.FOCUS_NFE_WEBHOOK_SECRET;
  assert.equal(findEnvironmentProblems(env).length, 3);
  assert.deepEqual(findEnvironmentProblems({ ...env, FOCUS_NFE_ENABLED: 'false' }), []);
  assert.equal(isFocusNfeEnabled({}), true, 'sem a variável, a emissão continua ativa (comportamento atual)');
});

test('production may use homologation (no obligation to issue production documents)', () => {
  assert.deepEqual(findEnvironmentProblems({ ...baseEnv, APP_ENV: 'production' }), []);
});

// ---------------------------------------------------------------------------
// Guardas fiscais em tempo de execução: nada é reservado, nada é enviado
// ---------------------------------------------------------------------------

const saved = {};
let fetchCalls;
let createdInvoices;

beforeEach(() => {
  for (const name of ['APP_ENV', 'FOCUS_NFE_ENABLED', 'FOCUS_NFE_ENVIRONMENT', 'FOCUS_NFE_TOKEN', 'FOCUS_NFE_BASE_URL']) saved[name] = process.env[name];
  saved.fetch = global.fetch;
  fetchCalls = 0;
  createdInvoices = 0;
  global.fetch = async () => { fetchCalls += 1; throw new Error('no network in this test'); };
  delete process.env.APP_ENV;
  delete process.env.FOCUS_NFE_ENABLED;
  delete process.env.FOCUS_NFE_BASE_URL;
  process.env.FOCUS_NFE_TOKEN = 'test-only-focus-token';
  orderRepository.findById = async () => ({ id: 'order-1', status: 'FINISHED', customerId: null });
  restaurantConfigRepository.get = async () => ({ nfceEnabled: true });
  paymentRepository.findByOrder = async () => [{ id: 'pay-1', status: 'PAID', method: 'PIX', amount: 10 }];
  invoiceRepository.findActiveByOrderId = async () => null;
  invoiceRepository.findByOrderId = async () => null;
  invoiceRepository.create = async (attempt) => { createdInvoices += 1; return attempt; };
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (name === 'fetch') continue;
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  global.fetch = saved.fetch;
});

test('with FOCUS_NFE_ENABLED=false an NFC-e is refused before reserving the invoice', async () => {
  process.env.FOCUS_NFE_ENABLED = 'false';
  process.env.FOCUS_NFE_ENVIRONMENT = 'homologation';
  await assert.rejects(invoiceService.issueNfce('order-1', null), (error) => error.code === 'FOCUS_NFE_DISABLED' && error.status === 503);
  assert.equal(createdInvoices, 0, 'nenhuma nota reservada');
  assert.equal(fetchCalls, 0, 'nenhuma chamada à Focus');
  // Ler a configuração continua possível; só a autorização de emissão recusa.
  assert.equal(focusNfeService.getEnvironment(), 'homologation');
  assert.throws(() => focusNfeService.getIssuanceEnvironment(), (error) => error.code === 'FOCUS_NFE_DISABLED');
});

for (const appEnv of ['development', 'test', 'staging']) {
  test(`APP_ENV=${appEnv} never issues with FOCUS_NFE_ENVIRONMENT=production`, async () => {
    process.env.APP_ENV = appEnv;
    process.env.FOCUS_NFE_ENVIRONMENT = 'production';
    await assert.rejects(invoiceService.issueNfce('order-1', null), (error) => error.code === 'FOCUS_NFE_ENVIRONMENT_FORBIDDEN');
    assert.equal(createdInvoices, 0);
    assert.equal(fetchCalls, 0);
  });
}

test('APP_ENV=production keeps the production fiscal environment available', () => {
  process.env.APP_ENV = 'production';
  process.env.FOCUS_NFE_ENVIRONMENT = 'production';
  assert.equal(focusNfeService.getEnvironment(), 'production');
});

test('outside production, homologation keeps working as before', () => {
  process.env.APP_ENV = 'development';
  process.env.FOCUS_NFE_ENVIRONMENT = 'homologation';
  assert.equal(focusNfeService.getEnvironment(), 'homologation');
});
