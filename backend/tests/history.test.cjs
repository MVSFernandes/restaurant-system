const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://history.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';

const { supabase } = require('../src/lib/supabase');
const { orderHistoryRepository } = require('../src/repositories/orderHistory.repository');

const originalFrom = supabase.from.bind(supabase);
afterEach(() => { supabase.from = originalFrom; });

const canceledRow = {
  id: 'order-canceled-ABC123', type: 'DELIVERY', source: 'PUBLIC_MENU', status: 'CANCELED',
  total: 17.75, delivery_fee: 4.5, customer_name: 'Maria', customer_id: null, table_id: null,
  user_id: 'cashier', waiter_id: null, cash_register_session_id: 'session-1', delivery_type: 'URBAN',
  delivery_street: 'Rua A', delivery_number: '10', delivery_neighborhood: 'Centro',
  delivery_reference: null, delivery_phone: '11999999999', delivery_notes: null,
  created_at: '2026-09-22T12:00:00.000Z', updated_at: '2026-09-22T12:05:00.000Z',
  order_items: [{ id: 'item-1', order_id: 'order-canceled-ABC123', product_id: 'product-1', product_name: 'Prato vendido', quantity: 1, weight: null, price: 13.25, unit_price: 13.25, sale_type: 'UNIT', notes: null }],
  payments: { id: 'payment-1', order_id: 'order-canceled-ABC123', method: 'PIX', amount: 17.75, status: 'CANCELED', transaction_id: null, created_at: '2026-09-22T12:00:00.000Z' },
  tables: null, waiter: null, user: { id: 'cashier', name: 'Ana' }, invoices: [],
};

function fakeQuery(rows = [canceledRow], count = rows.length) {
  const calls = [];
  const builder = {
    select: (...args) => { calls.push(['select', ...args]); return builder; },
    in: (...args) => { calls.push(['in', ...args]); return builder; },
    eq: (...args) => { calls.push(['eq', ...args]); return builder; },
    gte: (...args) => { calls.push(['gte', ...args]); return builder; },
    lte: (...args) => { calls.push(['lte', ...args]); return builder; },
    ilike: (...args) => { calls.push(['ilike', ...args]); return builder; },
    is: (...args) => { calls.push(['is', ...args]); return builder; },
    order: (...args) => { calls.push(['order', ...args]); return builder; },
    range: (...args) => { calls.push(['range', ...args]); return Promise.resolve({ data: rows, error: null, count }); },
  };
  supabase.from = (table) => { calls.push(['from', table]); return builder; };
  return calls;
}

test('history keeps canceled orders and applies combined filters before pagination', async () => {
  const calls = fakeQuery();
  const result = await orderHistoryRepository.search({
    page: 2, pageSize: 20, startDate: '2026-09-01', endDate: '2026-09-30',
    customerName: 'Maria', code: '#ABC123', type: 'DELIVERY', paymentMethod: 'PIX',
    paymentStatus: 'CANCELED', orderStatus: 'CANCELED', source: 'PUBLIC_MENU',
    fiscalStatus: 'WITHOUT', sessionId: 'session-1',
  });

  assert.equal(result.total, 1);
  assert.equal(result.data[0].status, 'CANCELED');
  assert.equal(result.data[0].items[0].productName, 'Prato vendido');
  assert.equal(result.data[0].payment.status, 'CANCELED');
  assert.ok(calls.some(([method, column, value]) => method === 'ilike' && column === 'id' && value === '%ABC123%'));
  assert.ok(calls.some(([method, column, value]) => method === 'eq' && column === 'source' && value === 'PUBLIC_MENU'));
  assert.ok(calls.some(([method, column, value]) => method === 'eq' && column === 'payments.status' && value === 'CANCELED'));
  assert.ok(calls.some(([method, column, value]) => method === 'eq' && column === 'cash_register_session_id' && value === 'session-1'));
  assert.ok(calls.some(([method, column, value]) => method === 'is' && column === 'invoices' && value === null));
  assert.deepEqual(calls.find(([method]) => method === 'range').slice(1), [20, 39]);
});

test('fiscal filters use server-side invoice joins', async () => {
  const authorizedCalls = fakeQuery([], 0);
  await orderHistoryRepository.search({ page: 1, pageSize: 10, fiscalStatus: 'AUTHORIZED' });
  assert.ok(authorizedCalls.some(([method, column, value]) => method === 'eq' && column === 'invoices.status' && value === 'authorized'));

  const rejectedCalls = fakeQuery([], 0);
  await orderHistoryRepository.search({ page: 1, pageSize: 10, fiscalStatus: 'REJECTED' });
  assert.ok(rejectedCalls.some(([method, column, values]) => method === 'in' && column === 'invoices.status' && values.includes('error')));
});
