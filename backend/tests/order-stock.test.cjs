const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://stock.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
const { supabase } = require('../src/lib/supabase');
const {
  DATABASE_DELIVERY_TYPES,
  orderService,
} = require('../src/services/order.service');
const { orderRepository } = require('../src/repositories/order.repository');
const { productRepository } = require('../src/repositories/product.repository');
const { categoryRepository } = require('../src/repositories/category.repository');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');
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
  restaurantConfigRepository.get = async () => ({
    deliveryFee: 5,
    enabledPayments: 'CASH,PIX,CREDIT_CARD,DEBIT_CARD',
  });
  productRepository.findById = async () => ({ id: 'drink', name: 'Coca Lata', price: 5, categoryId: 'drinks', isByWeight: false });
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
  assert.equal(requests[0].args.p_items[0].product_name, 'Coca Lata');
  assert.equal(requests[0].args.p_order.source, 'PDV');
});
test('product names are captured at sale time and do not change when the catalog is renamed', async () => {
  const actor = { id: 'admin', role: 'ADMIN' };
  let currentName = 'Coca Lata';
  productRepository.findById = async () => ({
    id: 'drink',
    name: currentName,
    price: 5,
    categoryId: 'drinks',
    isByWeight: false,
  });

  await orderService.createOrder(input, actor, 'snapshot:before');
  currentName = 'Coca-Cola Lata 350ml';
  await orderService.createOrder(input, actor, 'snapshot:after');

  assert.equal(requests[0].args.p_items[0].product_name, 'Coca Lata');
  assert.equal(requests[1].args.p_items[0].product_name, 'Coca-Cola Lata 350ml');
});
test('public delivery creation includes a DB-valid payment and the delivery fee in the total', async () => {
  await orderService.createPublicOrder(
    { ...input, type: 'DELIVERY', deliveryFee: 99, paymentMethod: 'CASH' },
    'public:key'
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].args.p_payment.status, 'PENDING');
  assert.equal(requests[0].args.p_payment.method, 'CASH');
  assert.equal(requests[0].args.p_payment.amount, 15);
  assert.equal(requests[0].args.p_order.total, 15);
  assert.equal(requests[0].args.p_order.delivery_fee, 5);
  assert.equal(requests[0].args.p_payment.order_id, requests[0].args.p_order.id);
  assert.equal(requests[0].args.p_order.source, 'PUBLIC_MENU');
});

test('public PIX orders are stored as paid from creation', async () => {
  await orderService.createPublicOrder(
    { ...input, paymentMethod: 'PIX' },
    'public:pix'
  );
  assert.equal(requests[0].args.p_payment.method, 'PIX');
  assert.equal(requests[0].args.p_payment.status, 'PAID');
  assert.equal(requests[0].args.p_order.source, 'PUBLIC_MENU');
});

test('public creation rejects payment values outside the database constraint', async () => {
  await assert.rejects(
    orderService.createPublicOrder({ ...input, paymentMethod: 'ON_DELIVERY' }, 'public:invalid'),
    error => error.status === 400 && /forma de pagamento válida/.test(error.message)
  );
  assert.equal(requests.length, 0);
});
test('private delivery creation only persists delivery types accepted by the database constraint', async () => {
  const actor = { id: 'admin', role: 'ADMIN' };
  assert.deepEqual(DATABASE_DELIVERY_TYPES, ['URBAN', 'RURAL']);
  const options = [
    { deliveryType: 'URBAN', deliveryFee: 1 },
    { deliveryType: 'RURAL', deliveryFee: 3 },
    { deliveryType: 'CUSTOM', deliveryFee: 12.5 },
    { deliveryType: 'NONE', deliveryFee: 99 },
  ];

  for (const [index, option] of options.entries()) {
    await orderService.createOrder(
      { ...input, type: 'DELIVERY', customerName: 'Cliente', ...option },
      actor,
      'delivery:' + index
    );
  }

  assert.deepEqual(
    requests.map(({ args }) => ({
      deliveryType: args.p_order.delivery_type,
      deliveryFee: args.p_order.delivery_fee,
      total: args.p_order.total,
    })),
    [
      { deliveryType: 'URBAN', deliveryFee: 1, total: 11 },
      { deliveryType: 'RURAL', deliveryFee: 3, total: 13 },
      { deliveryType: null, deliveryFee: 12.5, total: 22.5 },
      { deliveryType: null, deliveryFee: 0, total: 10 },
    ]
  );
});

test('private delivery creation rejects values outside the database-compatible selections', async () => {
  const actor = { id: 'admin', role: 'ADMIN' };
  await assert.rejects(
    orderService.createOrder(
      {
        ...input,
        type: 'DELIVERY',
        customerName: 'Cliente',
        deliveryType: 'ON_DEMAND',
        deliveryFee: 1,
      },
      actor
    ),
    error => error.status === 400 && /taxa de entrega válida/.test(error.message)
  );
  assert.equal(requests.length, 0);
});

test('private delivery creation rejects missing and negative fees', async () => {
  const actor = { id: 'admin', role: 'ADMIN' };
  await assert.rejects(
    orderService.createOrder(
      { ...input, type: 'DELIVERY', customerName: 'Cliente', deliveryType: 'CUSTOM' },
      actor
    ),
    error => error.status === 400 && /valor da taxa/.test(error.message)
  );
  await assert.rejects(
    orderService.createOrder(
      {
        ...input,
        type: 'DELIVERY',
        customerName: 'Cliente',
        deliveryType: 'CUSTOM',
        deliveryFee: -1,
      },
      actor
    ),
    error => error.status === 400 && /taxa de entrega válida/.test(error.message)
  );
  assert.equal(requests.length, 0);
});

test('editing an order does not recalculate its stored fee from current configuration', async () => {
  const existing = {
    id: 'delivery-order',
    type: 'DELIVERY',
    status: 'NEW',
    waiterId: null,
    deliveryFee: 1,
    deliveryType: 'URBAN',
  };
  let savedPatch;
  orderRepository.findById = async () => existing;
  orderRepository.update = async (_id, patch) => {
    savedPatch = patch;
    return { ...existing, ...patch };
  };

  await orderService.updateOrder(
    existing.id,
    { customerName: 'Cliente atualizado' },
    { id: 'admin', role: 'ADMIN' }
  );

  assert.deepEqual(savedPatch, { customerName: 'Cliente atualizado' });
});

test('editing only the delivery fee updates the persisted total', async () => {
  const existing = {
    id: 'delivery-order',
    type: 'DELIVERY',
    status: 'NEW',
    waiterId: null,
    deliveryFee: 1,
    deliveryType: 'URBAN',
  };
  let savedPatch;
  orderRepository.findById = async () => existing;
  orderRepository.findItems = async () => [{ price: 10 }];
  orderRepository.update = async (_id, patch) => {
    savedPatch = patch;
    return { ...existing, ...patch };
  };

  await orderService.updateOrder(
    existing.id,
    { deliveryType: 'CUSTOM', deliveryFee: 12.5 },
    { id: 'admin', role: 'ADMIN' }
  );

  assert.deepEqual(savedPatch, {
    deliveryType: null,
    deliveryFee: 12.5,
    total: 22.5,
  });
});

test('editing to no fee clears the stored fee and recalculates the total', async () => {
  const existing = {
    id: 'delivery-order',
    type: 'DELIVERY',
    status: 'NEW',
    waiterId: null,
    deliveryFee: 12.5,
    deliveryType: null,
  };
  let savedPatch;
  orderRepository.findById = async () => existing;
  orderRepository.findItems = async () => [{ price: 10 }];
  orderRepository.update = async (_id, patch) => {
    savedPatch = patch;
    return { ...existing, ...patch };
  };

  await orderService.updateOrder(
    existing.id,
    { deliveryType: 'NONE' },
    { id: 'admin', role: 'ADMIN' }
  );

  assert.deepEqual(savedPatch, {
    deliveryType: null,
    deliveryFee: 0,
    total: 10,
  });
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
