const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Quem lançou o pedido vem do usuário autenticado, nunca do corpo da requisição.
// - userId: sempre o operador autenticado (ADMIN, CASHIER ou WAITER).
// - waiterId: só o próprio garçom, quando ele lança o pedido; no PDV fica null.
// - Cardápio público: nenhum operador interno.
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://operator.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';
process.env.FRONTEND_URL = 'http://localhost:5173';
delete process.env.APP_ENV;
delete process.env.FOCUS_NFE_ENABLED;

const jwt = require('jsonwebtoken');
const { supabase } = require('../src/lib/supabase');
const { orderService } = require('../src/services/order.service');
const { orderRepository } = require('../src/repositories/order.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { productRepository } = require('../src/repositories/product.repository');
const { categoryRepository } = require('../src/repositories/category.repository');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');
const { tableRepository } = require('../src/repositories/table.repository');
const { tableTabRepository } = require('../src/repositories/tableTab.repository');
const app = require('../src/app').default;

const forged = { userId: 'forged-user', waiterId: 'forged-waiter' };
const takeAway = {
  type: 'TAKE_AWAY',
  customerName: 'Cliente Teste',
  items: [{ productId: 'drink', quantity: 1 }],
};
const dineIn = {
  type: 'DINE_IN',
  tableId: 'table-1',
  tableTabId: 'tab-1',
  items: [{ productId: 'drink', quantity: 1 }],
};

let inserted;
const stubs = [
  [orderRepository, 'findByIdempotencyKey', async () => null],
  [cashRegisterRepository, 'findOpenSession', async () => ({ id: 'session-1' })],
  [restaurantConfigRepository, 'get', async () => ({ deliveryFee: 0, enabledPayments: 'PIX' })],
  [productRepository, 'findById', async () => ({
    id: 'drink', name: 'Refrigerante', price: 6, categoryId: 'drinks',
    isByWeight: false, isPaused: false, pausedAt: null,
  })],
  [categoryRepository, 'findById', async () => ({ id: 'drinks' })],
  [tableRepository, 'findById', async () => ({ id: 'table-1', number: 1, status: 'OCCUPIED' })],
  // Comanda aberta por um garçom: abrir a comanda não torna o PDV garçom do pedido.
  [tableTabRepository, 'findById', async () => ({
    id: 'tab-1', tableId: 'table-1', status: 'OPEN', name: 'Comanda',
    openedById: 'waiter-1', cashRegisterSessionId: 'session-1',
  })],
  [paymentRepository, 'findByOrderIds', async () => []],
  [orderRepository, 'findItems', async () => []],
  [supabase, 'rpc', async (name, args) => {
    assert.equal(name, 'create_order_with_stock');
    inserted.push(args.p_order);
    const now = new Date().toISOString();
    return { data: { ...args.p_order, created_at: now, updated_at: now }, error: null };
  }],
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

beforeEach(() => {
  inserted = [];
});

const tokenFor = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET);

const post = (path, body, token) =>
  fetch(`${baseUrl}/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

for (const role of ['ADMIN', 'CASHIER']) {
  test(`${role} on the PDV: forged userId and waiterId do not change who registered the order`, async () => {
    const response = await post('/orders', { ...takeAway, ...forged }, tokenFor(`${role.toLowerCase()}-1`, role));
    assert.equal(response.status, 201);
    const body = await response.json();

    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].user_id, `${role.toLowerCase()}-1`);
    assert.equal(inserted[0].waiter_id, null);
    assert.equal(inserted[0].source, 'PDV');
    assert.equal(body.userId, `${role.toLowerCase()}-1`);
    assert.equal(body.waiterId, null);
  });
}

test('PDV order on a tab opened by a waiter: the waiter link is not invented from the tab', async () => {
  const order = await orderService.createOrder(
    { ...dineIn, ...forged },
    { id: 'cashier-1', role: 'CASHIER' }
  );
  assert.equal(order.userId, 'cashier-1');
  assert.equal(order.waiterId, null);
  assert.equal(order.source, 'PDV');
});

test('waiter on the tab: the waiter is both the creator and the order waiter, whatever the body says', async () => {
  const response = await post('/orders', { ...dineIn, ...forged }, tokenFor('waiter-1', 'WAITER'));
  assert.equal(response.status, 201);

  assert.equal(inserted[0].user_id, 'waiter-1');
  assert.equal(inserted[0].waiter_id, 'waiter-1');
  assert.equal(inserted[0].source, 'WAITER');
});

test('public menu: no internal operator, and the internal fields are refused', async () => {
  const ok = await post('/orders/public', { ...takeAway, paymentMethod: 'PIX' });
  assert.equal(ok.status, 201);
  assert.equal(inserted[0].user_id, null);
  assert.equal(inserted[0].waiter_id, null);
  assert.equal(inserted[0].source, 'PUBLIC_MENU');

  for (const field of ['userId', 'waiterId']) {
    const refused = await post('/orders/public', { ...takeAway, paymentMethod: 'PIX', [field]: 'x' });
    assert.equal(refused.status, 400);
  }
  assert.equal(inserted.length, 1);
});

test('the authenticated list carries only the id and name of the creator and of the waiter', async () => {
  const original = orderRepository.findDetailedBySession;
  orderRepository.findDetailedBySession = async () => [
    {
      order: { id: 'o-pdv', status: 'NEW', userId: 'cashier-1', waiterId: null },
      items: [],
      user: { id: 'cashier-1', name: 'Caixa Teste' },
      waiter: null,
    },
    {
      order: { id: 'o-waiter', status: 'NEW', userId: 'waiter-1', waiterId: 'waiter-1' },
      items: [],
      user: { id: 'waiter-1', name: 'Garçom Teste' },
      waiter: { id: 'waiter-1', name: 'Garçom Teste' },
    },
    {
      order: { id: 'o-public', status: 'NEW', userId: null, waiterId: null },
      items: [],
      user: null,
      waiter: null,
    },
  ];
  try {
    const response = await fetch(`${baseUrl}/api/orders`, {
      headers: { Authorization: `Bearer ${tokenFor('cashier-1', 'CASHIER')}` },
    });
    assert.equal(response.status, 200);
    const [pdv, waiter, publicOrder] = await response.json();
    assert.deepEqual(pdv.user, { id: 'cashier-1', name: 'Caixa Teste' });
    assert.equal(pdv.waiter, null);
    assert.deepEqual(waiter.waiter, { id: 'waiter-1', name: 'Garçom Teste' });
    assert.equal(publicOrder.user, null);
    assert.equal(publicOrder.waiter, null);
  } finally {
    orderRepository.findDetailedBySession = original;
  }
});

test('the list query selects only id and name from users, through the existing relations', async () => {
  const originalFrom = supabase.from;
  let selected;
  const chain = {
    select(columns) { selected = columns; return chain; },
    eq() { return chain; },
    order: async () => ({
      data: [{
        id: 'o-1', type: 'TAKE_AWAY', status: 'NEW', user_id: 'cashier-1', waiter_id: null,
        order_items: [],
        user: { id: 'cashier-1', name: 'Caixa Teste', email: 'nao@deve.vazar' },
        waiter: null,
      }],
      error: null,
    }),
  };
  supabase.from = () => chain;
  try {
    const [row] = await orderRepository.findDetailedBySession('session-1');
    assert.match(selected, /waiter:users!orders_waiter_fkey\(id,name\)/);
    assert.match(selected, /user:users!orders_user_fkey\(id,name\)/);
    assert.doesNotMatch(selected, /email/);
    assert.deepEqual(row.user, { id: 'cashier-1', name: 'Caixa Teste' });
    assert.equal(row.waiter, null);
  } finally {
    supabase.from = originalFrom;
  }
});
