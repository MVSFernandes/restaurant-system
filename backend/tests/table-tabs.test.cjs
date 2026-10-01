const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://table-tabs.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';

const { tableTabService } = require('../src/services/tableTab.service');
const { tableService } = require('../src/services/domain.services');
const { orderService } = require('../src/services/order.service');
const { cashRegisterService } = require('../src/services/cashRegister.service');
const { tableTabRepository } = require('../src/repositories/tableTab.repository');
const { tableRepository } = require('../src/repositories/table.repository');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const { productRepository } = require('../src/repositories/product.repository');
const { categoryRepository } = require('../src/repositories/category.repository');
const { orderRepository } = require('../src/repositories/order.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { invoiceRepository } = require('../src/repositories/invoice.repository');
const { userRepository } = require('../src/repositories/user.repository');
const { auditLogRepository } = require('../src/repositories/auditLog.repository');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');

const now = new Date('2026-09-29T12:00:00.000Z');
const openTab = (patch = {}) => ({
  id: 'tab-1', tableId: 'table-1', cashRegisterSessionId: 'session-1',
  name: 'Ana', status: 'OPEN', openedById: 'user-1', closedById: null,
  openedAt: now, closedAt: null, updatedAt: now, ...patch,
});

beforeEach(() => {
  tableRepository.findById = async () => ({ id: 'table-1', number: 1, status: 'OCCUPIED' });
  tableRepository.findAll = async () => [{ id: 'table-1', number: 1, status: 'OCCUPIED' }];
  cashRegisterRepository.findOpenSession = async () => ({
    id: 'session-1', status: 'OPEN', openingAmount: 0, closingAmount: null,
    withdrawalTotal: 0, notes: null, openedById: 'user-1', closedById: null,
    openedAt: now, closedAt: null,
  });
  tableTabRepository.findOpenByName = async () => null;
  tableTabRepository.findAllOpenSummaries = async () => [];
  tableTabRepository.openAtomic = async tab => tab;
  tableTabRepository.findById = async () => openTab();
  tableTabRepository.hasOpenByTable = async () => false;
  tableTabRepository.findOpenBySession = async () => [];
  orderRepository.findByIdempotencyKey = async () => null;
});

test('service refuses releasing a table while it has an open tab', async () => {
  tableTabRepository.hasOpenByTable = async () => true;
  let updateCalled = false;
  tableRepository.update = async () => { updateCalled = true; };

  await assert.rejects(
    tableService.updateStatus('table-1', 'AVAILABLE'),
    (error) => error.code === 'VALIDATION_ERROR' && /comanda aberta/.test(error.message)
  );
  assert.equal(updateCalled, false);
});

test('service opens the first tab on an available table through the atomic repository call', async () => {
  tableRepository.findById = async () => ({ id: 'table-1', number: 1, status: 'AVAILABLE' });
  let captured;
  tableTabRepository.openAtomic = async tab => {
    captured = tab;
    return tab;
  };

  const created = await tableTabService.create('table-1', ' Ana ', 'user-1');
  assert.equal(captured.name, 'Ana');
  assert.equal(captured.tableId, 'table-1');
  assert.equal(created.balance, 0);
  assert.equal(created.itemCount, 0);

  await assert.rejects(
    tableTabService.create('table-1', '   ', 'user-1'),
    (error) => error.code === 'VALIDATION_ERROR' && error.details.field === 'name'
  );

  tableTabRepository.findOpenByName = async () => openTab();
  await assert.rejects(
    tableTabService.create('table-1', 'ANA', 'user-1'),
    (error) => error.code === 'VALIDATION_ERROR' && /Já existe/.test(error.message)
  );
});
test('service requires a tab for a dine-in order', async () => {
  await assert.rejects(
    orderService.createOrder({
      type: 'DINE_IN', tableId: 'table-1', items: [],
    }, { id: 'user-1', role: 'CASHIER' }),
    (error) => error.code === 'VALIDATION_ERROR'
      && error.details.field === 'tableTabId'
      && /Selecione a comanda/.test(error.message)
  );
});

test('service refuses a tab from another table before creating the order', async () => {
  tableTabRepository.findById = async () => openTab({ tableId: 'table-2' });
  let createCalled = false;
  orderRepository.createWithStock = async () => { createCalled = true; };

  await assert.rejects(
    orderService.createOrder({
      type: 'DINE_IN', tableId: 'table-1', tableTabId: 'tab-1', items: [],
    }, { id: 'user-1', role: 'CASHIER' }),
    (error) => error.code === 'VALIDATION_ERROR' && /não pertence/.test(error.message)
  );
  assert.equal(createCalled, false);
});

test('service refuses a new order for a closed tab', async () => {
  tableTabRepository.findById = async () => openTab({ status: 'CLOSED', closedById: 'user-1', closedAt: now });
  await assert.rejects(
    orderService.createOrder({
      type: 'DINE_IN', tableId: 'table-1', tableTabId: 'tab-1', items: [],
    }, { id: 'user-1', role: 'CASHIER' }),
    (error) => error.code === 'VALIDATION_ERROR' && /conta já foi paga/.test(error.message)
  );
});

test('dine-in order uses the validated tab name and tab id', async () => {
  tableTabRepository.findById = async () => openTab({ name: '  Ana  ' });
  let captured;
  orderRepository.createWithStock = async (order) => {
    captured = order;
    return order;
  };

  await orderService.createOrder({
    type: 'DINE_IN', tableId: 'table-1', tableTabId: 'tab-1',
    customerName: 'Nome divergente', items: [],
  }, { id: 'user-1', role: 'CASHIER' });

  assert.equal(captured.customerName, 'Ana');
  assert.equal(captured.tableTabId, 'tab-1');
  assert.equal(captured.tableId, 'table-1');
});

test('table totals are derived from the open tabs returned by the repository', async () => {
  tableTabRepository.findByTable = async () => [
    { ...openTab({ id: 'tab-a' }), total: 20, paidTotal: 0, balance: 20, orderCount: 2, orders: [] },
    { ...openTab({ id: 'tab-b' }), total: 30, paidTotal: 0, balance: 30, orderCount: 1, orders: [] },
    { ...openTab({ id: 'tab-c', status: 'CLOSED' }), total: 99, paidTotal: 99, balance: 0, orderCount: 1, orders: [] },
  ];
  const result = await tableTabService.listForTable('table-1');
  assert.equal(result.total, 50);
  assert.equal(result.balance, 50);
  assert.deepEqual(result.tabs.slice(0, 2).map((tab) => tab.total), [20, 30]);
});

test('waiter table overview batches balance, tab count, age and ownership', async () => {
  tableRepository.findAll = async () => [
    { id: 'table-1', number: 1, status: 'OCCUPIED' },
    { id: 'table-2', number: 2, status: 'AVAILABLE' },
  ];
  tableTabRepository.findAllOpenSummaries = async () => [
    {
      ...openTab({ id: 'tab-a', openedAt: new Date('2026-09-29T11:15:00.000Z') }),
      total: 40, paidTotal: 10, balance: 30, orderCount: 2, itemCount: 3,
      lastOrderAt: new Date('2026-09-29T11:30:00.000Z'), orders: [],
    },
    {
      ...openTab({ id: 'tab-b', openedById: 'other', openedAt: new Date('2026-09-29T11:30:00.000Z') }),
      total: 20, paidTotal: 0, balance: 20, orderCount: 1, itemCount: 1,
      lastOrderAt: new Date('2026-09-29T11:35:00.000Z'), orders: [],
    },
  ];

  const overview = await tableTabService.listTableOverview('user-1', 'all', now);
  assert.deepEqual(
    overview.map(table => [
      table.number,
      table.openBalance,
      table.openTabCount,
      table.openForMinutes,
      table.hasCurrentWaiterTab,
    ]),
    [[1, 50, 2, 45, true], [2, 0, 0, null, false]]
  );
  assert.deepEqual(
    (await tableTabService.listTableOverview('user-1', 'mine', now)).map(table => table.id),
    ['table-1']
  );
  assert.deepEqual(
    (await tableTabService.listTableOverview('user-1', 'free', now)).map(table => table.id),
    ['table-2']
  );
});
test('service blocks cash close even when the open tab has no orders', async () => {
  tableTabRepository.findOpenBySession = async () => [openTab({ name: 'Vazia' })];
  let pendingOrdersRead = false;
  cashRegisterRepository.findPendingOrdersForClose = async () => {
    pendingOrdersRead = true;
    return [];
  };

  await assert.rejects(
    cashRegisterService.closeSession(0, null, 'user-1'),
    (error) => error.code === 'CASH_REGISTER_OPEN_TABS' && error.details.openTabs[0].name === 'Vazia'
  );
  assert.equal(pendingOrdersRead, false);
});

test('counter pickup and delivery orders remain tabless', async () => {
  productRepository.findById = async () => ({
    id: 'product', name: 'Produto', categoryId: 'category', price: 10, isByWeight: false,
  });
  categoryRepository.findById = async () => ({ id: 'category', isMealCategory: false });
  restaurantConfigRepository.get = async () => ({ enabledPayments: 'PIX', deliveryFee: 5 });
  userRepository.findAdminUser = async () => ({ id: 'admin' });
  let captured = [];
  orderRepository.createWithStock = async (order) => { captured.push(order); return order; };

  await orderService.createOrder({
    type: 'TAKE_AWAY', customerName: '  Balcão  ', items: [{ productId: 'product' }],
  }, { id: 'user-1', role: 'CASHIER' });
  await orderService.createOrder({
    type: 'DELIVERY', customerName: '  Entrega  ', deliveryType: 'NONE', deliveryFee: 0,
    items: [{ productId: 'product' }],
  }, { id: 'user-1', role: 'CASHIER' });

  assert.deepEqual(captured.map((order) => [order.type, order.tableId, order.tableTabId]), [
    ['TAKE_AWAY', null, null],
    ['DELIVERY', null, null],
  ]);
  assert.deepEqual(captured.map((order) => order.customerName), ['Balcão', 'Entrega']);
});
