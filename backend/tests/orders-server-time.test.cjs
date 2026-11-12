const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// GET /orders informa o horário do servidor no cabeçalho X-Server-Time, sem
// mudar o corpo. A tela de Pedidos usa esse horário para classificar atrasos.
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://server-time.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';
process.env.FRONTEND_URL = 'http://localhost:5173';
delete process.env.APP_ENV;
delete process.env.FOCUS_NFE_ENABLED;

const jwt = require('jsonwebtoken');
const { orderRepository } = require('../src/repositories/order.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const app = require('../src/app').default;

const promisedOrder = {
  id: 'order-1',
  type: 'DELIVERY',
  source: 'PDV',
  status: 'FINISHED',
  total: 30,
  promisedAt: '2026-11-12T15:30:00.000Z',
  deliveredAt: null,
  deliveryTracked: true,
  cashRegisterSessionId: 'session-1',
  waiterId: null,
  tableId: null,
  tableTabId: null,
  createdAt: '2026-11-12T15:00:00.000Z',
};

let session = null;
const stubs = [
  [cashRegisterRepository, 'findOpenSession', async () => session],
  [orderRepository, 'findDetailedBySession', async () => [{ order: promisedOrder, items: [] }]],
  [paymentRepository, 'findByOrderIds', async () => []],
];
const originals = stubs.map(([target, key]) => [target, key, target[key]]);

let server;
let baseUrl;

before(async () => {
  for (const [target, key, stub] of stubs) target[key] = stub;
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const [target, key, original] of originals) target[key] = original;
  await new Promise((resolve) => server.close(resolve));
});

const getOrders = () =>
  fetch(`${baseUrl}/api/orders?status=NEW,IN_PROGRESS,READY,DELIVERED,FINISHED,CANCELED`, {
    headers: {
      Authorization: `Bearer ${jwt.sign({ id: 'cashier-1', role: 'CASHIER' }, process.env.JWT_SECRET)}`,
      Origin: 'http://localhost:5173',
    },
  });

const assertServerTime = (response, before, after) => {
  const header = response.headers.get('x-server-time');
  assert.match(header, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const value = Date.parse(header);
  assert.ok(value >= before && value <= after, `${header} fora da janela da requisição`);
};

test('with an open session: the header is the server time and the body keeps its format', async () => {
  session = { id: 'session-1' };
  const before = Date.now();
  const response = await getOrders();
  const after = Date.now();

  assert.equal(response.status, 200);
  assertServerTime(response, before, after);
  assert.deepEqual(await response.json(), [
    { ...promisedOrder, items: [], waiter: null, user: null, payment: null },
  ]);
});

test('without an open session: still an empty array, with the header', async () => {
  session = null;
  const before = Date.now();
  const response = await getOrders();
  const after = Date.now();

  assert.equal(response.status, 200);
  assertServerTime(response, before, after);
  assert.deepEqual(await response.json(), []);
});

test('a browser on another origin (development) is allowed to read the header', async () => {
  session = null;
  const response = await getOrders();
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const exposed = response.headers.get('access-control-expose-headers').split(',').map((h) => h.trim().toLowerCase());
  assert.ok(exposed.includes('x-server-time'));
  // Os cabeçalhos que já estavam expostos continuam.
  for (const name of ['retry-after', 'ratelimit-reset', 'x-ratelimit-scope']) assert.ok(exposed.includes(name));
});
