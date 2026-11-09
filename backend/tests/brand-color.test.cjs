// Cor principal configurável por instalação (Etapa 1B.7): regras de contraste,
// semântica do PUT /api/config e exposição pública da cor.
const { test, afterEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = 'test-only-jwt-secret';
process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const jwt = require('jsonwebtoken');
const {
  contrastRatio,
  deriveBrandTokens,
  describeContrastFailures,
  evaluateBrandColor,
  hexToRgb,
  normalizeBrandColor,
} = require('../src/utils/brandColor');
const { configService } = require('../src/services/domain.services');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');
const {
  toPublicRestaurantConfig,
  toRestaurantConfigDomain,
  toRestaurantConfigUpdate,
} = require('../src/mappers/restaurantConfig.mapper');
const { supabase } = require('../src/lib/supabase');
const app = require('../src/app').default;

const ACCEPTED = ['#1d4ed8', '#b91c1c', '#7e22ce', '#0f766e', '#9a3412', '#be123c', '#0369a1', '#000000'];
const REFUSED = ['#ea580c', '#facc15', '#ffffff', '#16a34a', '#dc2626'];

const originals = {
  get: restaurantConfigRepository.get,
  update: restaurantConfigRepository.update,
  from: supabase.from,
};
afterEach(() => {
  restaurantConfigRepository.get = originals.get;
  restaurantConfigRepository.update = originals.update;
  supabase.from = originals.from;
});

test('backend and frontend use the same color rules (identical files)', () => {
  const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(
    read('../src/utils/brandColor.ts'),
    read('../../frontend/src/theme/brandColor.ts'),
    'backend/src/utils/brandColor.ts e frontend/src/theme/brandColor.ts precisam ser idênticos'
  );
});

test('normalizes #rrggbb and refuses anything else', () => {
  assert.equal(normalizeBrandColor(' #1D4ED8 '), '#1d4ed8');
  for (const value of ['1d4ed8', '#1d4ed', '#1d4ed80', '#ggg000', 'blue', 'rgb(0,0,0)', '', null, undefined, 123]) {
    assert.equal(normalizeBrandColor(value), null, String(value));
  }
});

test('contrast ratio follows WCAG 2.1', () => {
  assert.equal(contrastRatio([255, 255, 255], [0, 0, 0]), 21);
  assert.equal(contrastRatio([255, 255, 255], [255, 255, 255]), 1);
  assert.equal(contrastRatio(hexToRgb('#1d4ed8'), [255, 255, 255]).toFixed(2), '6.70');
});

for (const color of ACCEPTED) {
  test(`${color} passes every text/background pair in both themes`, () => {
    assert.deepEqual(evaluateBrandColor(color).failures, []);
  });
}

for (const color of REFUSED) {
  test(`${color} is refused with the failing usage named`, () => {
    const { failures } = evaluateBrandColor(color);
    assert.ok(failures.length > 0);
    for (const failure of failures) assert.ok(failure.ratio < failure.minimum);
    assert.match(describeContrastFailures(failures), /^Contraste insuficiente no tema (claro|escuro), .+: \d+,\d{2}:1, mínimo \d,\d{2}:1/);
  });
}

test('the default orange itself does not reach 4.5:1 with white text (recorded, not changed)', () => {
  const { failures } = evaluateBrandColor('#ea580c');
  const button = failures.find((failure) => failure.theme === 'light' && failure.usage === 'texto do botão principal');
  assert.equal(button.ratio, 3.55);
});

test('derived tokens: light keeps the chosen color, dark uses dark text on a lighter primary', () => {
  const { light, dark } = deriveBrandTokens('#1d4ed8');
  assert.deepEqual(light.primary, [29, 78, 216]);
  assert.deepEqual(light['primary-600'], [29, 78, 216]);
  assert.deepEqual(light['primary-fg'], [255, 255, 255]);
  assert.deepEqual(dark['primary-fg'], [15, 23, 42]);
  assert.ok(contrastRatio(dark.primary, [15, 23, 42]) >= 4.5);
  assert.ok(contrastRatio(dark.primary, [2, 6, 23]) >= 4.5);
  assert.ok(contrastRatio(dark['primary-strong'], dark['primary-subtle']) >= 4.5);
});

// ---------- configService.update ----------

const savedConfig = (overrides = {}) => ({
  id: 'config-1',
  name: 'Restaurante',
  nfceGroupedItemDescription: 'REFEICAO',
  brandPrimaryColor: '#7e22ce',
  ...overrides,
});

function captureUpdate() {
  const calls = [];
  restaurantConfigRepository.get = async () => savedConfig();
  restaurantConfigRepository.update = async (id, patch) => {
    calls.push({ id, patch, payload: toRestaurantConfigUpdate(patch) });
    return savedConfig({ ...patch });
  };
  return calls;
}

test('PUT without brandPrimaryColor keeps the saved color (column not in the update)', async () => {
  const calls = captureUpdate();
  await configService.update({ name: 'Novo nome' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].patch.brandPrimaryColor, undefined);
  assert.equal(Object.hasOwn(calls[0].payload, 'brand_primary_color'), false);
  assert.equal(calls[0].payload.name, 'Novo nome');
});

test('PUT with brandPrimaryColor null goes back to the default orange', async () => {
  const calls = captureUpdate();
  await configService.update({ brandPrimaryColor: null });
  assert.equal(calls[0].payload.brand_primary_color, null);
});

test('PUT with a valid color saves it normalized', async () => {
  const calls = captureUpdate();
  await configService.update({ brandPrimaryColor: ' #1D4ED8 ' });
  assert.equal(calls[0].payload.brand_primary_color, '#1d4ed8');
});

for (const [label, value, message] of [
  ['wrong format', 'azul', /formato #rrggbb/],
  ['non-string', 42, /formato #rrggbb/],
  ['too light for the themes', '#facc15', /Contraste insuficiente/],
]) {
  test(`PUT with ${label} is refused before reading or writing the database`, async () => {
    restaurantConfigRepository.get = async () => assert.fail('a cor recusada não pode ler o banco');
    restaurantConfigRepository.update = async () => assert.fail('a cor recusada não pode gravar');
    await assert.rejects(configService.update({ brandPrimaryColor: value }), (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.details.field, 'brandPrimaryColor');
      assert.match(error.message, message);
      return true;
    });
  });
}

// ---------- mapeamento e colunas ----------

test('mapper: missing column reads as null; public projection carries the color', () => {
  const domain = toRestaurantConfigDomain({ id: 'c', name: 'R', updated_at: '2026-11-09T00:00:00Z' });
  assert.equal(domain.brandPrimaryColor, null);
  assert.equal(toPublicRestaurantConfig({ name: 'R', brand_primary_color: '#0f766e' }).brandPrimaryColor, '#0f766e');
});

test('repository reads the color in the full and public projections, not in the operational one', async () => {
  const selects = [];
  supabase.from = () => {
    const chain = {
      select(columns) { selects.push(columns.split(',')); return chain; },
      maybeSingle: async () => ({ data: { id: 'c', name: 'R', updated_at: '2026-11-09T00:00:00Z' }, error: null }),
    };
    return chain;
  };
  await restaurantConfigRepository.get();
  await restaurantConfigRepository.getOperational();
  await restaurantConfigRepository.getPublic();
  const [full, operational, publicColumns] = selects;
  assert.ok(full.includes('brand_primary_color'));
  assert.ok(publicColumns.includes('brand_primary_color'));
  assert.equal(operational.includes('brand_primary_color'), false);
});

// ---------- HTTP ----------

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

const putConfig = (role, body) => fetch(`${baseUrl}/config`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwt.sign({ id: `user-${role.toLowerCase()}`, role }, process.env.JWT_SECRET)}`,
  },
  body: JSON.stringify(body),
});

test('HTTP: a color without contrast answers 400 with the reason', async () => {
  restaurantConfigRepository.get = async () => assert.fail('não deve ler');
  const response = await putConfig('ADMIN', { brandPrimaryColor: '#facc15' });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.message, /Contraste insuficiente no tema claro/);
});

test('HTTP: only ADMIN can change the color', async () => {
  restaurantConfigRepository.update = async () => assert.fail('não deve gravar');
  for (const role of ['CASHIER', 'WAITER', 'FINANCE']) {
    const response = await putConfig(role, { brandPrimaryColor: '#1d4ed8' });
    assert.equal(response.status, 403, role);
  }
});

test('HTTP: ADMIN saves a valid color and an omitted field keeps it', async () => {
  const calls = captureUpdate();
  assert.equal((await putConfig('ADMIN', { brandPrimaryColor: '#0F766E' })).status, 200);
  assert.equal((await putConfig('ADMIN', { name: 'Outro' })).status, 200);
  assert.equal(calls[0].payload.brand_primary_color, '#0f766e');
  assert.equal(Object.hasOwn(calls[1].payload, 'brand_primary_color'), false);
});
