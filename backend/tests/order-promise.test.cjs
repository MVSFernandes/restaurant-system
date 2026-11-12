// Prazo de pedidos, primeiro lote: configuração de minutos por tipo de pedido
// (PUT/GET /api/config) e orders.promised_at na criação e em GET /api/orders.
// Tudo roda com repositórios substituídos; o cálculo do prazo dentro do banco
// é coberto por tests/order-promise-sql.cjs.
const { test, afterEach, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const jwt = require('jsonwebtoken');
const { validatedOrderPromiseMinutes, ORDER_TYPES } = require('../src/utils/orderPromise');
const { configService } = require('../src/services/domain.services');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');
const { orderRepository } = require('../src/repositories/order.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { productRepository } = require('../src/repositories/product.repository');
const { categoryRepository } = require('../src/repositories/category.repository');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const {
  toRestaurantConfigDomain,
  toRestaurantConfigUpdate,
  toPublicRestaurantConfig,
  toOperationalRestaurantConfig,
} = require('../src/mappers/restaurantConfig.mapper');
const { toOrderDomain, toOrderInsert, toOrderUpdate } = require('../src/mappers/order.mapper');
const { supabase } = require('../src/lib/supabase');
const app = require('../src/app').default;

const PROMISE_COLUMNS = ['dine_in_promise_minutes', 'take_away_promise_minutes', 'delivery_promise_minutes'];

const originals = {
  configGet: restaurantConfigRepository.get,
  configGetOperational: restaurantConfigRepository.getOperational,
  configUpdate: restaurantConfigRepository.update,
  findOpenSession: cashRegisterRepository.findOpenSession,
  findDetailedBySession: orderRepository.findDetailedBySession,
  findByIdempotencyKey: orderRepository.findByIdempotencyKey,
  findItems: orderRepository.findItems,
  findByOrderIds: paymentRepository.findByOrderIds,
  productFindById: productRepository.findById,
  categoryFindById: categoryRepository.findById,
  from: supabase.from,
  rpc: supabase.rpc,
};
afterEach(() => {
  restaurantConfigRepository.get = originals.configGet;
  restaurantConfigRepository.getOperational = originals.configGetOperational;
  restaurantConfigRepository.update = originals.configUpdate;
  cashRegisterRepository.findOpenSession = originals.findOpenSession;
  orderRepository.findDetailedBySession = originals.findDetailedBySession;
  orderRepository.findByIdempotencyKey = originals.findByIdempotencyKey;
  orderRepository.findItems = originals.findItems;
  paymentRepository.findByOrderIds = originals.findByOrderIds;
  productRepository.findById = originals.productFindById;
  categoryRepository.findById = originals.categoryFindById;
  supabase.from = originals.from;
  supabase.rpc = originals.rpc;
});

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

test('the configurable types are exactly the order types of the application', () => {
  assert.deepEqual([...ORDER_TYPES], ['DINE_IN', 'TAKE_AWAY', 'DELIVERY']);
});

test('validator: omitted keeps, null clears every type, object changes only the sent types', () => {
  assert.equal(validatedOrderPromiseMinutes(undefined), undefined);
  assert.deepEqual(validatedOrderPromiseMinutes(null), { DINE_IN: null, TAKE_AWAY: null, DELIVERY: null });
  assert.deepEqual(validatedOrderPromiseMinutes({ DELIVERY: 45 }), { DELIVERY: 45 });
  assert.deepEqual(validatedOrderPromiseMinutes({ DINE_IN: 1, TAKE_AWAY: null }), { DINE_IN: 1, TAKE_AWAY: null });
  assert.deepEqual(validatedOrderPromiseMinutes({}), {});
  assert.deepEqual(validatedOrderPromiseMinutes({ DINE_IN: 2147483647 }), { DINE_IN: 2147483647 });
});

for (const [label, value, field] of [
  ['zero', { DELIVERY: 0 }, 'orderPromiseMinutes.DELIVERY'],
  ['negative', { TAKE_AWAY: -5 }, 'orderPromiseMinutes.TAKE_AWAY'],
  ['fraction', { DINE_IN: 12.5 }, 'orderPromiseMinutes.DINE_IN'],
  ['numeric text', { DELIVERY: '30' }, 'orderPromiseMinutes.DELIVERY'],
  ['boolean', { DELIVERY: true }, 'orderPromiseMinutes.DELIVERY'],
  ['NaN', { DELIVERY: Number.NaN }, 'orderPromiseMinutes.DELIVERY'],
  ['Infinity', { DELIVERY: Number.POSITIVE_INFINITY }, 'orderPromiseMinutes.DELIVERY'],
  ['above the integer column', { DELIVERY: 2147483648 }, 'orderPromiseMinutes.DELIVERY'],
  ['unknown order type', { BALCAO: 10 }, 'orderPromiseMinutes.BALCAO'],
  ['array', [10, 20, 30], 'orderPromiseMinutes'],
  ['plain number', 30, 'orderPromiseMinutes'],
  ['text', 'DELIVERY=30', 'orderPromiseMinutes'],
]) {
  test(`validator refuses ${label}`, () => {
    assert.throws(() => validatedOrderPromiseMinutes(value), (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.details.field, field);
      return true;
    });
  });
}

// ---------------------------------------------------------------------------
// configService.update e mapeamento
// ---------------------------------------------------------------------------

const savedConfig = (overrides = {}) => ({
  id: 'config-1',
  name: 'Restaurante Fictício',
  nfceGroupedItemDescription: 'REFEICAO',
  orderPromiseMinutes: { DINE_IN: null, TAKE_AWAY: 20, DELIVERY: 45 },
  ...overrides,
});

function captureUpdate() {
  const calls = [];
  restaurantConfigRepository.get = async () => savedConfig();
  restaurantConfigRepository.update = async (id, patch) => {
    calls.push({ id, patch, payload: toRestaurantConfigUpdate(patch) });
    return savedConfig();
  };
  return calls;
}

test('update without orderPromiseMinutes writes none of the promise columns', async () => {
  const calls = captureUpdate();
  await configService.update({ name: 'Outro nome' });
  for (const column of PROMISE_COLUMNS) assert.equal(Object.hasOwn(calls[0].payload, column), false, column);
});

test('update with orderPromiseMinutes null clears the three types', async () => {
  const calls = captureUpdate();
  await configService.update({ orderPromiseMinutes: null });
  for (const column of PROMISE_COLUMNS) assert.equal(calls[0].payload[column], null, column);
});

test('update with one type changes only that column', async () => {
  const calls = captureUpdate();
  await configService.update({ orderPromiseMinutes: { DELIVERY: 50 } });
  assert.equal(calls[0].payload.delivery_promise_minutes, 50);
  assert.equal(Object.hasOwn(calls[0].payload, 'dine_in_promise_minutes'), false);
  assert.equal(Object.hasOwn(calls[0].payload, 'take_away_promise_minutes'), false);
});

test('update with a full object maps every type to its column', async () => {
  const calls = captureUpdate();
  await configService.update({ orderPromiseMinutes: { DINE_IN: 15, TAKE_AWAY: null, DELIVERY: 40 } });
  assert.equal(calls[0].payload.dine_in_promise_minutes, 15);
  assert.equal(calls[0].payload.take_away_promise_minutes, null);
  assert.equal(calls[0].payload.delivery_promise_minutes, 40);
});

test('an invalid value is refused before reading or writing the database', async () => {
  restaurantConfigRepository.get = async () => assert.fail('valor recusado não pode ler o banco');
  restaurantConfigRepository.update = async () => assert.fail('valor recusado não pode gravar');
  await assert.rejects(configService.update({ orderPromiseMinutes: { DELIVERY: 0 } }), { status: 400 });
});

test('mapper: a row without the columns reads as every type without deadline (default)', () => {
  const domain = toRestaurantConfigDomain({ id: 'c', name: 'R', updated_at: '2026-11-12T00:00:00Z' });
  assert.deepEqual(domain.orderPromiseMinutes, { DINE_IN: null, TAKE_AWAY: null, DELIVERY: null });
  const configured = toRestaurantConfigDomain({
    id: 'c', name: 'R', updated_at: '2026-11-12T00:00:00Z',
    dine_in_promise_minutes: 25, take_away_promise_minutes: null, delivery_promise_minutes: 45,
  });
  assert.deepEqual(configured.orderPromiseMinutes, { DINE_IN: 25, TAKE_AWAY: null, DELIVERY: 45 });
});

test('the minutes are administrative: absent from the public and operational projections', async () => {
  const row = { name: 'R', dine_in_promise_minutes: 25, take_away_promise_minutes: 20, delivery_promise_minutes: 45 };
  assert.equal(Object.hasOwn(toPublicRestaurantConfig(row), 'orderPromiseMinutes'), false);
  assert.equal(Object.hasOwn(toOperationalRestaurantConfig(row), 'orderPromiseMinutes'), false);

  const selects = [];
  supabase.from = () => {
    const chain = {
      select(columns) { selects.push(columns.split(',')); return chain; },
      maybeSingle: async () => ({ data: { id: 'c', name: 'R', updated_at: '2026-11-12T00:00:00Z' }, error: null }),
    };
    return chain;
  };
  await restaurantConfigRepository.get();
  await restaurantConfigRepository.getOperational();
  await restaurantConfigRepository.getPublic();
  const [full, operational, publicColumns] = selects;
  for (const column of PROMISE_COLUMNS) {
    assert.ok(full.includes(column), column);
    assert.equal(operational.includes(column), false, column);
    assert.equal(publicColumns.includes(column), false, column);
  }
});

// ---------------------------------------------------------------------------
// Pedido: mapeamento
// ---------------------------------------------------------------------------

const orderRow = (overrides = {}) => ({
  id: 'order-1', type: 'DELIVERY', source: 'PDV', status: 'NEW', total: 30,
  delivery_fee: 5, customer_name: 'Cliente Fictício', customer_id: null,
  table_id: null, table_tab_id: null, user_id: 'user-cashier', waiter_id: null,
  cash_register_session_id: 'session-1', delivery_type: 'URBAN',
  delivery_street: null, delivery_number: null, delivery_neighborhood: null,
  delivery_reference: null, delivery_phone: null, delivery_notes: null,
  idempotency_key: null,
  created_at: '2026-11-12T15:00:00.000Z', updated_at: '2026-11-12T15:00:00.000Z',
  ...overrides,
});

test('order mapper: promised_at becomes promisedAt; null or missing (older order) stays null', () => {
  assert.equal(
    toOrderDomain(orderRow({ promised_at: '2026-11-12T15:45:00.000Z' })).promisedAt.toISOString(),
    '2026-11-12T15:45:00.000Z'
  );
  assert.equal(toOrderDomain(orderRow({ promised_at: null })).promisedAt, null);
  assert.equal(toOrderDomain(orderRow()).promisedAt, null);
});

test('order mapper never sends promised_at: the database fixes it at insertion and it does not change', () => {
  const domain = { ...toOrderDomain(orderRow()), promisedAt: new Date('2030-01-01T00:00:00Z') };
  assert.equal(Object.hasOwn(toOrderInsert(domain), 'promised_at'), false);
  assert.equal(Object.hasOwn(toOrderUpdate(domain), 'promised_at'), false);
});

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

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

const tokenFor = (role) => jwt.sign({ id: `user-${role.toLowerCase()}`, role }, process.env.JWT_SECRET);
const request = (method, path, role, body) => fetch(`${baseUrl}${path}`, {
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(role ? { Authorization: `Bearer ${tokenFor(role)}` } : {}),
  },
  body: body === undefined ? undefined : JSON.stringify(body),
});

test('HTTP: only ADMIN changes the minutes', async () => {
  restaurantConfigRepository.update = async () => assert.fail('não deve gravar');
  for (const role of ['CASHIER', 'WAITER', 'KITCHEN', 'DELIVERY', 'FINANCE']) {
    const response = await request('PUT', '/config', role, { orderPromiseMinutes: { DELIVERY: 30 } });
    assert.equal(response.status, 403, role);
  }
});

test('HTTP: invalid minutes answer 400 with the field message', async () => {
  restaurantConfigRepository.get = async () => assert.fail('não deve ler');
  const response = await request('PUT', '/config', 'ADMIN', { orderPromiseMinutes: { TAKE_AWAY: 7.5 } });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /inteiro maior que zero/);
});

test('HTTP: ADMIN saves, clears one type, then clears everything', async () => {
  const calls = captureUpdate();
  assert.equal((await request('PUT', '/config', 'ADMIN', { orderPromiseMinutes: { DINE_IN: 20, DELIVERY: 45 } })).status, 200);
  assert.equal((await request('PUT', '/config', 'ADMIN', { orderPromiseMinutes: { DELIVERY: null } })).status, 200);
  assert.equal((await request('PUT', '/config', 'ADMIN', { orderPromiseMinutes: null })).status, 200);
  assert.equal(calls[0].payload.dine_in_promise_minutes, 20);
  assert.equal(calls[0].payload.delivery_promise_minutes, 45);
  assert.deepEqual(
    PROMISE_COLUMNS.filter((column) => Object.hasOwn(calls[1].payload, column)),
    ['delivery_promise_minutes']
  );
  assert.equal(calls[1].payload.delivery_promise_minutes, null);
  for (const column of PROMISE_COLUMNS) assert.equal(calls[2].payload[column], null, column);
});

test('HTTP: GET /config shows the minutes to ADMIN only', async () => {
  restaurantConfigRepository.get = async () => savedConfig();
  restaurantConfigRepository.getOperational = async () => ({ name: 'Restaurante Fictício', nfceEnabled: false });
  const admin = await (await request('GET', '/config', 'ADMIN')).json();
  assert.deepEqual(admin.orderPromiseMinutes, { DINE_IN: null, TAKE_AWAY: 20, DELIVERY: 45 });
  const cashier = await (await request('GET', '/config', 'CASHIER')).json();
  assert.equal(Object.hasOwn(cashier, 'orderPromiseMinutes'), false);
});

function fakeOrderCreation(promisedAt) {
  const rpcCalls = [];
  orderRepository.findByIdempotencyKey = async () => null;
  orderRepository.findItems = async () => [];
  cashRegisterRepository.findOpenSession = async () => ({ id: 'session-1' });
  restaurantConfigRepository.get = async () => savedConfig({ deliveryFee: 5, enabledPayments: 'CASH,PIX' });
  productRepository.findById = async (id) => ({
    id, name: 'Refrigerante', price: 6, categoryId: 'drinks', isByWeight: false, isPaused: false, pausedAt: null,
  });
  categoryRepository.findById = async () => ({ id: 'drinks' });
  // Imita create_order_with_stock: devolve a linha com o prazo que o banco gravou.
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return {
      data: {
        ...args.p_order,
        created_at: '2026-11-12T15:00:00.000Z',
        updated_at: '2026-11-12T15:00:00.000Z',
        promised_at: promisedAt,
      },
      error: null,
    };
  };
  return rpcCalls;
}

test('PDV creation does not send a deadline (the database decides) and returns the stored one', async () => {
  const rpcCalls = fakeOrderCreation('2026-11-12T15:45:00.000Z');
  const response = await request('POST', '/orders', 'CASHIER', {
    type: 'TAKE_AWAY', customerName: 'Cliente Fictício', items: [{ productId: 'drink', quantity: 1 }],
  });
  assert.equal(response.status, 201);
  assert.equal(Object.hasOwn(rpcCalls[0].args.p_order, 'promised_at'), false);
  assert.equal((await response.json()).promisedAt, '2026-11-12T15:45:00.000Z');
});

test('public menu creation never announces the deadline to the customer', async () => {
  const rpcCalls = fakeOrderCreation('2026-11-12T15:45:00.000Z');
  const response = await request('POST', '/orders/public', undefined, {
    idempotencyKey: 'promise-public-1',
    customerName: 'Cliente Fictício',
    customerPhone: '11900000000',
    type: 'DELIVERY',
    paymentMethod: 'PIX',
    deliveryStreet: 'Rua Fictícia',
    deliveryNumber: '10',
    items: [{ productId: 'drink', quantity: 1 }],
  });
  assert.equal(response.status, 201);
  assert.equal(Object.hasOwn(rpcCalls[0].args.p_order, 'promised_at'), false);
  const body = await response.json();
  assert.equal(Object.hasOwn(body, 'promisedAt'), false);
  assert.equal(Object.hasOwn(body, 'deliveredAt'), false);
  assert.equal(Object.hasOwn(body, 'deliveryTracked'), false);
  assert.equal(body.type, 'DELIVERY');
  assert.ok(body.id);
});

test('the public checkout refuses a promisedAt sent by the customer', async () => {
  const rpcCalls = fakeOrderCreation(null);
  const response = await request('POST', '/orders/public', undefined, {
    customerName: 'Cliente Fictício', type: 'TAKE_AWAY', paymentMethod: 'PIX',
    promisedAt: '2030-01-01T00:00:00Z', items: [{ productId: 'drink', quantity: 1 }],
  });
  assert.equal(response.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test('GET /orders keeps its shape and adds promisedAt to each order', async () => {
  cashRegisterRepository.findOpenSession = async () => ({ id: 'session-1' });
  orderRepository.findDetailedBySession = async () => [
    { order: toOrderDomain(orderRow({ id: 'with-deadline', promised_at: '2026-11-12T15:45:00.000Z' })), items: [] },
    { order: toOrderDomain(orderRow({ id: 'no-deadline', type: 'DINE_IN', promised_at: null })), items: [] },
    { order: toOrderDomain(orderRow({ id: 'older-order' })), items: [] },
  ];
  paymentRepository.findByOrderIds = async () => [];
  const response = await request('GET', '/orders', 'CASHIER');
  assert.equal(response.status, 200);
  const orders = await response.json();
  assert.ok(Array.isArray(orders));
  assert.deepEqual(orders.map((order) => [order.id, order.promisedAt]), [
    ['with-deadline', '2026-11-12T15:45:00.000Z'],
    ['no-deadline', null],
    ['older-order', null],
  ]);
  for (const field of ['type', 'status', 'total', 'createdAt', 'updatedAt', 'items', 'payment', 'customerName']) {
    assert.ok(Object.hasOwn(orders[0], field), field);
  }
});
