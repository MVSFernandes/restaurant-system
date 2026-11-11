const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Segredo só deste teste: o token é assinado aqui e conferido pelo mesmo
// middleware que roda em produção. Nada vem do .env.
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const jwt = require('jsonwebtoken');
const { cashRegisterService } = require('../src/services/cashRegister.service');
const { stockService, supplierService } = require('../src/services/domain.services');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');
const app = require('../src/app').default;

const token = (role) => jwt.sign({ id: `user-${role.toLowerCase()}`, role }, process.env.JWT_SECRET);

// Resumo do turno como o serviço entrega: estado do caixa junto dos totais.
const openSession = {
  id: 'session-1',
  status: 'OPEN',
  openingAmount: 200,
  closingAmount: null,
  withdrawalTotal: 300,
  notes: 'Troco conferido',
  openedById: 'user-admin',
  closedById: null,
  openedAt: '2026-11-11T13:42:00.000Z',
  closedAt: null,
  openedBy: { id: 'user-admin', name: 'Marina Souza' },
  closedBy: null,
  totalEntries: 1240,
  totalWithdrawals: 300,
  expectedBalance: 1140,
  pixTotal: 1890.5,
  creditTotal: 830,
  debitTotal: 742,
  onAccountTotal: 160,
  totalRevenue: 4862.5,
  orderCount: 73,
  fiscalDocuments: {
    authorizedNfceCount: 61, authorizedNfceTotal: 4100, authorizedNfeCount: 1, authorizedNfeTotal: 380, pendingOrRejectedCount: 2,
  },
  withdrawals: [{ id: 'w-1', sessionId: 'session-1', amount: 300, reason: 'Sangria', createdBy: { id: 'user-admin', name: 'Marina Souza' } }],
};

const stockItem = {
  id: 'stock-1', name: 'Arroz agulhinha', quantity: 2, unit: 'kg', minQuantity: 10,
  createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-10T12:00:00.000Z',
};

const supplier = {
  id: 'supplier-1', name: 'Distribuidora Bom Grão', contact: 'Paulo', phone: '18999990000', email: 'vendas@bomgrao.example',
  createdAt: '2026-11-01T12:00:00.000Z', updatedAt: '2026-11-10T12:00:00.000Z',
};
const comparison = [{
  stockItemId: 'stock-1', stockItemName: 'Arroz agulhinha',
  supplierPrices: [{ supplierId: 'supplier-1', supplierName: 'Distribuidora Bom Grão', price: 21.9, isCheapest: true }],
}];

// O que cada projeção de restaurant_config entrega (ver config-access.test.cjs).
const operationalConfig = { name: 'Restaurante', logoUrl: 'logo.png', urbanDeliveryFee: 7, ruralDeliveryFee: 12, nfceEnabled: true };
const fullConfig = { ...operationalConfig, id: 'config-1', cnpj: '00000000000100', legalName: 'Razão Social', taxRegime: '4', defaultCfop: '5102' };

let currentSession = openSession;
const stubs = [
  [cashRegisterService, 'getCurrentSession', async () => currentSession],
  [stockService, 'findLowStock', async () => [{ id: 'stock-1', name: 'Arroz agulhinha' }]],
  [stockService, 'listAll', async () => [stockItem]],
  [stockService, 'findById', async (id) => ({ ...stockItem, id })],
  [supplierService, 'listAll', async () => [supplier]],
  [supplierService, 'getComparison', async () => comparison],
  [restaurantConfigRepository, 'getOperational', async () => operationalConfig],
  [restaurantConfigRepository, 'get', async () => fullConfig],
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

const get = (role, path) => fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token(role)}` } });

test('WAITER gets only the cash state from /cash-register/current', async () => {
  currentSession = openSession;
  const response = await get('WAITER', '/cash-register/current');
  assert.equal(response.status, 200);
  // Igualdade exata: qualquer campo a mais (inclusive um criado depois) reprova.
  assert.deepEqual(await response.json(), {
    id: 'session-1',
    status: 'OPEN',
    openedAt: '2026-11-11T13:42:00.000Z',
  });
});

test('WAITER response carries no revenue, drawer, payment, credit or fiscal figure', async () => {
  currentSession = openSession;
  const body = await (await get('WAITER', '/cash-register/current')).json();
  for (const field of [
    'openingAmount', 'closingAmount', 'withdrawalTotal', 'notes', 'totalEntries', 'totalWithdrawals', 'expectedBalance',
    'pixTotal', 'creditTotal', 'debitTotal', 'onAccountTotal', 'totalRevenue', 'orderCount', 'fiscalDocuments', 'withdrawals',
  ]) {
    assert.equal(field in body, false, `${field} não pode chegar ao garçom`);
  }
});

test('WAITER still learns that the cash register is closed', async () => {
  currentSession = null;
  const response = await get('WAITER', '/cash-register/current');
  assert.equal(response.status, 200);
  assert.equal(await response.json(), null);
});

for (const role of ['ADMIN', 'CASHIER', 'FINANCE']) {
  test(`${role} keeps the full shift summary from /cash-register/current`, async () => {
    currentSession = openSession;
    const response = await get(role, '/cash-register/current');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), openSession);
  });

  test(`${role} keeps /stock/low`, async () => {
    const response = await get(role, '/stock/low');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ id: 'stock-1', name: 'Arroz agulhinha' }]);
  });
}

// Insumos: quantidade em estoque e mínimo não chegam ao garçom por nenhuma rota.
for (const path of ['/stock/low', '/stock', '/stock/stock-1']) {
  test(`WAITER is refused on ${path}`, async () => {
    const response = await get('WAITER', path);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { message: 'Acesso negado: permissão insuficiente' });
  });
}

for (const role of ['ADMIN', 'CASHIER', 'FINANCE']) {
  test(`${role} keeps /stock and /stock/:id`, async () => {
    const list = await get(role, '/stock');
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), [stockItem]);
    const one = await get(role, '/stock/stock-1');
    assert.equal(one.status, 200);
    assert.deepEqual(await one.json(), stockItem);
  });
}

// Fornecedores: contatos e preços de compra não chegam ao garçom.
for (const path of ['/suppliers', '/suppliers/comparison']) {
  test(`WAITER is refused on ${path}`, async () => {
    const response = await get('WAITER', path);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { message: 'Acesso negado: permissão insuficiente' });
  });
}

for (const role of ['ADMIN', 'CASHIER', 'FINANCE']) {
  test(`${role} keeps /suppliers and /suppliers/comparison`, async () => {
    const list = await get(role, '/suppliers');
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), [supplier]);
    const compared = await get(role, '/suppliers/comparison');
    assert.equal(compared.status, 200);
    assert.deepEqual(await compared.json(), comparison);
  });
}

// /config não mudou: o garçom usa as taxas de entrega ao editar um pedido no
// Histórico e recebe só a projeção operacional, sem dado fiscal.
for (const role of ['WAITER', 'CASHIER', 'FINANCE']) {
  test(`${role} gets only the operational fields from /config`, async () => {
    const response = await get(role, '/config');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), operationalConfig);
  });
}

test('ADMIN keeps the full /config', async () => {
  const response = await get('ADMIN', '/config');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), fullConfig);
});

// Já era assim e continua: relatórios e contas a pagar não chegam ao garçom.
for (const path of ['/finance/reports?period=today', '/finance/payables', '/cash-register/history']) {
  test(`WAITER is refused on ${path}`, async () => {
    assert.equal((await get('WAITER', path)).status, 403);
  });
}
