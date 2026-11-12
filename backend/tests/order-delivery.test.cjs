// Confirmação explícita de entrega (orders.delivered_at), independente do
// pagamento. Repositórios e o cliente do banco são substituídos: aqui se
// prova o que o backend chama e devolve. O comportamento dentro do banco
// (primeiro horário, concorrência, cancelado, pagamento e estoque intactos)
// está em tests/order-delivery-sql.cjs e na validação em Supabase local.
const { test, beforeEach, afterEach, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const jwt = require('jsonwebtoken');
const { supabase } = require('../src/lib/supabase');
const { orderService } = require('../src/services/order.service');
const { orderRepository } = require('../src/repositories/order.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const { tableRepository } = require('../src/repositories/table.repository');
const { tableTabRepository } = require('../src/repositories/tableTab.repository');
const { productRepository } = require('../src/repositories/product.repository');
const { toOrderDomain, toOrderInsert, toOrderUpdate } = require('../src/mappers/order.mapper');
const app = require('../src/app').default;

const orderRow = (overrides = {}) => ({
  id: 'order-1', type: 'DELIVERY', source: 'PDV', status: 'READY', total: 30,
  delivery_fee: 5, customer_name: 'Cliente Fictício', customer_id: null, table_id: null,
  table_tab_id: null, user_id: 'user-cashier', waiter_id: null,
  cash_register_session_id: 'session-1', delivery_type: 'FIXED', delivery_street: 'Rua Fictícia',
  delivery_number: '10', delivery_neighborhood: null, delivery_reference: null,
  delivery_phone: null, delivery_notes: null, idempotency_key: null, promised_at: null,
  delivery_tracked: true,
  created_at: '2026-11-12T15:00:00.000Z', updated_at: '2026-11-12T15:00:00.000Z',
  ...overrides,
});

const token = (role, id = `user-${role.toLowerCase()}`) => jwt.sign({ id, role }, process.env.JWT_SECRET);

const stubbed = [
  [supabase, 'rpc'], [supabase, 'from'],
  [orderRepository, 'findById'], [orderRepository, 'update'], [orderRepository, 'findItems'],
  [orderRepository, 'findDetailedBySession'], [orderRepository, 'hasActiveByTable'],
  [orderRepository, 'restoreStock'],
  [paymentRepository, 'findByOrder'], [paymentRepository, 'findByOrderIds'],
  [paymentRepository, 'update'], [paymentRepository, 'create'], [paymentRepository, 'cancelPendingByOrder'],
  [cashRegisterRepository, 'findOpenSession'], [tableRepository, 'update'],
  [tableTabRepository, 'hasOpenByTable'], [productRepository, 'findById'],
];
const originals = stubbed.map(([target, key]) => [target, key, target[key]]);

let rpcCalls;
let writes;
let stored;

beforeEach(() => {
  rpcCalls = [];
  writes = [];
  stored = orderRow();
  orderRepository.findById = async () => toOrderDomain(stored);
  orderRepository.findItems = async () => [];
  orderRepository.hasActiveByTable = async () => false;
  // Qualquer escrita fora da função do banco fica registrada para o teste acusar.
  orderRepository.update = async (id, patch) => {
    writes.push(['order.update', patch]);
    return toOrderDomain({ ...stored, ...toOrderUpdate(patch) });
  };
  orderRepository.restoreStock = async () => { writes.push(['restoreStock']); };
  paymentRepository.findByOrder = async () => [];
  paymentRepository.update = async (id, patch) => { writes.push(['payment.update', patch]); return { id, ...patch }; };
  paymentRepository.create = async (payment) => { writes.push(['payment.create', payment]); return payment; };
  paymentRepository.cancelPendingByOrder = async () => { writes.push(['payment.cancelPending']); };
  tableRepository.update = async () => undefined;
  tableTabRepository.hasOpenByTable = async () => false;
  productRepository.findById = async () => null;
  supabase.from = () => { throw new Error('acesso direto ao banco não esperado neste teste'); };
  // Imita confirm_order_delivery (a regra real é provada no SQL).
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    if (name !== 'confirm_order_delivery') throw new Error(`rpc inesperada: ${name}`);
    if (stored.status === 'CANCELED') {
      return { data: null, error: { code: 'P0001', message: 'ORDER_DELIVERY_CANCELED' } };
    }
    const already = stored.status === 'DELIVERED' || (stored.status === 'FINISHED' && stored.delivered_at);
    if (!already && stored.status === 'FINISHED' && stored.delivery_tracked !== true) {
      return { data: null, error: { code: 'P0001', message: 'ORDER_DELIVERY_NOT_TRACKED' } };
    }
    if (!already) {
      stored = {
        ...stored,
        status: stored.status === 'FINISHED' ? 'FINISHED' : 'DELIVERED',
        delivered_at: stored.delivered_at ?? '2026-11-12T15:30:00.000Z',
      };
    }
    return { data: { order: stored, already_delivered: Boolean(already) }, error: null };
  };
});

afterEach(() => {
  for (const [target, key, original] of originals) target[key] = original;
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

const request = (method, path, role, body, userId) => fetch(`${baseUrl}${path}`, {
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(role ? { Authorization: `Bearer ${token(role, userId)}` } : {}),
  },
  body: body ? JSON.stringify(body) : undefined,
});
const confirm = (role, userId) => request('PATCH', '/orders/order-1/status', role, { status: 'DELIVERED' }, userId);

test('mapper: delivered_at becomes deliveredAt; null or missing (older order) stays null; never written by the app', () => {
  assert.equal(
    toOrderDomain(orderRow({ delivered_at: '2026-11-12T15:30:00.000Z' })).deliveredAt.toISOString(),
    '2026-11-12T15:30:00.000Z'
  );
  assert.equal(toOrderDomain(orderRow({ delivered_at: null })).deliveredAt, null);
  assert.equal(toOrderDomain(orderRow()).deliveredAt, null);
  const domain = { ...toOrderDomain(orderRow()), deliveredAt: new Date('2030-01-01T00:00:00Z') };
  assert.equal(Object.hasOwn(toOrderInsert(domain), 'delivered_at'), false);
  assert.equal(Object.hasOwn(toOrderUpdate(domain), 'delivered_at'), false);
});

test('mapper: delivery_tracked true stays true; NULL (older order) or missing becomes false; never written by the app', () => {
  assert.equal(toOrderDomain(orderRow({ delivery_tracked: true })).deliveryTracked, true);
  assert.equal(toOrderDomain(orderRow({ delivery_tracked: null })).deliveryTracked, false);
  const { delivery_tracked: _omit, ...withoutColumn } = orderRow();
  assert.equal(toOrderDomain(withoutColumn).deliveryTracked, false);
  const domain = { ...toOrderDomain(orderRow()), deliveryTracked: false };
  assert.equal(Object.hasOwn(toOrderInsert(domain), 'delivery_tracked'), false);
  assert.equal(Object.hasOwn(toOrderUpdate(domain), 'delivery_tracked'), false);
});

test('an older FINISHED order (not tracked) is refused with 409 and nothing is written', async () => {
  stored = orderRow({ status: 'FINISHED', delivery_tracked: null });
  const response = await confirm('ADMIN');
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /antes do registro de entregas/);
  assert.equal(stored.delivered_at, undefined);
  assert.deepEqual(writes, []);
});

test('an older READY order (not tracked) still goes through the normal "Marcar Entregue" path', async () => {
  stored = orderRow({ status: 'READY', delivery_tracked: null });
  const body = await (await confirm('CASHIER')).json();
  assert.equal(body.status, 'DELIVERED');
  assert.equal(body.deliveredAt, '2026-11-12T15:30:00.000Z');
});

test('delivered before payment: READY -> DELIVERED goes through one database call and leaves the payment alone', async () => {
  const response = await confirm('CASHIER');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'DELIVERED');
  assert.equal(body.deliveredAt, '2026-11-12T15:30:00.000Z');
  assert.deepEqual(rpcCalls, [{ name: 'confirm_order_delivery', args: { p_order_id: 'order-1' } }]);
  assert.deepEqual(writes, [], 'nem pedido, nem pagamento, nem estoque fora da função do banco');
});

test('paid before delivery: a FINISHED order is confirmed, stays FINISHED, payment untouched', async () => {
  stored = orderRow({ status: 'FINISHED' });
  const response = await confirm('ADMIN');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'FINISHED');
  assert.equal(body.deliveredAt, '2026-11-12T15:30:00.000Z');
  assert.deepEqual(writes, []);
});

test('repeating the confirmation keeps the first time', async () => {
  stored = orderRow({ status: 'FINISHED', delivered_at: '2026-11-12T15:10:00.000Z' });
  const body = await (await confirm('CASHIER')).json();
  assert.equal(body.deliveredAt, '2026-11-12T15:10:00.000Z');
  assert.equal(body.status, 'FINISHED');
});

test('a canceled order cannot be confirmed: refused before the database, and the database refuses a race too', async () => {
  stored = orderRow({ status: 'CANCELED' });
  const refused = await confirm('CASHIER');
  assert.equal(refused.status, 400);
  assert.equal(rpcCalls.length, 0);

  // Cancelado entre a leitura e a confirmação: o banco recusa sob o lock.
  orderRepository.findById = async () => toOrderDomain(orderRow({ status: 'READY' }));
  const raced = await confirm('CASHIER');
  assert.equal(raced.status, 409);
  assert.match((await raced.json()).message, /cancelado/i);
  assert.deepEqual(writes, []);
});

test('permissions are the existing ones: the waiter cannot confirm, the other roles can', async () => {
  const waiter = await confirm('WAITER', 'waiter-1');
  assert.equal(waiter.status, 403);
  assert.equal(rpcCalls.length, 0);

  const owner = await (async () => {
    stored = orderRow({ waiter_id: 'waiter-1' });
    return confirm('WAITER', 'waiter-1');
  })();
  assert.equal(owner.status, 403, 'nem o garçom dono do pedido confirma entrega');

  // Papéis aceitos pelo banco (users_role_check): ADMIN, CASHIER, WAITER, FINANCE.
  // A rota de status já aceitava qualquer papel autenticado além do garçom.
  for (const role of ['ADMIN', 'CASHIER', 'FINANCE']) {
    stored = orderRow();
    assert.equal((await confirm(role)).status, 200, role);
  }
  assert.equal((await request('PATCH', '/orders/order-1/status', undefined, { status: 'DELIVERED' })).status, 401);
});

test('paying never confirms the delivery', async () => {
  stored = orderRow({ status: 'READY' });
  await orderService.processPayment('order-1', 'PIX');
  assert.equal(rpcCalls.length, 0, 'confirm_order_delivery não é chamada pelo pagamento');
  const orderWrites = writes.filter(([kind]) => kind === 'order.update');
  assert.deepEqual(orderWrites.map(([, patch]) => patch), [{ status: 'FINISHED' }]);
  assert.equal(stored.delivered_at, undefined);
});

test('moving to other statuses does not touch delivered_at', async () => {
  for (const status of ['IN_PROGRESS', 'READY', 'FINISHED']) {
    writes = [];
    await orderService.updateStatus('order-1', status, { id: 'user-cashier', role: 'CASHIER' });
    assert.deepEqual(writes.filter(([kind]) => kind === 'order.update').map(([, patch]) => patch), [{ status }]);
  }
  assert.equal(rpcCalls.length, 0);
});

test('GET /orders keeps its shape and adds deliveredAt and deliveryTracked to each order', async () => {
  cashRegisterRepository.findOpenSession = async () => ({ id: 'session-1' });
  orderRepository.findDetailedBySession = async () => [
    { order: toOrderDomain(orderRow({ id: 'delivered', status: 'DELIVERED', delivered_at: '2026-11-12T15:30:00.000Z' })), items: [] },
    { order: toOrderDomain(orderRow({ id: 'paid-not-delivered', status: 'FINISHED', delivered_at: null })), items: [] },
    { order: toOrderDomain(orderRow({ id: 'older-order', status: 'FINISHED', delivery_tracked: null })), items: [] },
  ];
  paymentRepository.findByOrderIds = async () => [];
  const response = await request('GET', '/orders?status=DELIVERED,FINISHED', 'CASHIER');
  assert.equal(response.status, 200);
  const orders = await response.json();
  assert.ok(Array.isArray(orders));
  assert.deepEqual(orders.map((order) => [order.id, order.deliveredAt]), [
    ['delivered', '2026-11-12T15:30:00.000Z'],
    ['paid-not-delivered', null],
    ['older-order', null],
  ]);
  assert.deepEqual(orders.map((order) => order.deliveryTracked), [true, true, false]);
  for (const field of ['type', 'status', 'total', 'promisedAt', 'createdAt', 'updatedAt', 'items', 'payment']) {
    assert.ok(Object.hasOwn(orders[0], field), field);
  }
});
