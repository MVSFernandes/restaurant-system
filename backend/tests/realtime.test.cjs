const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Test-only values prevent accidental use of backend/.env credentials.
process.env.SUPABASE_URL = 'https://realtime.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';
const { supabase } = require('../src/lib/supabase');
const { stockItemRepository } = require('../src/repositories/stockItem.repository');
const { stockService } = require('../src/services/domain.services');
const { orderService } = require('../src/services/order.service');
const { orderRepository } = require('../src/repositories/order.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const stockController = require('../src/controllers/stock.controller');
const orderController = require('../src/controllers/order.controller');

const calls = [];
const orderCalls = [];
let send = async () => ({ success: true });
const channelCreations = new Map();
supabase.channel = (topic) => {
  channelCreations.set(topic, (channelCreations.get(topic) ?? 0) + 1);
  return {
    httpSend: (...args) => {
      (topic === 'order-events' ? orderCalls : calls).push(args);
      return send(...args);
    },
  };
};

const { publishStockUpdated, publishStockLow, publishOrderChanged } = require('../src/lib/realtime');
const { ORDER_EVENTS } = require('../src/constants/realtime');
const { notifyStockChanged } = require('../src/services/stockRealtime.service');
const item = { id: 'rice', name: 'Arroz', quantity: 1, minQuantity: 10, unit: 'kg' };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const response = () => ({
  code: 200, body: undefined, headers: {},
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
  setHeader(name, value) { this.headers[name] = value; return this; },
  send() { return this; },
});

beforeEach(() => {
  calls.length = 0;
  orderCalls.length = 0;
  send = async () => ({ success: true });
  stockItemRepository.findLowStock = async () => [item];
});


test('publishes HTTP-only events with IDs and reuses one channel', async () => {
  await publishStockUpdated();
  await publishStockLow([{ ...item, supplier: 'private', customerPhone: 'private' }]);
  assert.equal(channelCreations.get('stock-events'), 1);
  assert.deepEqual(calls, [
    ['stock_updated', {}, { timeout: 3000 }],
    ['stock_low', { items: [{ id: 'rice' }] }, { timeout: 3000 }],
  ]);
});

test('publishes order invalidations without exposing order details', async () => {
  await publishOrderChanged(ORDER_EVENTS.created, {
    orderId: 'order-1',
    source: 'PUBLIC_MENU',
  });
  await publishOrderChanged(ORDER_EVENTS.updated, { orderId: 'order-1' });
  assert.equal(channelCreations.get('order-events'), 1);
  assert.deepEqual(orderCalls, [
    ['order_created', { orderId: 'order-1', source: 'PUBLIC_MENU' }, { timeout: 3000 }],
    ['order_updated', { orderId: 'order-1' }, { timeout: 3000 }],
  ]);
});

test('publishes an empty low-stock snapshot after replenishment', async () => {
  stockItemRepository.findLowStock = async () => [];
  await notifyStockChanged();
  assert.deepEqual(calls.find(([event]) => event === 'stock_low')[1], { items: [] });
});

test('broadcast rejection and a failed low-stock query do not reject mutations', async () => {
  send = async () => { throw new Error('Realtime offline'); };
  stockItemRepository.findLowStock = async () => { throw new Error('Query offline'); };
  await assert.doesNotReject(notifyStockChanged());
  assert.equal(calls[0][0], 'stock_updated');
});

test('stock create, update and delete notify after saving without waiting on Broadcast', async () => {
  send = () => new Promise(() => {});
  stockService.create = async () => item;
  stockService.update = async () => item;
  stockService.delete = async () => {};
  const request = { body: item, params: { id: item.id } };
  for (const [handler, expected] of [
    [stockController.createStockItem, 201],
    [stockController.updateStockItem, 200],
    [stockController.deleteStockItem, 204],
  ]) {
    const res = response();
    await handler(request, res);
    assert.equal(res.code, expected);
  }
  await tick();
  assert.equal(calls.filter(([event]) => event === 'stock_updated').length, 3);
});

test('failed stock mutations do not broadcast', async () => {
  const { DomainError } = require('../src/types/errors');
  stockService.create = async () => { throw new DomainError('Invalid stock', { status: 400 }); };
  const res = response();
  await stockController.createStockItem({ body: item }, res);
  assert.equal(calls.length, 0);
  assert.ok(res.code >= 400);
});

test('all order mutation paths preserve notifications while Broadcast is offline', async () => {
  send = async () => { throw new Error('Realtime offline'); };
  for (const name of ['createOrder', 'createPublicOrder', 'updateStatus', 'updateOrder']) {
    orderService[name] = async () => ({ id: 'order', source: 'PUBLIC_MENU', status: 'NEW' });
  }
  orderService.processPayment = async () => ({ id: 'payment' });
  orderService.deleteOrder = async () => {};
  orderRepository.findItems = async () => [];
  const req = { body: {}, params: { id: 'order' }, user: { id: 'operator', role: 'ADMIN' }, get: () => undefined };
  for (const [handler, expected] of [
    [orderController.createOrder, 201],
    [orderController.createPublicOrder, 201],
    [orderController.updateOrderStatus, 200],
    [orderController.updateOrder, 200],
    [orderController.processPayment, 200],
    [orderController.deleteOrder, 204],
  ]) {
    const res = response();
    await handler(req, res);
    assert.equal(res.code, expected);
  }
  await tick();
  assert.equal(calls.filter(([event]) => event === 'stock_updated').length, 5);
  assert.deepEqual(orderCalls.map(([event]) => event), [
    'order_created',
    'order_created',
    'order_updated',
    'order_updated',
    'order_updated',
    'order_canceled',
  ]);
  assert.deepEqual(orderCalls[1][1], { orderId: 'order', source: 'PUBLIC_MENU' });
});


test('replays a created order when response enrichment fails after persistence', async () => {
  let creations = 0;
  orderService.createOrder = async () => {
    creations += 1;
    return { id: 'persisted-order', status: 'NEW' };
  };
  orderRepository.findItems = async () => { throw new Error('read after insert failed'); };
  const req = {
    body: { idempotencyKey: 'persisted-response-key' },
    user: { id: 'operator', role: 'ADMIN' },
    get: () => 'persisted-response-key',
  };

  const first = response();
  const replay = response();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await orderController.createOrder(req, first);
    await orderController.createOrder(req, replay);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(creations, 1);
  assert.equal(first.code, 201);
  assert.equal(first.body.id, 'persisted-order');
  assert.deepEqual(first.body.items, []);
  assert.equal(replay.code, 201);
  assert.equal(replay.headers['X-Idempotent-Replay'], 'true');
});

test('does not execute an ambiguous server failure twice for the same idempotency key', async () => {
  let creations = 0;
  orderService.createOrder = async () => {
    creations += 1;
    throw new Error('connection lost after insert');
  };
  const req = {
    body: { idempotencyKey: 'ambiguous-failure-key' },
    user: { id: 'operator', role: 'ADMIN' },
    get: () => 'ambiguous-failure-key',
  };

  const first = response();
  const replay = response();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await orderController.createOrder(req, first);
    await orderController.createOrder(req, replay);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(creations, 1);
  assert.equal(first.code, 500);
  assert.equal(replay.code, 500);
  assert.equal(replay.headers['X-Idempotent-Replay'], 'true');
});


test('keeps the order list available when optional payment enrichment fails', async () => {
  cashRegisterRepository.findOpenSession = async () => ({ id: 'session-1' });
  orderRepository.findBySession = async () => [{ id: 'order-visible', status: 'NEW' }];
  orderRepository.findItems = async () => [];
  paymentRepository.findBySession = async () => { throw new Error('payments unavailable'); };
  const req = { query: {}, user: { id: 'operator', role: 'ADMIN' } };
  const res = response();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await orderController.getOrders(req, res);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.code, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].id, 'order-visible');
  assert.equal(res.body[0].payment, null);
});
