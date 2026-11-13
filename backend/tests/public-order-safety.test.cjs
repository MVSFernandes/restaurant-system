// Contrato do checkout público (POST /orders/public).
// Tudo roda com repositórios substituídos: nenhum teste aqui fala com o Supabase.
const { test, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://public-order.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
const jwt = require('jsonwebtoken');

const { supabase } = require('../src/lib/supabase');
const { orderService } = require('../src/services/order.service');
const { orderRepository } = require('../src/repositories/order.repository');
const { productRepository } = require('../src/repositories/product.repository');
const { categoryRepository } = require('../src/repositories/category.repository');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');
const { tableRepository } = require('../src/repositories/table.repository');
const { tableTabRepository } = require('../src/repositories/tableTab.repository');
const { customerRepository } = require('../src/repositories/customer.repository');
const app = require('../src/app').default;

let server;
let baseUrl;
before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

// Exatamente o corpo que o cardápio público (PublicMenuPage) envia hoje.
const menuBody = () => ({
  idempotencyKey: 'menu-key',
  customerName: 'Fulano de Tal',
  customerPhone: '11999990000',
  type: 'TAKE_AWAY',
  paymentMethod: 'PIX',
  deliveryFee: 0,
  items: [{ productId: 'drink', quantity: 2 }],
});

const existingCustomer = {
  id: 'customer-maria',
  name: 'Maria (cliente de fiado)',
  phone: '11999990000',
  address: 'Rua da Maria, 10',
  creditLimit: 500,
  creditUsed: 120,
};

let rpcCalls;
let queriedTables;
let adminRows;
let customerWrites;

// Imita o comportamento do PostgREST para .maybeSingle(): 0 linhas -> null,
// 1 linha -> a linha, 2+ linhas -> erro PGRST116.
function fakeQuery(table) {
  queriedTables.push(table);
  const rows = table === 'users' ? adminRows : [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      if (rows.length > 1) {
        return {
          data: null,
          error: {
            code: 'PGRST116',
            message: 'JSON object requested, multiple (or no) rows returned',
            details: `Results contain ${rows.length} rows`,
          },
        };
      }
      return { data: rows[0] ?? null, error: null };
    },
  };
  return builder;
}

const adminRow = (id) => ({
  id, name: id, email: `${id}@example.test`, password: 'x', role: 'ADMIN',
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
});

beforeEach(() => {
  rpcCalls = [];
  queriedTables = [];
  customerWrites = [];
  adminRows = [adminRow('admin-1')];
  orderRepository.findByIdempotencyKey = async () => null;
  cashRegisterRepository.findOpenSession = async () => ({ id: 'session-1' });
  restaurantConfigRepository.get = async () => ({
    deliveryFee: 5,
    enabledPayments: 'CASH,PIX,CREDIT_CARD,DEBIT_CARD',
  });
  productRepository.findById = async (id) => (id === 'salad'
    ? { id, name: 'Salada por kg', price: 40, categoryId: 'meals', isByWeight: true, isPaused: false, pausedAt: null }
    : { id, name: 'Refrigerante', price: 6, categoryId: 'drinks', isByWeight: false, isPaused: false, pausedAt: null });
  categoryRepository.findById = async (id) => (id === 'meals'
    ? { id, isMealCategory: true, pricePerKg: 50, selfServicePricePerKg: 45 }
    : { id: 'drinks' });
  tableRepository.findById = async (id) => ({ id, number: 4, status: 'OCCUPIED' });
  tableTabRepository.findById = async (id) => ({ id, tableId: 'table-4', name: 'João', status: 'OPEN' });
  customerRepository.findByPhone = async (phone) => (phone === existingCustomer.phone ? existingCustomer : null);
  customerRepository.create = async (customer) => {
    customerWrites.push(['create', customer]);
    return customer;
  };
  customerRepository.update = async (id, patch) => {
    customerWrites.push(['update', id, patch]);
    return { ...existingCustomer, ...patch };
  };
  supabase.from = fakeQuery;
  supabase.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return {
      data: { ...args.p_order, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      error: null,
    };
  };
});

const createdOrder = () => {
  const call = rpcCalls.find((entry) => entry.name === 'create_order_with_stock');
  assert.ok(call, 'o pedido deveria ter sido enviado à transação de criação');
  return call.args;
};

// ---------------------------------------------------------------------------
// 1. Pedido público e comandas
// ---------------------------------------------------------------------------

test('public checkout refuses DINE_IN even with a valid open table tab', async () => {
  await assert.rejects(
    orderService.createPublicOrder({
      ...menuBody(),
      type: 'DINE_IN',
      tableId: 'table-4',
      tableTabId: 'tab-joao',
    }, 'public:dine-in'),
    (error) => error.status === 400
  );
  assert.equal(rpcCalls.length, 0, 'nenhum pedido pode chegar à comanda de outra pessoa');
});

for (const field of [
  'tableId', 'tableTabId', 'waiterId', 'userId', 'customerId', 'source',
  'status', 'cashRegisterSessionId', 'total', 'deliveryType',
]) {
  test(`public checkout explicitly refuses the internal field "${field}"`, async () => {
    await assert.rejects(
      orderService.createPublicOrder({ ...menuBody(), [field]: 'forged-value' }, `public:${field}`),
      (error) => error.status === 400 && error.details?.field === field
    );
    assert.equal(rpcCalls.length, 0);
  });
}

for (const field of ['unitPrice', 'manualPrice', 'saleType', 'weight', 'price', 'orderId']) {
  test(`public checkout refuses the operator-only item field "${field}"`, async () => {
    const body = menuBody();
    body.items = [{ productId: 'drink', quantity: 2, [field]: field === 'saleType' ? 'SELF_SERVICE' : 0.01 }];
    await assert.rejects(
      orderService.createPublicOrder(body, `public:item:${field}`),
      (error) => error.status === 400 && error.details?.field === `items[0].${field}`
    );
    assert.equal(rpcCalls.length, 0);
  });
}

test('public checkout refuses order types other than TAKE_AWAY and DELIVERY', async () => {
  await assert.rejects(
    orderService.createPublicOrder({ ...menuBody(), type: 'BALCAO' }, 'public:type'),
    (error) => error.status === 400 && error.details?.field === 'type'
  );
  assert.equal(rpcCalls.length, 0);
});

test('public checkout still creates TAKE_AWAY orders from the exact menu payload', async () => {
  await orderService.createPublicOrder(menuBody(), 'public:take-away');
  const { p_order, p_items, p_payment } = createdOrder();
  assert.equal(p_order.type, 'TAKE_AWAY');
  assert.equal(p_order.source, 'PUBLIC_MENU');
  assert.equal(p_order.table_id, null);
  assert.equal(p_order.table_tab_id, null);
  assert.equal(p_order.waiter_id, null);
  assert.equal(p_order.total, 12);
  assert.equal(p_items[0].price, 12);
  assert.equal(p_payment.status, 'PENDING');
  assert.equal(p_payment.method, 'PIX');
});

// O corpo que o cardápio envia para entrega: o telefone vai em customerPhone.
const deliveryBody = () => ({
  ...menuBody(),
  type: 'DELIVERY',
  deliveryFee: 5,
  deliveryStreet: 'Rua A',
  deliveryNumber: '1',
  deliveryNeighborhood: 'Centro',
  deliveryReference: 'Portão azul',
});

test('public DELIVERY uses the configured fee, never the fee the client sent', async () => {
  await orderService.createPublicOrder({ ...deliveryBody(), deliveryFee: 0.01 }, 'public:delivery');
  const { p_order } = createdOrder();
  assert.equal(p_order.type, 'DELIVERY');
  assert.equal(p_order.delivery_fee, 5);
  assert.equal(p_order.total, 17);
  assert.equal(p_order.delivery_street, 'Rua A');
  assert.equal(p_order.delivery_type, null);
});

test('public DELIVERY stores the address and the menu phone on the order', async () => {
  await orderService.createPublicOrder(deliveryBody(), 'public:delivery-address');
  const { p_order, p_payment } = createdOrder();
  assert.equal(p_order.delivery_street, 'Rua A');
  assert.equal(p_order.delivery_number, '1');
  assert.equal(p_order.delivery_neighborhood, 'Centro');
  assert.equal(p_order.delivery_reference, 'Portão azul');
  assert.equal(p_order.delivery_phone, '11999990000');
  assert.equal(p_payment.amount, 17);
});

test('public DELIVERY accepts "S/N" as the number and no reference', async () => {
  const body = { ...deliveryBody(), deliveryNumber: 'S/N' };
  delete body.deliveryReference;
  await orderService.createPublicOrder(body, 'public:delivery-sn');
  const { p_order } = createdOrder();
  assert.equal(p_order.delivery_number, 'S/N');
  assert.equal(p_order.delivery_reference, null);
});

for (const [field, label] of [
  ['deliveryStreet', 'rua'],
  ['deliveryNumber', 'número'],
  ['deliveryNeighborhood', 'bairro'],
  ['customerPhone', 'telefone'],
]) {
  for (const [kind, value] of [['missing', undefined], ['blank', '   ']]) {
    test(`public DELIVERY refuses a ${kind} ${field}`, async () => {
      const body = deliveryBody();
      if (value === undefined) delete body[field];
      else body[field] = value;
      await assert.rejects(
        orderService.createPublicOrder(body, `public:delivery:${field}:${kind}`),
        (error) => error.status === 400
          && error.details?.field === (field === 'customerPhone' ? 'deliveryPhone' : field)
          && error.message === `Para entrega, preencha ${label}.`
      );
      assert.equal(rpcCalls.length, 0);
    });
  }
}

test('public DELIVERY names every missing field in Portuguese', async () => {
  await assert.rejects(
    orderService.createPublicOrder(
      { ...menuBody(), type: 'DELIVERY', customerPhone: ' ', deliveryStreet: '', deliveryNumber: '  ' },
      'public:delivery:all-missing'
    ),
    (error) => error.status === 400
      && error.details?.field === 'deliveryStreet'
      && error.message === 'Para entrega, preencha rua, número, bairro e telefone.'
  );
  assert.equal(rpcCalls.length, 0);
});

test('public TAKE_AWAY needs no address or phone and drops an address it receives', async () => {
  const body = { ...deliveryBody(), type: 'TAKE_AWAY', deliveryNotes: 'Bater palmas' };
  delete body.customerPhone;
  await orderService.createPublicOrder(body, 'public:take-away-drops-address');
  const { p_order } = createdOrder();
  assert.equal(p_order.type, 'TAKE_AWAY');
  assert.equal(p_order.delivery_fee, 0);
  assert.equal(p_order.total, 12);
  assert.equal(p_order.delivery_street, null);
  assert.equal(p_order.delivery_number, null);
  assert.equal(p_order.delivery_neighborhood, null);
  assert.equal(p_order.delivery_reference, null);
  assert.equal(p_order.delivery_notes, null);
  assert.equal(p_order.delivery_phone, null);
});

test('replaying a key that already created an order returns it, even an incomplete old DELIVERY', async () => {
  const existing = { id: 'old-public-delivery', type: 'DELIVERY', deliveryStreet: null };
  orderRepository.findByIdempotencyKey = async () => existing;
  const body = { ...menuBody(), type: 'DELIVERY' };
  assert.equal(await orderService.createPublicOrder(body, 'public:old-delivery'), existing);
  assert.equal(rpcCalls.length, 0);
});

// ---------------------------------------------------------------------------
// 2. Identidade do cliente
// ---------------------------------------------------------------------------

test('a phone number alone does not attach the order to an existing customer', async () => {
  await orderService.createPublicOrder(menuBody(), 'public:phone-collision');
  const { p_order } = createdOrder();
  assert.equal(p_order.customer_id, null, 'o pedido não pode entrar no cadastro/fiado de outra pessoa');
  // O contato declarado fica no próprio pedido.
  assert.equal(p_order.customer_name, 'Fulano de Tal');
  assert.equal(p_order.delivery_phone, '11999990000');
  assert.deepEqual(customerWrites, [], 'o cadastro existente não pode ser alterado');
});

test('an unknown phone does not create an unverified customer record', async () => {
  await orderService.createPublicOrder({ ...menuBody(), customerPhone: '11888887777' }, 'public:new-phone');
  const { p_order } = createdOrder();
  assert.equal(p_order.customer_id, null);
  assert.equal(p_order.delivery_phone, '11888887777');
  assert.deepEqual(customerWrites, []);
});

test('anonymous public orders without phone keep working', async () => {
  const body = menuBody();
  delete body.customerPhone;
  await orderService.createPublicOrder(body, 'public:no-phone');
  const { p_order } = createdOrder();
  assert.equal(p_order.customer_id, null);
  assert.equal(p_order.delivery_phone, null);
});

// ---------------------------------------------------------------------------
// 3. Atribuição do pedido público
// ---------------------------------------------------------------------------

for (const [label, rows] of [
  ['zero administrators', []],
  ['one administrator', [adminRow('admin-1')]],
  ['two administrators', [adminRow('admin-1'), adminRow('admin-2')]],
]) {
  test(`public order is created and attributed to no operator with ${label}`, async () => {
    adminRows = rows;
    await orderService.createPublicOrder(menuBody(), `public:admins:${rows.length}`);
    const { p_order } = createdOrder();
    assert.equal(p_order.user_id, null, 'nenhuma pessoa realizou este lançamento');
    assert.equal(p_order.source, 'PUBLIC_MENU');
    assert.ok(!queriedTables.includes('users'), 'a criação não pode depender de procurar um administrador');
  });
}

// ---------------------------------------------------------------------------
// 4. Produtos vendidos por peso
// ---------------------------------------------------------------------------

test('public checkout refuses a by-weight product instead of selling it for R$ 0', async () => {
  const body = menuBody();
  body.items = [{ productId: 'salad', quantity: 1 }];
  await assert.rejects(
    orderService.createPublicOrder(body, 'public:by-weight'),
    (error) => error.status === 400 && /vendidos por peso/.test(error.message)
  );
  assert.equal(rpcCalls.length, 0);
});

test('public checkout still sells unit products in the same cart flow', async () => {
  await orderService.createPublicOrder(menuBody(), 'public:unit');
  assert.equal(createdOrder().p_items[0].price, 12);
});

const staff = { id: 'cashier-1', role: 'CASHIER' };
const takeAway = (item) => ({ type: 'TAKE_AWAY', customerName: 'Ana', items: [item] });

test('authenticated orders refuse a by-weight item without weight or operator price', async () => {
  await assert.rejects(
    orderService.createOrder(takeAway({ productId: 'salad', quantity: 1 }), staff, 'pdv:no-weight'),
    (error) => error.status === 400 && error.details?.field === 'weight'
  );
  assert.equal(rpcCalls.length, 0);
});

for (const weight of [0, -100, 'abc', '']) {
  test(`authenticated orders refuse the invalid weight ${JSON.stringify(weight)}`, async () => {
    await assert.rejects(
      orderService.createOrder(takeAway({ productId: 'salad', quantity: 1, weight }), staff, `pdv:weight:${weight}`),
      (error) => error.status === 400 && error.details?.field === 'weight'
    );
    assert.equal(rpcCalls.length, 0);
  });
}

test('a weighed item is priced by the server from the category price per kg', async () => {
  await orderService.createOrder(
    takeAway({ productId: 'salad', quantity: 1, weight: 350 }),
    { id: 'waiter-1', role: 'WAITER' },
    'waiter:weighed'
  );
  const { p_order, p_items } = createdOrder();
  assert.equal(p_items[0].weight, 350);
  assert.equal(p_items[0].unit_price, 50);
  assert.equal(p_items[0].price, 17.5);
  assert.equal(p_order.total, 17.5);
});

test('the PDV operator price for a by-weight item without weight keeps working', async () => {
  await orderService.createOrder(
    takeAway({ productId: 'salad', quantity: 1, manualPrice: 22, saleType: 'WEIGHT' }),
    staff,
    'pdv:manual'
  );
  const { p_items } = createdOrder();
  assert.equal(p_items[0].price, 22);
  assert.equal(p_items[0].weight, null);
});

// ---------------------------------------------------------------------------
// Pela rota HTTP real: o portão público e as rotas autenticadas
// ---------------------------------------------------------------------------

const postJson = (path, body, role) => fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(role ? { Authorization: `Bearer ${jwt.sign({ id: `user-${role.toLowerCase()}`, role }, process.env.JWT_SECRET)}` } : {}),
  },
  body: JSON.stringify(body),
});

test('POST /api/orders/public answers 400 for a DINE_IN order into a tab', async () => {
  orderRepository.findItems = async () => [];
  const response = await postJson('/orders/public', {
    ...menuBody(), idempotencyKey: 'http-dine-in', type: 'DINE_IN', tableId: 'table-4', tableTabId: 'tab-joao',
  });
  assert.equal(response.status, 400);
  assert.equal(rpcCalls.length, 0);
});

test('POST /api/orders/public still answers 201 for the menu payload', async () => {
  orderRepository.findItems = async () => [];
  const response = await postJson('/orders/public', { ...menuBody(), idempotencyKey: 'http-menu' });
  assert.equal(response.status, 201);
  const { p_order } = createdOrder();
  assert.equal(p_order.user_id, null);
  assert.equal(p_order.customer_id, null);
});

test('POST /api/orders/public answers 400 for an incomplete DELIVERY and creates nothing', async () => {
  orderRepository.findItems = async () => [];
  const response = await postJson('/orders/public', {
    ...menuBody(), idempotencyKey: 'http-delivery-incomplete', type: 'DELIVERY',
    deliveryStreet: 'Rua A', deliveryNumber: ' ',
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(JSON.stringify(body), /Para entrega, preencha número e bairro\./);
  assert.equal(rpcCalls.length, 0);
});

test('POST /api/orders/public answers 201 for a complete DELIVERY', async () => {
  orderRepository.findItems = async () => [];
  const response = await postJson('/orders/public', { ...deliveryBody(), idempotencyKey: 'http-delivery' });
  assert.equal(response.status, 201);
  assert.equal(createdOrder().p_order.delivery_neighborhood, 'Centro');
});

test('authenticated waiters still launch DINE_IN orders into an open tab', async () => {
  orderRepository.findItems = async () => [];
  const response = await postJson('/orders', {
    type: 'DINE_IN', tableId: 'table-4', tableTabId: 'tab-joao',
    items: [{ productId: 'drink', quantity: 1 }],
  }, 'WAITER');
  assert.equal(response.status, 201);
  const { p_order } = createdOrder();
  assert.equal(p_order.type, 'DINE_IN');
  assert.equal(p_order.table_tab_id, 'tab-joao');
  assert.equal(p_order.source, 'WAITER');
  assert.equal(p_order.user_id, 'user-waiter');
  assert.equal(p_order.waiter_id, 'user-waiter');
});

test('authenticated cashiers still launch DINE_IN orders from the PDV', async () => {
  orderRepository.findItems = async () => [];
  const response = await postJson('/orders', {
    type: 'DINE_IN', tableId: 'table-4', tableTabId: 'tab-joao',
    items: [{ productId: 'drink', quantity: 1 }],
  }, 'CASHIER');
  assert.equal(response.status, 201);
  const { p_order } = createdOrder();
  assert.equal(p_order.source, 'PDV');
  assert.equal(p_order.user_id, 'user-cashier');
});
