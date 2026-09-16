const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://stock.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
const { supabase } = require('../src/lib/supabase');
const { orderService } = require('../src/services/order.service');
const { orderRepository } = require('../src/repositories/order.repository');
const { productRepository } = require('../src/repositories/product.repository');
const { categoryRepository } = require('../src/repositories/category.repository');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const { userRepository } = require('../src/repositories/user.repository');
const { productStockItemRepository } = require('../src/repositories/productStockItem.repository');
const { stockItemRepository } = require('../src/repositories/stockItem.repository');
const { productStockAvailability } = require('../src/services/productAvailability.service');
const input = { type: 'TAKE_AWAY', customerName: 'Teste', items: [{ productId: 'drink', quantity: 2 }] };
let requests;
beforeEach(() => {
  requests = [];
  orderRepository.findByIdempotencyKey = async () => null;
  cashRegisterRepository.findOpenSession = async () => ({ id: 'session' });
  productRepository.findById = async () => ({ id: 'drink', price: 5, categoryId: 'drinks', isByWeight: false });
  categoryRepository.findById = async () => ({ id: 'drinks' });
  userRepository.findAdminUser = async () => ({ id: 'admin' });
  orderRepository.create = async () => assert.fail('must not insert an order outside the transaction');
  orderRepository.addItem = async () => assert.fail('must not insert items outside the transaction');
  orderRepository.consumeStock = async () => assert.fail('must not consume separately');
  supabase.rpc = async (name, args) => {
    requests.push({ name, args });
    return { data: { ...args.p_order, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, error: null };
  };
});
test('private creation sends the entire order to one transaction with short IDs and a separate stable retry key', async () => {
  const actor = { id: 'admin', role: 'ADMIN' };
  await orderService.createOrder(input, actor, 'orders:create:admin:key');
  await orderService.createOrder(input, actor, 'orders:create:admin:key');
  await orderService.createOrder(input, actor, 'orders:create:other:key');
  assert.ok(requests.every(r => r.name === 'create_order_with_stock'));
  assert.equal(requests[0].args.p_order.id.length, 24);
  assert.notEqual(requests[0].args.p_order.id, requests[1].args.p_order.id);
  assert.equal(requests[0].args.p_order.idempotency_key, requests[1].args.p_order.idempotency_key);
  assert.notEqual(requests[0].args.p_order.idempotency_key, requests[2].args.p_order.idempotency_key);
  assert.notEqual(requests[0].args.p_order.id, requests[2].args.p_order.id);
  assert.equal(requests[0].args.p_items[0].order_id, requests[0].args.p_order.id);
  assert.equal(requests[0].args.p_items[0].quantity, 2);
});
test('public creation includes its pending payment in the same transaction', async () => {
  await orderService.createPublicOrder({ ...input, paymentMethod: 'PIX' }, 'public:key');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].args.p_payment.status, 'PENDING');
  assert.equal(requests[0].args.p_payment.order_id, requests[0].args.p_order.id);
});
test('stock errors are surfaced as HTTP 400 with a Portuguese message', async () => {
  supabase.rpc = async () => ({ error: { code: 'P0001', message: 'Insufficient stock of "Coca Lata".' }, data: null });
  await assert.rejects(orderService.createOrder(input, { id: 'admin', role: 'ADMIN' }), error =>
    error.status === 400 && error.message === 'Estoque insuficiente de "Coca Lata".');
});
test('availability requires every linked ingredient to cover one unit', async () => {
  productStockItemRepository.findByProduct = async () => [{ stockItemId: 'a', quantity: 2 }, { stockItemId: 'b', quantity: 1 }];
  stockItemRepository.findById = async id => ({ quantity: id === 'a' ? 1 : 5 });
  assert.equal((await productStockAvailability('drink')).available, false);
  stockItemRepository.findById = async () => ({ quantity: 2 });
  assert.equal((await productStockAvailability('drink')).available, true);
  stockItemRepository.findById = async () => ({ quantity: 0 });
  assert.equal((await productStockAvailability('drink')).available, false);
  productStockItemRepository.findByProduct = async () => [];
  assert.equal((await productStockAvailability('uncontrolled')).available, true);
});

test('replays by stored key before validating cash or stock after a restart', async () => {
  const existing = { id: 'existing-short-order-id' };
  orderRepository.findByIdempotencyKey = async () => existing;
  cashRegisterRepository.findOpenSession = async () => assert.fail('replay must not depend on current cash session');
  assert.equal(await orderService.createOrder(input, { id: 'admin', role: 'ADMIN' }, 'orders:create:admin:key'), existing);
  assert.equal(await orderService.createPublicOrder(input, 'public:key'), existing);
  assert.equal(requests.length, 0);
});
