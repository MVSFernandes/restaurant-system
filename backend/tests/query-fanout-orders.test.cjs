const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://query-fanout.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const { supabase } = require('../src/lib/supabase');
const { tableService } = require('../src/services/domain.services');
const { orderRepository } = require('../src/repositories/order.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const tableController = require('../src/controllers/table.controller');
const orderController = require('../src/controllers/order.controller');
const customerController = require('../src/controllers/customer.controller');

const response = () => ({
  code: 200,
  body: undefined,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
  setHeader() { return this; },
});

const order = (id, status, tableId = null) => ({
  id,
  type: 'DINE_IN',
  source: 'PDV',
  status,
  total: 12.5,
  deliveryFee: 0,
  customerName: null,
  customerId: null,
  tableId,
  userId: 'operator',
  waiterId: null,
  cashRegisterSessionId: 'session-1',
  deliveryType: null,
  deliveryStreet: null,
  deliveryNumber: null,
  deliveryNeighborhood: null,
  deliveryReference: null,
  deliveryPhone: null,
  deliveryNotes: null,
  createdAt: new Date('2026-09-29T12:00:00.000Z'),
  updatedAt: new Date('2026-09-29T12:00:00.000Z'),
});

test('GET /orders uses three queries and preserves orders without items or current products', async () => {
  const originals = {
    findOpenSession: cashRegisterRepository.findOpenSession,
    findDetailedBySession: orderRepository.findDetailedBySession,
    findByOrderIds: paymentRepository.findByOrderIds,
  };
  let queries = 0;
  const deletedProductItem = {
    id: 'item-1',
    orderId: 'order-1',
    productId: 'deleted-product',
    productName: 'Produto gravado',
    quantity: 1,
    weight: null,
    price: 12.5,
    unitPrice: 12.5,
    manualPrice: null,
    saleType: null,
    notes: null,
    product: null,
  };
  const payment = {
    id: 'payment-1',
    orderId: 'order-1',
    method: 'PIX',
    amount: 12.5,
    status: 'PENDING',
    transactionId: null,
    createdAt: new Date('2026-09-29T12:01:00.000Z'),
  };
  try {
    cashRegisterRepository.findOpenSession = async () => {
      queries += 1;
      return { id: 'session-1' };
    };
    orderRepository.findDetailedBySession = async (sessionId) => {
      queries += 1;
      assert.equal(sessionId, 'session-1');
      return [
        { order: order('order-1', 'NEW', 'table-1'), items: [deletedProductItem] },
        { order: order('order-2', 'READY', 'table-2'), items: [] },
      ];
    };
    paymentRepository.findByOrderIds = async (orderIds) => {
      queries += 1;
      assert.deepEqual(orderIds, ['order-1', 'order-2']);
      return [payment];
    };

    const res = response();
    await orderController.getOrders(
      { query: {}, user: { id: 'operator', role: 'ADMIN' } },
      res
    );

    assert.equal(queries, 3);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, [
      { ...order('order-1', 'NEW', 'table-1'), items: [deletedProductItem], payment },
      { ...order('order-2', 'READY', 'table-2'), items: [], payment: null },
    ]);
  } finally {
    cashRegisterRepository.findOpenSession = originals.findOpenSession;
    orderRepository.findDetailedBySession = originals.findDetailedBySession;
    paymentRepository.findByOrderIds = originals.findByOrderIds;
  }
});
