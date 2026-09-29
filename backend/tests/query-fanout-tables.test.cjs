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

test('GET /tables uses two queries and preserves empty tables and legacy status ordering', async () => {
  const originals = {
    listAll: tableService.listAll,
    findByStatuses: orderRepository.findByStatuses,
  };
  let queries = 0;
  try {
    tableService.listAll = async () => {
      queries += 1;
      return [
        { id: 'table-1', number: 1, status: 'OCCUPIED' },
        { id: 'table-2', number: 2, status: 'AVAILABLE' },
      ];
    };
    orderRepository.findByStatuses = async (statuses) => {
      queries += 1;
      assert.deepEqual(statuses, ['NEW', 'IN_PROGRESS', 'READY', 'DELIVERED']);
      return [order('ready', 'READY', 'table-1'), order('new', 'NEW', 'table-1')];
    };

    const res = response();
    await tableController.getTables({ query: {} }, res);

    assert.equal(queries, 2);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, [
      {
        id: 'table-1',
        number: 1,
        status: 'OCCUPIED',
        orders: [order('new', 'NEW', 'table-1'), order('ready', 'READY', 'table-1')],
      },
      { id: 'table-2', number: 2, status: 'AVAILABLE', orders: [] },
    ]);
  } finally {
    tableService.listAll = originals.listAll;
    orderRepository.findByStatuses = originals.findByStatuses;
  }
});
