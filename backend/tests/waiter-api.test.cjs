const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_URL = 'https://waiter-api.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';

const { filterDetailedOrdersForList } = require('../src/controllers/order.controller');
const { PdfService } = require('../src/services/pdf.service');
const { toTableTabSummary } = require('../src/repositories/tableTab.repository');

const at = new Date('2026-09-30T12:00:00.000Z');
const detailedOrder = (id, waiterId, tableTabId, patch = {}) => ({
  order: {
    id,
    type: 'DINE_IN',
    source: 'WAITER',
    status: 'NEW',
    total: 10,
    deliveryFee: 0,
    customerName: null,
    customerId: null,
    tableId: 'table-1',
    tableTabId,
    userId: waiterId,
    waiterId,
    cashRegisterSessionId: 'session-1',
    deliveryType: null,
    deliveryStreet: null,
    deliveryNumber: null,
    deliveryNeighborhood: null,
    deliveryReference: null,
    deliveryPhone: null,
    deliveryNotes: null,
    createdAt: at,
    updatedAt: at,
    ...patch,
  },
  items: [],
});

test('tab summary exposes open balance, item count and last order timestamp', () => {
  const summary = toTableTabSummary({
    id: 'tab-1', table_id: 'table-1', cash_register_session_id: 'session-1',
    name: 'Ana', status: 'OPEN', opened_by_id: 'waiter-1', closed_by_id: null,
    opened_at: '2026-09-30T10:00:00.000Z', closed_at: null,
    updated_at: '2026-09-30T12:00:00.000Z',
    orders: [
      {
        id: 'order-a', status: 'DELIVERED', total: 20,
        created_at: '2026-09-30T10:15:00.000Z', updated_at: '2026-09-30T10:30:00.000Z',
        order_items: [{ id: 'a' }, { id: 'b' }],
        payments: [{ amount: 5, status: 'PAID' }],
      },
      {
        id: 'order-b', status: 'NEW', total: 15,
        created_at: '2026-09-30T11:45:00.000Z', updated_at: '2026-09-30T11:45:00.000Z',
        order_items: [{ id: 'c' }], payments: [],
      },
      {
        id: 'order-c', status: 'CANCELED', total: 99,
        created_at: '2026-09-30T11:50:00.000Z', updated_at: '2026-09-30T11:55:00.000Z',
        order_items: [{ id: 'd' }], payments: [],
      },
    ],
  });

  assert.equal(summary.total, 35);
  assert.equal(summary.paidTotal, 5);
  assert.equal(summary.balance, 30);
  assert.equal(summary.itemCount, 3);
  assert.equal(summary.orderCount, 3);
  assert.equal(summary.lastOrderAt.toISOString(), '2026-09-30T11:50:00.000Z');
  assert.deepEqual(summary.orders.map(order => order.itemCount), [2, 1, 1]);
});
test('waiter sees every order in a table or tab, while the unscoped list stays personal', () => {
  const orders = [
    detailedOrder('mine', 'waiter-1', 'tab-a'),
    detailedOrder('other', 'waiter-2', 'tab-b'),
    detailedOrder('another-table', 'waiter-2', 'tab-c', { tableId: 'table-2' }),
  ];
  const user = { id: 'waiter-1', role: 'WAITER' };

  assert.deepEqual(
    filterDetailedOrdersForList(orders, { tableId: 'table-1' }, user).map(row => row.order.id),
    ['mine', 'other']
  );
  assert.deepEqual(
    filterDetailedOrdersForList(orders, { tableTabId: 'tab-b' }, user).map(row => row.order.id),
    ['other']
  );
  assert.deepEqual(
    filterDetailedOrdersForList(orders, {}, user).map(row => row.order.id),
    ['mine']
  );
  assert.deepEqual(
    filterDetailedOrdersForList(orders, { tableId: 'table-1', myOrders: 'true' }, user)
      .map(row => row.order.id),
    ['mine']
  );
});

test('aggregated tab receipt contains all sends in one valid PDF', async () => {
  const tab = {
    id: 'tab-1',
    tableId: 'table-1',
    cashRegisterSessionId: 'session-1',
    name: 'Família Silva',
    status: 'OPEN',
    openedById: 'waiter-1',
    closedById: null,
    openedAt: at,
    closedAt: null,
    updatedAt: at,
    total: 25,
    paidTotal: 5,
    balance: 20,
    orderCount: 2,
    itemCount: 2,
    lastOrderAt: at,
    orders: [
      {
        id: 'order-a', status: 'DELIVERED', total: 10, createdAt: at, updatedAt: at, itemCount: 1,
        items: [{
          id: 'item-a', orderId: 'order-a', productId: 'product-a', productName: 'Suco',
          quantity: 1, weight: null, price: 10, unitPrice: 10, manualPrice: null,
          saleType: 'UNIT', notes: null,
        }],
      },
      {
        id: 'order-b', status: 'IN_PROGRESS', total: 15, createdAt: at, updatedAt: at, itemCount: 1,
        items: [{
          id: 'item-b', orderId: 'order-b', productId: 'product-b', productName: 'Prato',
          quantity: 1, weight: null, price: 15, unitPrice: 15, manualPrice: null,
          saleType: 'UNIT', notes: 'Sem cebola',
        }],
      },
    ],
  };

  const receipt = await PdfService.generateTableTabReceipt(
    tab,
    { id: 'table-1', number: 7, status: 'OCCUPIED' },
    { name: 'Restaurante', address: null, phone: null }
  );
  assert.equal(Buffer.isBuffer(receipt), true);
  assert.equal(receipt.subarray(0, 4).toString(), '%PDF');
  assert.ok(receipt.length > 1000);
});

test('waiter API routes are real endpoints with receipt ordered before tab detail', () => {
  const tablesRoute = fs.readFileSync(path.join(__dirname, '../src/routes/table.routes.ts'), 'utf8');
  const tabsRoute = fs.readFileSync(path.join(__dirname, '../src/routes/tableTab.routes.ts'), 'utf8');
  const ordersController = fs.readFileSync(path.join(__dirname, '../src/controllers/order.controller.ts'), 'utf8');
  assert.match(tablesRoute, /router\.get\('\/overview'/);
  assert.ok(tabsRoute.indexOf("router.get('/:tabId/receipt'") < tabsRoute.indexOf("router.get('/:tabId'"));
  assert.match(ordersController, /tableTabId/);
});
