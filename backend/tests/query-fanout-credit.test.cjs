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

const customerRow = (id, name, transactions) => ({
  id,
  name,
  phone: null,
  email: null,
  address: null,
  credit_limit: 100,
  credit_used: 999,
  person_type: 'PF',
  document: null,
  legal_name: null,
  state_registration: null,
  fiscal_zip_code: null,
  fiscal_street: null,
  fiscal_number: null,
  fiscal_neighborhood: null,
  fiscal_city: null,
  fiscal_city_ibge_code: null,
  fiscal_state: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  credit_transactions: transactions,
});

const charge = (id, amount, orderId, createdAt, orderRelation) => ({
  id,
  customer_id: 'customer-debt',
  order_id: orderId,
  type: 'CHARGE',
  amount,
  description: null,
  status: 'OPEN',
  settled_amount: 0,
  settled_at: null,
  created_at: createdAt,
  orders: orderRelation,
  invoices: [],
});

test('GET /customers/credit uses one query and does not duplicate balances across orders', async () => {
  const originalFrom = supabase.from;
  let queries = 0;
  const firstOrder = {
    id: 'order-a', type: 'DINE_IN', table_id: 'table-1', customer_name: null,
    tables: { id: 'table-1', number: 7 },
    order_items: [{
      id: 'item-a', order_id: 'order-a', product_id: 'product-a', quantity: 1,
      price: 10.1, unit_price: 10.1, notes: null, products: { name: 'Café' },
    }],
  };
  const secondOrder = {
    id: 'order-b', type: 'TAKE_AWAY', table_id: null, customer_name: 'Cliente balcão',
    tables: null,
    order_items: [{
      id: 'item-b', order_id: 'order-b', product_id: 'deleted-product', quantity: 2,
      price: 20.15, unit_price: 10.075, notes: 'sem açúcar', products: null,
    }],
  };
  const rows = [
    customerRow('customer-debt', 'Ana', [
      charge('charge-old', 10.1, 'order-a', '2026-09-28T10:00:00.000Z', firstOrder),
      charge('charge-new', 20.15, 'order-b', '2026-09-29T10:00:00.000Z', secondOrder),
    ]),
    customerRow('customer-empty', 'Bruno', []),
  ];

  const builder = {
    select() { return this; },
    eq() { return this; },
    order() { return Promise.resolve({ data: rows, error: null }); },
  };

  try {
    supabase.from = (table) => {
      queries += 1;
      assert.equal(table, 'customers');
      return builder;
    };

    const res = response();
    await customerController.getCustomerCredits({ query: {} }, res);

    assert.equal(queries, 1);
    assert.equal(res.code, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].id, 'customer-debt');
    assert.equal(res.body[0].creditUsed, 30.25);
    assert.equal(res.body[0].openTotal, 30.25);
    assert.deepEqual(res.body[0].openRows.map((row) => row.id), ['charge-new', 'charge-old']);
    assert.deepEqual(res.body[0].openRows.map((row) => row.openAmount), [20.15, 10.1]);
    assert.equal(res.body[0].openRows[0].items[0].productName, 'Produto');
    assert.equal(res.body[0].openRows[1].desc, 'Pedido no fiado - Mesa 7');
    assert.equal(res.body[1].id, 'customer-empty');
    assert.equal(res.body[1].creditUsed, 0);
    assert.equal(res.body[1].openTotal, 0);
    assert.deepEqual(res.body[1].openRows, []);
    assert.deepEqual(res.body[1].paidRows, []);
  } finally {
    supabase.from = originalFrom;
  }
});
