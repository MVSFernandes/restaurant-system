const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Segredo só deste teste: o token é assinado aqui e conferido pelo mesmo
// middleware que roda em produção. Nada vem do .env.
process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const jwt = require('jsonwebtoken');
const { configService } = require('../src/services/domain.services');
const app = require('../src/app').default;

const token = (role) => jwt.sign({ id: `user-${role.toLowerCase()}`, role }, process.env.JWT_SECRET);

let server;
let baseUrl;
const originalUpdate = configService.update;

before(async () => {
  // A gravação de verdade não roda: o teste é sobre quem passa pelo portão.
  configService.update = async (input) => ({ id: 'config-1', ...input });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  configService.update = originalUpdate;
  await new Promise((resolve) => server.close(resolve));
});

const putConfig = (role) =>
  fetch(`${baseUrl}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(role)}` },
    body: JSON.stringify({ name: 'Restaurante', cnpj: '00000000000100' }),
  });

for (const role of ['WAITER', 'CASHIER', 'FINANCE']) {
  test(`PUT /api/config refuses ${role}`, async () => {
    const response = await putConfig(role);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { message: 'Acesso negado: permissão insuficiente' });
  });
}

test('PUT /api/config accepts ADMIN', async () => {
  const response = await putConfig('ADMIN');
  assert.equal(response.status, 200);
});

for (const [method, path] of [
  ['POST', '/config/branding/logo'],
  ['POST', '/config/branding/banner'],
  ['DELETE', '/config/branding/logo'],
  ['DELETE', '/config/branding/banner'],
]) {
  test(`${method} /api${path} refuses WAITER`, async () => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token('WAITER')}` },
    });
    assert.equal(response.status, 403);
  });
}
