// Guardas fiscais da instalação (Etapa 1B.1): autorização de novas emissões
// separada da leitura da configuração, e destino fiscal conferido antes de
// cada chamada. Só mocks: o fetch global é trocado por um registrador e nada
// sai para a rede; o banco é simulado nos repositórios.
const { test, beforeEach, afterEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://fiscal-guards.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';
process.env.FRONTEND_URL = 'http://localhost:5173';

const { focusNfeService } = require('../src/services/focusNfe.service');
const { invoiceService } = require('../src/services/invoice.service');
const { findEnvironmentProblems } = require('../src/config/env');
const { orderRepository } = require('../src/repositories/order.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { invoiceRepository } = require('../src/repositories/invoice.repository');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');
const app = require('../src/app').default;

const TOKEN = 'test-only-focus-token';
const WEBHOOK_SECRET = 'test-only-webhook-secret';
const MANAGED = ['APP_ENV', 'FOCUS_NFE_ENABLED', 'FOCUS_NFE_ENVIRONMENT', 'FOCUS_NFE_TOKEN', 'FOCUS_NFE_BASE_URL', 'FOCUS_NFE_WEBHOOK_SECRET'];

const saved = {};
let fetchCalls;
let focusAnswer;
let reserved;
let updates;

const existingInvoice = (overrides = {}) => ({
  id: 'inv-1', orderId: 'order-1', model: '65', status: 'processing', focusRef: 'nfce_order-1',
  environment: 'homologation', ...overrides,
});

beforeEach(() => {
  for (const name of MANAGED) saved[name] = process.env[name];
  saved.fetch = global.fetch;
  for (const name of MANAGED) delete process.env[name];
  // Instalação de desenvolvimento, homologação, credenciais válidas.
  process.env.APP_ENV = 'development';
  process.env.FOCUS_NFE_ENVIRONMENT = 'homologation';
  process.env.FOCUS_NFE_TOKEN = TOKEN;
  process.env.FOCUS_NFE_WEBHOOK_SECRET = WEBHOOK_SECRET;

  fetchCalls = [];
  focusAnswer = { status: 200, body: { status: 'autorizado' } };
  global.fetch = async (url, options) => {
    fetchCalls.push({ url, method: options.method, authorization: options.headers.Authorization });
    return {
      ok: focusAnswer.status < 400,
      status: focusAnswer.status,
      headers: { get: () => null },
      text: async () => JSON.stringify(focusAnswer.body),
    };
  };

  reserved = [];
  updates = [];
  orderRepository.findById = async () => ({ id: 'order-1', status: 'FINISHED', customerId: null });
  restaurantConfigRepository.get = async () => ({ nfceEnabled: true });
  paymentRepository.findByOrder = async () => [{ id: 'pay-1', status: 'PAID', method: 'PIX', amount: 10 }];
  invoiceRepository.findActiveByOrderId = async () => null;
  invoiceRepository.findByOrderId = async () => null;
  invoiceRepository.create = async (attempt) => { reserved.push(attempt); return attempt; };
  invoiceRepository.findById = async () => existingInvoice();
  invoiceRepository.findByFocusRef = async () => existingInvoice();
  invoiceRepository.update = async (id, patch) => { updates.push({ id, patch }); return { ...existingInvoice(), ...patch }; };
});

afterEach(() => {
  for (const name of MANAGED) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  global.fetch = saved.fetch;
});

const posts = () => fetchCalls.filter((call) => call.method === 'POST');

// ---------------------------------------------------------------------------
// 1. Emissão desativada: nenhuma reserva e nenhum POST
// ---------------------------------------------------------------------------

test('emission disabled: the invoice service reserves nothing and sends no POST', async () => {
  process.env.FOCUS_NFE_ENABLED = 'false';
  await assert.rejects(invoiceService.issueNfce('order-1', null), (error) => error.code === 'FOCUS_NFE_DISABLED');
  await assert.rejects(invoiceService.issueOrderInvoice('order-1', 'customer-1'), (error) => error.code === 'FOCUS_NFE_DISABLED');
  assert.deepEqual(reserved, [], 'nenhuma nota reservada');
  assert.deepEqual(fetchCalls, [], 'nenhuma chamada');
});

test('emission disabled: a direct issuance through the Focus service sends no POST', async () => {
  process.env.FOCUS_NFE_ENABLED = 'false';
  await assert.rejects(focusNfeService.issueNfce('nfce_direct', { items: [] }), (error) => error.code === 'FOCUS_NFE_DISABLED');
  await assert.rejects(focusNfeService.issueNfe('nfe_direct', { items: [] }), (error) => error.code === 'FOCUS_NFE_DISABLED');
  assert.deepEqual(posts(), []);
  assert.deepEqual(fetchCalls, []);
});

// ---------------------------------------------------------------------------
// 2. Consulta de documento existente com emissão desativada
// ---------------------------------------------------------------------------

test('emission disabled: an existing document is still queried with valid credentials', async () => {
  process.env.FOCUS_NFE_ENABLED = 'false';
  focusAnswer = { status: 200, body: { status: 'autorizado', caminho_xml_nota_fiscal: '/arquivos/nfce.xml', caminho_danfe: '/arquivos/nfce.html' } };
  const invoice = await invoiceService.getInvoiceStatus('inv-1');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].method, 'GET');
  assert.equal(fetchCalls[0].url, 'https://homologacao.focusnfe.com.br/v2/nfce/nfce_order-1');
  assert.equal(fetchCalls[0].authorization, `Basic ${Buffer.from(`${TOKEN}:`).toString('base64')}`);
  assert.equal(invoice.status, 'authorized');
  // Same normalization as before: a leading "/" resolves from the host root.
  assert.equal(invoice.xmlUrl, 'https://homologacao.focusnfe.com.br/arquivos/nfce.xml');
  assert.equal(invoice.danfeUrl, 'https://homologacao.focusnfe.com.br/arquivos/nfce.html');
  assert.deepEqual(reserved, []);
});

test('a query without the Focus token fails clearly and makes no call', async () => {
  process.env.FOCUS_NFE_ENABLED = 'false';
  delete process.env.FOCUS_NFE_TOKEN;
  await assert.rejects(invoiceService.getInvoiceStatus('inv-1'),
    (error) => error.code === 'FOCUS_NFE_NOT_CONFIGURED' && /FOCUS_NFE_TOKEN/.test(error.message));
  assert.deepEqual(fetchCalls, []);
});

test('a query without the fiscal environment fails clearly and makes no call', async () => {
  delete process.env.FOCUS_NFE_ENVIRONMENT;
  await assert.rejects(focusNfeService.getNfce('nfce_order-1'),
    (error) => error.code === 'FOCUS_NFE_NOT_CONFIGURED' && /FOCUS_NFE_ENVIRONMENT/.test(error.message));
  assert.deepEqual(fetchCalls, []);
});

// ---------------------------------------------------------------------------
// 3. Webhook com caminhos relativos e emissão desativada
// ---------------------------------------------------------------------------

const webhookPayload = {
  ref: 'nfce_order-1',
  status: 'autorizado',
  caminho_xml_nota_fiscal: '/arquivos/123/nfce.xml',
  caminho_danfe: 'arquivos/123/danfe.html',
};

test('emission disabled: the webhook still updates the invoice with absolute XML/DANFE links', async () => {
  process.env.FOCUS_NFE_ENABLED = 'false';
  const invoice = await invoiceService.applyFocusWebhook(webhookPayload);
  assert.equal(invoice.status, 'authorized');
  assert.equal(updates.length, 1);
  // Leading "/" resolves from the host root; no leading "/" resolves under /v2/.
  assert.equal(updates[0].patch.xmlUrl, 'https://homologacao.focusnfe.com.br/arquivos/123/nfce.xml');
  assert.equal(updates[0].patch.danfeUrl, 'https://homologacao.focusnfe.com.br/v2/arquivos/123/danfe.html');
  assert.deepEqual(fetchCalls, [], 'o webhook não chama a Focus');
});

let server;
let baseUrl;
before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('emission disabled: POST /api/webhooks/focus-nfe with relative paths answers 200 and stores absolute links', async () => {
  process.env.FOCUS_NFE_ENABLED = 'false';
  // The local HTTP call itself must use the real fetch; the Focus mock only records Focus calls.
  const response = await saved.fetch(`${baseUrl}/webhooks/focus-nfe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: WEBHOOK_SECRET },
    body: JSON.stringify(webhookPayload),
  });
  assert.equal(response.status, 200);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.xmlUrl, 'https://homologacao.focusnfe.com.br/arquivos/123/nfce.xml');
  assert.equal(updates[0].patch.danfeUrl, 'https://homologacao.focusnfe.com.br/v2/arquivos/123/danfe.html');
  assert.deepEqual(fetchCalls, []);
});

// ---------------------------------------------------------------------------
// 4. Destino efetivo fora de produção
// ---------------------------------------------------------------------------

test('APP_ENV=development with FOCUS_NFE_BASE_URL at the production API: direct issuance is blocked before fetch', async () => {
  process.env.FOCUS_NFE_BASE_URL = 'https://api.focusnfe.com.br/v2';
  await assert.rejects(focusNfeService.issueNfce('nfce_direct', { items: [] }),
    (error) => error.code === 'FOCUS_NFE_ENVIRONMENT_FORBIDDEN');
  await assert.rejects(invoiceService.issueNfce('order-1', null), (error) => error.code === 'FOCUS_NFE_ENVIRONMENT_FORBIDDEN');
  assert.deepEqual(reserved, []);
  assert.deepEqual(fetchCalls, []);
});

test('APP_ENV=development cannot query the production API either', async () => {
  process.env.FOCUS_NFE_BASE_URL = 'https://API.FocusNFe.com.br/v2/';
  await assert.rejects(focusNfeService.getNfce('nfce_order-1'), (error) => error.code === 'FOCUS_NFE_ENVIRONMENT_FORBIDDEN');
  process.env.FOCUS_NFE_BASE_URL = '';
  process.env.FOCUS_NFE_ENVIRONMENT = 'production';
  await assert.rejects(focusNfeService.getNfce('nfce_order-1'), (error) => error.code === 'FOCUS_NFE_ENVIRONMENT_FORBIDDEN');
  assert.deepEqual(fetchCalls, []);
});

test('without APP_ENV the service treats the installation as non-production', async () => {
  delete process.env.APP_ENV;
  process.env.FOCUS_NFE_ENVIRONMENT = 'production';
  await assert.rejects(focusNfeService.issueNfce('nfce_direct', { items: [] }), (error) => error.code === 'FOCUS_NFE_ENVIRONMENT_FORBIDDEN');
  assert.deepEqual(fetchCalls, []);
});

test('APP_ENV=production may issue against the production API (mocked fetch)', async () => {
  process.env.APP_ENV = 'production';
  process.env.FOCUS_NFE_ENVIRONMENT = 'production';
  await focusNfeService.issueNfce('nfce_prod', { items: [] });
  assert.equal(posts().length, 1);
  assert.equal(posts()[0].url, 'https://api.focusnfe.com.br/v2/nfce?ref=nfce_prod');
});

test('a test host stays allowed outside production', async () => {
  process.env.FOCUS_NFE_BASE_URL = 'https://focus.example.test/v2';
  await focusNfeService.issueNfce('nfce_test', { items: [] });
  assert.equal(posts()[0].url, 'https://focus.example.test/v2/nfce?ref=nfce_test');
});

test('startup and service use the same rule and the same message', async () => {
  process.env.FOCUS_NFE_BASE_URL = 'https://api.focusnfe.com.br/v2';
  const startupProblems = findEnvironmentProblems({
    JWT_SECRET: 'a', JWT_REFRESH_SECRET: 'b', SUPABASE_URL: 'https://x.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'c',
    FRONTEND_URL: 'http://localhost', INSTALLATION_ID: 'mesa-teste-dev', APP_ENV: 'development',
    FOCUS_NFE_TOKEN: 'd', FOCUS_NFE_ENVIRONMENT: 'homologation', FOCUS_NFE_WEBHOOK_SECRET: 'e',
    FOCUS_NFE_BASE_URL: 'https://api.focusnfe.com.br/v2',
  });
  await assert.rejects(focusNfeService.getNfce('nfce_order-1'), (error) => {
    assert.deepEqual(startupProblems, [error.message]);
    return true;
  });
});
