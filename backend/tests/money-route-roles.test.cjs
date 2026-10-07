const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Segredo só deste teste: o token é assinado aqui e conferido pelo mesmo
// middleware que roda em produção. Nada vem do .env.
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const jwt = require('jsonwebtoken');
const { customerService } = require('../src/services/customer.service');
const { creditService } = require('../src/services/credit.service');
const { orderService } = require('../src/services/order.service');
const { orderRepository } = require('../src/repositories/order.repository');
const { cashRegisterService } = require('../src/services/cashRegister.service');
const app = require('../src/app').default;

const token = (role) => jwt.sign({ id: `user-${role.toLowerCase()}`, role }, process.env.JWT_SECRET);

// O dinheiro de verdade não se move: o teste é sobre quem passa pelo portão.
const stubs = [
  [customerService, 'create', async (input) => ({ id: 'customer-1', ...input })],
  [customerService, 'update', async (id, input) => ({ id, ...input })],
  [customerService, 'getTransactions', async () => []],
  [customerService, 'chargeCredit', async () => undefined],
  [customerService, 'payCredit', async () => undefined],
  [customerService, 'listAll', async () => [{ id: 'customer-1', name: 'Maria' }]],
  [creditService, 'listCustomerCredits', async () => []],
  [creditService, 'getCustomerCredit', async (id) => ({ id, creditUsed: 0 })],
  [orderService, 'processPayment', async (orderId) => ({ id: 'payment-1', orderId, status: 'PAID' })],
  [orderRepository, 'findById', async () => null],
  // Rotas que não mudaram: respondem sem ir ao banco.
  [orderService, 'createOrder', async () => ({ id: 'order-2', status: 'NEW' })],
  [orderService, 'createPublicOrder', async () => ({ id: 'order-3', status: 'NEW' })],
  [orderService, 'updateOrder', async (id) => ({ id, status: 'NEW' })],
  [orderRepository, 'findItems', async () => []],
  [cashRegisterService, 'getCurrentSession', async () => null],
];
const originals = stubs.map(([target, key]) => [target, key, target[key]]);

let server;
let baseUrl;

before(async () => {
  for (const [target, key, stub] of stubs) target[key] = stub;
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  for (const [target, key, original] of originals) target[key] = original;
  await new Promise((resolve) => server.close(resolve));
});

const call = (role, method, path, body) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(role)}` },
    body: body ? JSON.stringify(body) : undefined,
  });

const actions = {
  'listar clientes': ['GET', '/customers'],
  'ver fiado de todos': ['GET', '/customers/credit'],
  'ver fiado de um cliente': ['GET', '/customers/customer-1/credit'],
  'lançar fiado': ['POST', '/customers/customer-1/charge-credit', { amount: 70, description: 'Almoço' }],
  'dar baixa em fiado': ['POST', '/customers/customer-1/pay-credit', { amount: 20 }],
  'registrar pagamento de fiado': ['POST', '/customers/customer-1/payments', { amount: 20 }],
  'mudar limite de crédito': ['PUT', '/customers/customer-1', { name: 'Maria', creditLimit: 500 }],
  'criar cliente': ['POST', '/customers', { name: 'Maria' }],
  'registrar pagamento de pedido': ['POST', '/orders/order-1/payment', { method: 'CASH', amount: 45 }],
};

const expectStatus = async (role, action, status) => {
  const [method, path, body] = actions[action];
  const response = await call(role, method, path, body);
  assert.equal(response.status, status, `${role} ${action}: esperado ${status}, veio ${response.status}`);
  if (status === 403) {
    assert.deepEqual(await response.json(), { message: 'Acesso negado: permissão insuficiente' });
  }
};

// O garçom fica de fora de todo dinheiro.
for (const action of Object.keys(actions)) {
  test(`WAITER is refused: ${action}`, () => expectStatus('WAITER', action, 403));
}

// Fiado, leitura e escrita: ADMIN, FINANCE e CASHIER.
for (const role of ['ADMIN', 'FINANCE', 'CASHIER']) {
  for (const action of ['listar clientes', 'ver fiado de todos', 'ver fiado de um cliente', 'lançar fiado', 'dar baixa em fiado', 'registrar pagamento de fiado', 'mudar limite de crédito', 'criar cliente']) {
    test(`${role} is accepted: ${action}`, () => expectStatus(role, action, action === 'criar cliente' ? 201 : 200));
  }
}

// O que não pode quebrar: estas rotas não mudaram e continuam passando pelo
// portão para quem as usa. O que acontece depois (serviço, banco) é outro
// teste; aqui só importa que a permissão não as barre.
for (const [role, method, path, body] of [
  ['WAITER', 'POST', '/orders', { type: 'DINE_IN', items: [] }],
  ['WAITER', 'PATCH', '/orders/order-1', { items: [] }],
  ['WAITER', 'GET', '/cash-register/current'],
  [null, 'POST', '/orders/public', { items: [] }],
]) {
  test(`${role ?? 'cardápio público'} still passes the gate: ${method} /api${path}`, async () => {
    const response = role
      ? await call(role, method, path, body)
      : await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.ok(![401, 403].includes(response.status), `${method} ${path} barrado com ${response.status}`);
  });
}

// Pagamento de pedido: ADMIN e CASHIER. FINANCE fica de fora.
test('ADMIN is accepted: registrar pagamento de pedido', () => expectStatus('ADMIN', 'registrar pagamento de pedido', 200));
test('CASHIER is accepted: registrar pagamento de pedido', () => expectStatus('CASHIER', 'registrar pagamento de pedido', 200));
test('FINANCE is refused: registrar pagamento de pedido', () => expectStatus('FINANCE', 'registrar pagamento de pedido', 403));
