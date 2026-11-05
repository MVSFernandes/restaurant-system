// Operações de pedido que mexem em estoque (cancelar, editar itens, excluir):
// no serviço, cada uma precisa ser uma única operação do banco. A prova
// transacional está em tests/order-cancel-sql.cjs e a de concorrência em
// tests/order-cancel-concurrency-pg.cjs.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://order-cancel.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';

const { supabase } = require('../src/lib/supabase');
const { orderService } = require('../src/services/order.service');
const { orderRepository } = require('../src/repositories/order.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { tableRepository } = require('../src/repositories/table.repository');
const { tableTabRepository } = require('../src/repositories/tableTab.repository');

const orderRow = (overrides = {}) => ({
  id: 'order-1', type: 'TAKE_AWAY', source: 'PDV', status: 'NEW', total: 10,
  delivery_fee: 0, customer_name: 'Ana', customer_id: null, table_id: null,
  table_tab_id: null, user_id: 'cashier-1', waiter_id: null,
  cash_register_session_id: 'session-1', delivery_type: null, delivery_street: null,
  delivery_number: null, delivery_neighborhood: null, delivery_reference: null,
  delivery_phone: null, delivery_notes: null, idempotency_key: null,
  created_at: '2026-11-04T12:00:00.000Z', updated_at: '2026-11-04T12:00:00.000Z',
  ...overrides,
});

const domainOrder = (overrides = {}) => ({
  id: 'order-1', type: 'TAKE_AWAY', source: 'PDV', status: 'NEW', total: 10,
  deliveryFee: 0, customerName: 'Ana', customerId: null, tableId: null,
  tableTabId: null, userId: 'cashier-1', waiterId: null,
  cashRegisterSessionId: 'session-1', deliveryType: null,
  createdAt: new Date(), updatedAt: new Date(),
  ...overrides,
});

let rpcCalls;
let stockOnHand;
let separateWrites;

beforeEach(() => {
  rpcCalls = [];
  separateWrites = [];
  stockOnHand = 10;
  orderRepository.findById = async () => domainOrder();
  orderRepository.findItems = async () => [{ id: 'item-1', productId: 'burger', quantity: 2, weight: null }];
  // Qualquer escrita fora da transação é registrada para o teste acusar.
  orderRepository.restoreStock = async () => {
    separateWrites.push('restoreStock');
    stockOnHand += 2;
  };
  orderRepository.update = async (id, patch) => {
    separateWrites.push(`update:${patch.status}`);
    return domainOrder({ id, ...patch });
  };
  paymentRepository.cancelPendingByOrder = async () => {
    separateWrites.push('cancelPendingByOrder');
  };
  orderRepository.hasActiveByTable = async () => false;
  tableTabRepository.hasOpenByTable = async () => false;
  tableRepository.update = async () => undefined;
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return {
      data: { order: orderRow({ id: args.p_order_id, status: 'CANCELED' }), already_canceled: false },
      error: null,
    };
  };
});

test('cancelling sends status change and stock return as one database operation', async () => {
  const canceled = await orderService.updateStatus('order-1', 'CANCELED', { id: 'cashier-1', role: 'CASHIER' });
  assert.equal(canceled.status, 'CANCELED');
  assert.deepEqual(separateWrites, [], 'nada pode ser estornado ou atualizado fora da transação');
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'cancel_order_with_stock');
  assert.equal(rpcCalls[0].args.p_order_id, 'order-1');
  assert.equal(rpcCalls[0].args.p_required_status, null);
  assert.equal(rpcCalls[0].args.p_required_waiter_id, null);
});

test('a failure while cancelling leaves stock and status untouched', async () => {
  orderRepository.update = async () => {
    separateWrites.push('update');
    throw new Error('connection reset while updating the order');
  };
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return { data: null, error: { code: '08006', message: 'connection reset' } };
  };
  await assert.rejects(orderService.updateStatus('order-1', 'CANCELED', { id: 'cashier-1', role: 'CASHIER' }));
  assert.equal(stockOnHand, 10, 'o estoque não pode voltar sem o pedido ter sido cancelado');
});

test('two simultaneous cancel requests never return stock from the application side', async () => {
  await Promise.all([
    orderService.updateStatus('order-1', 'CANCELED', { id: 'cashier-1', role: 'CASHIER' }),
    orderService.updateStatus('order-1', 'CANCELED', { id: 'admin-1', role: 'ADMIN' }),
  ]);
  assert.equal(stockOnHand, 10, 'o estorno é decidido pelo banco, sob lock do pedido');
  assert.ok(rpcCalls.every((call) => call.name === 'cancel_order_with_stock'));
});

test('cancelling an already canceled order is accepted without another stock return', async () => {
  orderRepository.findById = async () => domainOrder({ status: 'CANCELED' });
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return { data: { order: orderRow({ status: 'CANCELED' }), already_canceled: true }, error: null };
  };
  const result = await orderService.updateStatus('order-1', 'CANCELED', { id: 'cashier-1', role: 'CASHIER' });
  assert.equal(result.status, 'CANCELED');
  assert.equal(stockOnHand, 10);
  assert.deepEqual(separateWrites, []);
});

test('a canceled order still cannot be reopened', async () => {
  orderRepository.findById = async () => domainOrder({ status: 'CANCELED' });
  await assert.rejects(
    orderService.updateStatus('order-1', 'NEW', { id: 'admin-1', role: 'ADMIN' }),
    (error) => error.code === 'INVALID_TRANSITION' || error.status === 400 || error.status === 409
  );
  assert.equal(rpcCalls.length, 0);
});

test('a waiter cancels only their own NEW order, and the database rechecks both conditions', async () => {
  orderRepository.findById = async () => domainOrder({ waiterId: 'waiter-1', source: 'WAITER' });
  await orderService.updateStatus('order-1', 'CANCELED', { id: 'waiter-1', role: 'WAITER' });
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].args.p_required_status, 'NEW');
  assert.equal(rpcCalls[0].args.p_required_waiter_id, 'waiter-1');
});

test('a waiter cannot cancel someone else\'s order or an order already in preparation', async () => {
  orderRepository.findById = async () => domainOrder({ waiterId: 'waiter-2' });
  await assert.rejects(
    orderService.updateStatus('order-1', 'CANCELED', { id: 'waiter-1', role: 'WAITER' }),
    (error) => error.status === 403
  );
  orderRepository.findById = async () => domainOrder({ waiterId: 'waiter-1', status: 'IN_PROGRESS' });
  await assert.rejects(
    orderService.updateStatus('order-1', 'CANCELED', { id: 'waiter-1', role: 'WAITER' }),
    (error) => error.status === 400
  );
  assert.equal(rpcCalls.length, 0);
});

test('when the order changes between the check and the cancel, the request is refused with 409', async () => {
  orderRepository.findById = async () => domainOrder({ waiterId: 'waiter-1', source: 'WAITER' });
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return {
      data: null,
      error: { code: 'P0001', message: 'ORDER_CANCEL_PRECONDITION_FAILED', details: 'IN_PROGRESS' },
    };
  };
  await assert.rejects(
    orderService.updateStatus('order-1', 'CANCELED', { id: 'waiter-1', role: 'WAITER' }),
    (error) => error.status === 409 && error.code === 'ORDER_CANCEL_PRECONDITION_FAILED'
  );
});

test('other status changes keep using the regular update', async () => {
  const updated = await orderService.updateStatus('order-1', 'IN_PROGRESS', { id: 'cashier-1', role: 'CASHIER' });
  assert.equal(updated.status, 'IN_PROGRESS');
  assert.deepEqual(separateWrites, ['update:IN_PROGRESS']);
  assert.equal(rpcCalls.length, 0);
});

const legacyCancelRpc = (alreadyCanceled) => async (name, args) => {
  rpcCalls.push({ name, args });
  return {
    data: {
      order: orderRow({ status: 'CANCELED' }), already_canceled: alreadyCanceled,
      restored: [], stock_review_required: true,
    },
    error: null,
  };
};

test('cancelling an order created before the ledger returns the pending stock review', async () => {
  supabase.rpc = legacyCancelRpc(false);
  const result = await orderService.updateStatus('order-1', 'CANCELED', { id: 'cashier-1', role: 'CASHIER' });
  assert.equal(result.status, 'CANCELED');
  assert.equal(result.stockReviewRequired, true);
  assert.equal(result.id, 'order-1', 'o pedido continua na resposta, como antes');
  assert.deepEqual(separateWrites, []);
});

test('a repeated cancel keeps returning the pending stock review', async () => {
  orderRepository.findById = async () => domainOrder({ status: 'CANCELED' });
  supabase.rpc = legacyCancelRpc(true);
  const result = await orderService.updateStatus('order-1', 'CANCELED', { id: 'cashier-1', role: 'CASHIER' });
  assert.equal(result.stockReviewRequired, true);
});

test('a ledger order cancel reports no pending review', async () => {
  const result = await orderService.updateStatus('order-1', 'CANCELED', { id: 'cashier-1', role: 'CASHIER' });
  assert.equal(result.stockReviewRequired, false);
});

test('PATCH /api/orders/:id/status answers 200 with the order and stockReviewRequired', async () => {
  const jwt = require('jsonwebtoken');
  const app = require('../src/app').default;
  orderRepository.findItems = async () => [];
  supabase.rpc = legacyCancelRpc(false);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const call = () => fetch(`http://127.0.0.1:${server.address().port}/api/orders/order-1/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt.sign({ id: 'cashier-1', role: 'CASHIER' }, process.env.JWT_SECRET)}`,
      },
      body: JSON.stringify({ status: 'CANCELED' }),
    });
    const response = await call();
    assert.equal(response.status, 200, 'o cancelamento concluído não vira erro');
    const body = await response.json();
    assert.equal(body.id, 'order-1');
    assert.equal(body.status, 'CANCELED');
    assert.deepEqual(body.items, []);
    assert.equal(body.stockReviewRequired, true);

    orderRepository.findById = async () => domainOrder({ status: 'CANCELED' });
    supabase.rpc = legacyCancelRpc(true);
    const repeated = await (await call()).json();
    assert.equal(repeated.stockReviewRequired, true, 'repetido, o aviso continua');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ---------------------------------------------------------------------------
// Edição e exclusão
// ---------------------------------------------------------------------------

const { productRepository } = require('../src/repositories/product.repository');
const { categoryRepository } = require('../src/repositories/category.repository');

function stubCatalog() {
  productRepository.findById = async (id) => ({
    id, name: 'Hambúrguer', price: 20, categoryId: 'food', isByWeight: false, isPaused: false, pausedAt: null,
  });
  categoryRepository.findById = async () => ({ id: 'food', isMealCategory: false });
}

test('editing items is one database operation and the database rechecks the waiter', async () => {
  stubCatalog();
  orderRepository.findById = async () => domainOrder({ waiterId: 'waiter-1', source: 'WAITER' });
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return { data: orderRow({ total: 60 }), error: null };
  };
  const updated = await orderService.updateOrder(
    'order-1',
    { items: [{ productId: 'burger', quantity: 3 }], customerName: 'Bia' },
    { id: 'waiter-1', role: 'WAITER' }
  );
  assert.equal(updated.total, 60);
  assert.deepEqual(separateWrites, [], 'nada de devolver, apagar, inserir ou baixar fora da transação');
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'update_order_items_with_stock');
  assert.equal(rpcCalls[0].args.p_required_waiter_id, 'waiter-1');
  assert.equal(rpcCalls[0].args.p_items.length, 1);
  assert.equal(rpcCalls[0].args.p_items[0].order_id, 'order-1');
  assert.equal(rpcCalls[0].args.p_items[0].quantity, 3);
  assert.equal(rpcCalls[0].args.p_order_patch.total, 60);
  assert.equal(rpcCalls[0].args.p_order_patch.customer_name, 'Bia');
});

test('an edit refused by the database (order changed meanwhile) answers 409 and writes nothing else', async () => {
  stubCatalog();
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return { data: null, error: { code: 'P0001', message: 'ORDER_EDIT_PRECONDITION_FAILED', details: 'CANCELED' } };
  };
  await assert.rejects(
    orderService.updateOrder('order-1', { items: [{ productId: 'burger', quantity: 1 }] }, { id: 'admin-1', role: 'ADMIN' }),
    (error) => error.status === 409 && error.code === 'ORDER_EDIT_PRECONDITION_FAILED'
  );
  assert.deepEqual(separateWrites, []);
});

test('editing items of an order created before the ledger answers 409 (items locked)', async () => {
  stubCatalog();
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return { data: null, error: { code: 'P0001', message: 'LEGACY_ORDER_ITEMS_LOCKED' } };
  };
  await assert.rejects(
    orderService.updateOrder('order-1', { items: [{ productId: 'burger', quantity: 1 }] }, { id: 'admin-1', role: 'ADMIN' }),
    (error) => error.status === 409 && error.code === 'LEGACY_ORDER_ITEMS_LOCKED' && /Cancele o pedido/.test(error.message)
  );
});

test('deleting a legacy order with a pending review answers 409', async () => {
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return { data: null, error: { code: 'P0001', message: 'LEGACY_ORDER_STOCK_REVIEW_REQUIRED' } };
  };
  await assert.rejects(
    orderService.deleteOrder('order-1'),
    (error) => error.status === 409 && error.code === 'LEGACY_ORDER_STOCK_REVIEW_REQUIRED'
  );
});

test('deleting an order is one database operation', async () => {
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return { data: { order: orderRow(), restored: [] }, error: null };
  };
  await orderService.deleteOrder('order-1');
  assert.deepEqual(separateWrites, []);
  assert.deepEqual(rpcCalls.map((call) => call.name), ['delete_order_with_stock']);
  assert.equal(rpcCalls[0].args.p_order_id, 'order-1');
});
