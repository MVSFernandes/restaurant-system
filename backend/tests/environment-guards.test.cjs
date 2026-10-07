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

// Ambiente fiscal: sem valor presumido, nem produção nem homologação.
const { focusNfeService } = require('../src/services/focusNfe.service');

const withFocusEnvironment = (value, run) => {
  const original = process.env.FOCUS_NFE_ENVIRONMENT;
  if (value === undefined) delete process.env.FOCUS_NFE_ENVIRONMENT;
  else process.env.FOCUS_NFE_ENVIRONMENT = value;
  try {
    return run();
  } finally {
    if (original === undefined) delete process.env.FOCUS_NFE_ENVIRONMENT;
    else process.env.FOCUS_NFE_ENVIRONMENT = original;
  }
};

for (const value of [undefined, '', 'test-only-focus-token', 'homologacao']) {
  test(`the fiscal service refuses FOCUS_NFE_ENVIRONMENT=${JSON.stringify(value)} instead of assuming homologation`, () => {
    withFocusEnvironment(value, () => {
      assert.throws(() => focusNfeService.getEnvironment(), (error) => {
        assert.equal(error.code, 'FOCUS_NFE_NOT_CONFIGURED');
        assert.equal(error.message, 'FOCUS_NFE_ENVIRONMENT must be production or homologation.');
        return true;
      });
    });
  });
}

for (const value of ['production', 'homologation']) {
  test(`the fiscal service accepts FOCUS_NFE_ENVIRONMENT=${value}`, () => {
    withFocusEnvironment(value, () => assert.equal(focusNfeService.getEnvironment(), value));
  });
}
