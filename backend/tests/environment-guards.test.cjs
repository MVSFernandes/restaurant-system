const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Valores só deste teste. Nada vem do .env.
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const jwt = require('jsonwebtoken');
const { cashRegisterService } = require('../src/services/cashRegister.service');
const app = require('../src/app').default;

const originalGetCurrentSession = cashRegisterService.getCurrentSession;

let server;
let baseUrl;

before(async () => {
  cashRegisterService.getCurrentSession = async () => null;
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  cashRegisterService.getCurrentSession = originalGetCurrentSession;
  await new Promise((resolve) => server.close(resolve));
});

const withToken = (token) =>
  fetch(`${baseUrl}/api/cash-register/current`, { headers: { Authorization: `Bearer ${token}` } });

// O ataque que o padrão antigo permitia: assinar com a palavra "secret" e se
// declarar administrador.
const forged = () => jwt.sign({ id: 'intruder', role: 'ADMIN' }, 'secret');

test('a token signed with "secret" is refused while JWT_SECRET is set', async () => {
  const response = await withToken(forged());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: 'Token inválido ou expirado' });
});

test('a token signed with "secret" is refused even if JWT_SECRET goes missing', async () => {
  const secret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    const response = await withToken(forged());
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: 'Token inválido ou expirado' });
  } finally {
    process.env.JWT_SECRET = secret;
  }
});

test('a token signed with JWT_SECRET still passes', async () => {
  const response = await withToken(jwt.sign({ id: 'cashier-1', role: 'CASHIER' }, process.env.JWT_SECRET));
  assert.equal(response.status, 200);
});

test('the rate limiter does not trust a token signed with "secret"', async () => {
  const response = await withToken(forged());
  assert.equal(response.headers.get('x-ratelimit-scope'), 'public');
});
