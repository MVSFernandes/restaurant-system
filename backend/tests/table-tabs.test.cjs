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
  cashRegisterRepository.findOpenSession = async () => ({
    id: 'session-1', status: 'OPEN', openingAmount: 0, closingAmount: null,
    withdrawalTotal: 0, notes: null, openedById: 'user-1', closedById: null,
    openedAt: now, closedAt: null,
  });
  tableTabRepository.findOpenByName = async () => null;
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

test('service requires an occupied table and a unique non-empty open-tab name', async () => {
  tableRepository.findById = async () => ({ id: 'table-1', number: 1, status: 'AVAILABLE' });
  await assert.rejects(
    tableTabService.create('table-1', 'Ana', 'user-1'),
    (error) => error.code === 'VALIDATION_ERROR' && /mesa ocupada/.test(error.message)
  );

  tableRepository.findById = async () => ({ id: 'table-1', number: 1, status: 'OCCUPIED' });
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

test('service refuses a new order for a closed tab', async () => {
  tableTabRepository.findById = async () => openTab({ status: 'CLOSED', closedById: 'user-1', closedAt: now });
  await assert.rejects(
    orderService.createOrder({
      type: 'DINE_IN', tableId: 'table-1', tableTabId: 'tab-1', items: [],
    }, { id: 'user-1', role: 'CASHIER' }),
    (error) => error.code === 'VALIDATION_ERROR' && /precisa estar aberta/.test(error.message)
  );
});

test('table totals are derived from the open tabs returned by the repository', async () => {
  tableTabRepository.findByTable = async () => [
    { ...openTab({ id: 'tab-a' }), total: 20, paidTotal: 0, balance: 20, orderCount: 2, orders: [] },
    { ...openTab({ id: 'tab-b' }), total: 30, paidTotal: 0, balance: 30, orderCount: 1, orders: [] },
    { ...openTab({ id: 'tab-c', status: 'CLOSED' }), total: 99, paidTotal: 99, balance: 0, orderCount: 1, orders: [] },
  ];
  const result = await tableTabService.listForTable('table-1');
  assert.equal(result.total, 50);
  assert.deepEqual(result.tabs.slice(0, 2).map((tab) => tab.total), [20, 30]);
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
    type: 'TAKE_AWAY', customerName: 'Balcão', items: [{ productId: 'product' }],
  }, { id: 'user-1', role: 'CASHIER' });
  await orderService.createOrder({
    type: 'DELIVERY', customerName: 'Entrega', deliveryType: 'NONE', deliveryFee: 0,
    items: [{ productId: 'product' }],
  }, { id: 'user-1', role: 'CASHIER' });

  assert.deepEqual(captured.map((order) => [order.type, order.tableId, order.tableTabId]), [
    ['TAKE_AWAY', null, null],
    ['DELIVERY', null, null],
  ]);
});
