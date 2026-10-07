const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Valores só deste teste. Nada vem do .env.
process.env.SUPABASE_URL = 'https://idempotency.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const { supabase } = require('../src/lib/supabase');
const { orderRepository } = require('../src/repositories/order.repository');
const { productRepository } = require('../src/repositories/product.repository');
const { categoryRepository } = require('../src/repositories/category.repository');
const { cashRegisterRepository } = require('../src/repositories/cashRegister.repository');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');
const { userRepository } = require('../src/repositories/user.repository');
const { stockItemRepository } = require('../src/repositories/stockItem.repository');
const { toOrderDomain } = require('../src/mappers/order.mapper');
const orderController = require('../src/controllers/order.controller');

// O controller e o serviço são os de verdade. Por baixo, um banco de mentira
// que faz o que a create_order_with_stock faz: grava o pedido com a chave e,
// se a chave já existe, devolve o pedido gravado em vez de criar outro.
let ordersByKey;
let rpcCalls;
let serviceRuns;
// Falhas programadas para a próxima chamada da RPC.
let failBeforeCommit;
let failAfterCommit;
let rpcGate;

const lostConnection = { message: 'TypeError: fetch failed', code: '' };

beforeEach(() => {
  ordersByKey = new Map();
  rpcCalls = 0;
  serviceRuns = 0;
  failBeforeCommit = 0;
  failAfterCommit = 0;
  rpcGate = null;

  supabase.channel = () => ({ httpSend: async () => ({ success: true }) });
  supabase.rpc = async (name, args) => {
    assert.equal(name, 'create_order_with_stock');
    rpcCalls += 1;
    if (rpcGate) await rpcGate;
    const key = args.p_order.idempotency_key;
    if (ordersByKey.has(key)) return { data: ordersByKey.get(key), error: null };
    if (failBeforeCommit > 0) {
      failBeforeCommit -= 1;
      return { data: null, error: lostConnection };
    }
    const now = new Date().toISOString();
    const row = { ...args.p_order, created_at: now, updated_at: now };
    ordersByKey.set(key, row);
    if (failAfterCommit > 0) {
      failAfterCommit -= 1;
      return { data: null, error: lostConnection };
    }
    return { data: row, error: null };
  };
  orderRepository.findByIdempotencyKey = async (key) => {
    // Cada passagem aqui é uma execução do serviço: é a primeira coisa que ele faz.
    serviceRuns += 1;
    return ordersByKey.has(key) ? toOrderDomain(ordersByKey.get(key)) : null;
  };
  orderRepository.findItems = async () => [];
  cashRegisterRepository.findOpenSession = async () => ({ id: 'session' });
  restaurantConfigRepository.get = async () => ({ deliveryFee: 5, enabledPayments: 'CASH,PIX' });
  userRepository.findAdminUser = async () => ({ id: 'admin' });
  productRepository.findById = async () => ({
    id: 'drink', name: 'Coca Lata', price: 5, categoryId: 'drinks', isByWeight: false, isPaused: false, pausedAt: null,
  });
  categoryRepository.findById = async () => ({ id: 'drinks' });
  stockItemRepository.findLowStock = async () => [];
});

const privateInput = { type: 'TAKE_AWAY', customerName: 'Maria', items: [{ productId: 'drink', quantity: 2 }] };
const publicInput = { ...privateInput, paymentMethod: 'CASH' };

const request = (key, body) => ({
  body: { ...body, idempotencyKey: key },
  user: { id: 'cashier-1', role: 'CASHIER' },
  ip: '203.0.113.7',
  get: (name) => (name.toLowerCase() === 'x-idempotency-key' ? key : undefined),
});
const publicRequest = (key, body) => {
  const req = request(key, body);
  delete req.user;
  return req;
};

const response = () => ({
  code: 200, body: undefined, headers: {},
  status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; },
  setHeader(name, value) { this.headers[name] = value; return this; },
  send() { return this; },
});

// O controller loga todo 5xx. Silencia uma vez para o arquivo todo: trocar e
// restaurar por chamada se embaralha quando duas requisições correm juntas.
const originalConsoleError = console.error;
before(() => { console.error = () => {}; });
after(() => { console.error = originalConsoleError; });

const create = async (key, body = privateInput) => {
  const res = response();
  await orderController.createOrder(request(key, body), res);
  return res;
};
const createPublic = async (key, body = publicInput) => {
  const res = response();
  await orderController.createPublicOrder(publicRequest(key, body), res);
  return res;
};

const isReplay = (res) => res.headers['X-Idempotent-Replay'] === 'true';

// --- 5xx: a segunda tentativa precisa tentar --------------------------------

for (const [route, send] of [['POST /orders', create], ['POST /orders/public', createPublic]]) {
  test(`${route}: after a 5xx where the order WAS saved, the retry returns it and there is one order`, async () => {
    failAfterCommit = 1;
    const first = await send(`saved-then-lost-${route}`);
    assert.equal(first.code, 500);
    assert.equal(ordersByKey.size, 1, 'o banco commitou antes de a resposta se perder');

    const retry = await send(`saved-then-lost-${route}`);
    assert.equal(retry.code, 201);
    assert.equal(isReplay(retry), false, 'a retentativa roda de verdade, não sai do cache');
    assert.equal(retry.body.id, [...ordersByKey.values()][0].id);
    assert.equal(ordersByKey.size, 1, 'um pedido só');
    assert.equal(serviceRuns, 2);
  });

  test(`${route}: after a 5xx where the order was NOT saved, the retry creates it and there is one order`, async () => {
    failBeforeCommit = 1;
    const first = await send(`lost-before-commit-${route}`);
    assert.equal(first.code, 500);
    assert.equal(ordersByKey.size, 0);

    const retry = await send(`lost-before-commit-${route}`);
    assert.equal(retry.code, 201);
    assert.equal(isReplay(retry), false);
    assert.equal(retry.body.id, [...ordersByKey.values()][0].id);
    assert.equal(ordersByKey.size, 1, 'um pedido só');
  });

  test(`${route}: a success is replayed from the cache without running again`, async () => {
    const first = await send(`replayed-success-${route}`);
    const replay = await send(`replayed-success-${route}`);
    assert.equal(first.code, 201);
    assert.equal(replay.code, 201);
    assert.equal(isReplay(replay), true);
    assert.equal(replay.body.id, first.body.id);
    assert.equal(serviceRuns, 1);
    assert.equal(rpcCalls, 1);
  });
}

test('a 5xx thrown outside the database also reaches the service on retry', async () => {
  // Falha antes da RPC, na leitura do caixa: erro inesperado vira 500.
  cashRegisterRepository.findOpenSession = async () => { throw new Error('socket hang up'); };
  const first = await create('unexpected-error');
  assert.equal(first.code, 500);
  assert.equal(first.body.message, 'Erro ao criar pedido');

  cashRegisterRepository.findOpenSession = async () => ({ id: 'session' });
  const retry = await create('unexpected-error');
  assert.equal(retry.code, 201);
  assert.equal(isReplay(retry), false);
  assert.equal(ordersByKey.size, 1);
});

// --- 4xx: recusa legítima continua apagando a entrada ------------------------

test('a 4xx refusal is not cached: fixing the cause and retrying with the same key creates the order', async () => {
  cashRegisterRepository.findOpenSession = async () => null;
  const refused = await create('closed-register');
  assert.equal(refused.code, 400);
  assert.equal(ordersByKey.size, 0);

  cashRegisterRepository.findOpenSession = async () => ({ id: 'session' });
  const retry = await create('closed-register');
  assert.equal(retry.code, 201);
  assert.equal(isReplay(retry), false);
  assert.equal(ordersByKey.size, 1);
  assert.equal(serviceRuns, 2);
});

test('POST /orders/public: a 4xx refusal is not cached either', async () => {
  const refused = await createPublic('public-bad-payment', { ...publicInput, paymentMethod: 'CREDIT_CARD' });
  assert.equal(refused.code, 400);

  const retry = await createPublic('public-bad-payment');
  assert.equal(retry.code, 201);
  assert.equal(isReplay(retry), false);
  assert.equal(ordersByKey.size, 1);
});

// --- Os cinco minutos -------------------------------------------------------

test('a cached success expires after five minutes and the next try runs the service again', async (t) => {
  let now = Date.parse('2026-10-07T12:00:00Z');
  t.mock.method(Date, 'now', () => now);

  const first = await create('expiring-success');
  assert.equal(first.code, 201);

  now += 5 * 60 * 1000;
  const stillCached = await create('expiring-success');
  assert.equal(isReplay(stillCached), true, 'aos cinco minutos exatos ainda repete');
  assert.equal(serviceRuns, 1);

  now += 1;
  const afterExpiry = await create('expiring-success');
  assert.equal(afterExpiry.code, 201);
  assert.equal(isReplay(afterExpiry), false, 'depois dos cinco minutos, roda o serviço');
  assert.equal(afterExpiry.body.id, first.body.id, 'e o banco devolve o mesmo pedido');
  assert.equal(serviceRuns, 2);
  assert.equal(rpcCalls, 1, 'sem nova criação');
  assert.equal(ordersByKey.size, 1);
});

// --- Requisições simultâneas ------------------------------------------------

const deferred = () => {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
};

test('two simultaneous requests with the same key share one execution', async () => {
  const gate = deferred();
  rpcGate = gate.promise;

  const both = Promise.all([create('simultaneous'), create('simultaneous')]);
  await new Promise((resolve) => setImmediate(resolve));
  gate.release();
  const [first, second] = await both;

  assert.equal(first.code, 201);
  assert.equal(second.code, 201);
  assert.equal(second.body.id, first.body.id);
  assert.equal(isReplay(second), true, 'a segunda esperou a execução da primeira');
  assert.equal(serviceRuns, 1);
  assert.equal(rpcCalls, 1);
  assert.equal(ordersByKey.size, 1);
});

test('two simultaneous requests sharing a 5xx both fail once, and the next retry runs', async () => {
  const gate = deferred();
  rpcGate = gate.promise;
  failAfterCommit = 1;

  const both = Promise.all([create('simultaneous-failure'), create('simultaneous-failure')]);
  await new Promise((resolve) => setImmediate(resolve));
  gate.release();
  const [first, second] = await both;

  assert.equal(first.code, 500);
  assert.equal(second.code, 500);
  assert.equal(serviceRuns, 1, 'uma execução só para as duas');

  rpcGate = null;
  const retry = await create('simultaneous-failure');
  assert.equal(retry.code, 201);
  assert.equal(isReplay(retry), false);
  assert.equal(ordersByKey.size, 1, 'um pedido só');
});
