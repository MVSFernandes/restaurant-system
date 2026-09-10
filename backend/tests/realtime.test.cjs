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
const stockController = require('../src/controllers/stock.controller');
const orderController = require('../src/controllers/order.controller');

const calls = [];
let send = async () => ({ success: true });
let channelCreations = 0;
supabase.channel = (topic) => {
  channelCreations += 1;
  assert.equal(topic, 'stock-events');
  return { httpSend: (...args) => { calls.push(args); return send(...args); } };
};

const { publishStockUpdated, publishStockLow } = require('../src/lib/realtime');
const { notifyStockChanged } = require('../src/services/stockRealtime.service');
const item = { id: 'rice', name: 'Arroz', quantity: 1, minQuantity: 10, unit: 'kg' };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const response = () => ({
  code: 200, body: undefined,
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
  send() { return this; },
});

beforeEach(() => {
  calls.length = 0;
  send = async () => ({ success: true });
  stockItemRepository.findLowStock = async () => [item];
});


test('publishes HTTP-only events with IDs and reuses one channel', async () => {
  await publishStockUpdated();
  await publishStockLow([{ ...item, supplier: 'private', customerPhone: 'private' }]);
  assert.equal(channelCreations, 1);
  assert.deepEqual(calls, [
    ['stock_updated', {}, { timeout: 3000 }],
    ['stock_low', { items: [{ id: 'rice' }] }, { timeout: 3000 }],
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

test('all five order mutation paths preserve notifications while Broadcast is offline', async () => {
  send = async () => { throw new Error('Realtime offline'); };
  for (const name of ['createOrder', 'createPublicOrder', 'updateStatus', 'updateOrder']) {
    orderService[name] = async () => ({ id: 'order' });
  }
  orderService.deleteOrder = async () => {};
  orderRepository.findItems = async () => [];
  const req = { body: {}, params: { id: 'order' }, user: { id: 'operator', role: 'ADMIN' }, get: () => undefined };
  for (const [handler, expected] of [
    [orderController.createOrder, 201],
    [orderController.createPublicOrder, 201],
    [orderController.updateOrderStatus, 200],
    [orderController.updateOrder, 200],
    [orderController.deleteOrder, 204],
  ]) {
    const res = response();
    await handler(req, res);
    assert.equal(res.code, expected);
  }
  await tick();
  assert.equal(calls.filter(([event]) => event === 'stock_updated').length, 5);
});
