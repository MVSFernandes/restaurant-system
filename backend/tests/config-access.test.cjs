const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const { configService } = require('../src/services/domain.services');
const { brandingService } = require('../src/services/branding.service');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');
const {
  toOperationalRestaurantConfig,
  toRestaurantConfigDomain,
} = require('../src/mappers/restaurantConfig.mapper');

const originals = {
  get: restaurantConfigRepository.get,
  getOperational: restaurantConfigRepository.getOperational,
  getPublic: restaurantConfigRepository.getPublic,
};

afterEach(() => {
  restaurantConfigRepository.get = originals.get;
  restaurantConfigRepository.getOperational = originals.getOperational;
  restaurantConfigRepository.getPublic = originals.getPublic;
});

const databaseRow = {
  id: 'config-1',
  name: 'Restaurante',
  address: 'Rua pública',
  phone: '11999999999',
  logo_url: 'logo.png',
  banner_url: 'banner.png',
  opening_hours: '11h às 23h',
  opening_days: 'segunda a domingo',
  delivery_fee: 5,
  urban_delivery_fee: 7,
  rural_delivery_fee: 12,
  enabled_payments: 'CASH,PIX',
  cnpj: '00000000000100',
  legal_name: 'Razão Social',
  state_registration: '123',
  tax_regime: '4',
  fiscal_city_ibge_code: '3502804',
  fiscal_zip_code: '16000000',
  fiscal_street: 'Rua Fiscal',
  fiscal_number: '10',
  fiscal_neighborhood: 'Centro',
  fiscal_city: 'Araçatuba',
  fiscal_state: 'SP',
  default_cfop: '5102',
  default_ncm: '21069090',
  default_origin: '0',
  default_tax_code: '102',
  nfce_enabled: true,
  nfce_group_items: false,
  nfce_grouped_item_description: 'REFEICAO',
  updated_at: '2026-09-30T12:00:00.000Z',
};

test('cashier and waiter projections contain only operational fields', async () => {
  const operational = toOperationalRestaurantConfig(databaseRow);
  restaurantConfigRepository.getOperational = async () => operational;
  restaurantConfigRepository.get = async () => assert.fail('non-admin must not load fiscal configuration');

  const expected = {
    name: 'Restaurante',
    logoUrl: 'logo.png',
    urbanDeliveryFee: 7,
    ruralDeliveryFee: 12,
    nfceEnabled: true,
  };
  assert.deepEqual(await configService.getForRole('CASHIER'), expected);
  assert.deepEqual(await configService.getForRole('WAITER'), expected);
  for (const field of ['cnpj', 'legalName', 'stateRegistration', 'taxRegime', 'fiscalStreet', 'defaultCfop', 'defaultNcm']) {
    assert.equal(Object.hasOwn(expected, field), false);
  }
});

test('admin projection preserves the complete configuration', async () => {
  const complete = toRestaurantConfigDomain(databaseRow);
  restaurantConfigRepository.get = async () => complete;
  restaurantConfigRepository.getOperational = async () => assert.fail('admin must load the full projection');

  const response = await configService.getForRole('ADMIN');
  assert.equal(response.cnpj, databaseRow.cnpj);
  assert.equal(response.legalName, databaseRow.legal_name);
  assert.equal(response.taxRegime, databaseRow.tax_regime);
  assert.equal(response.defaultCfop, databaseRow.default_cfop);
  assert.equal(response.nfceEnabled, true);
});

test('public branding stays limited to public identity and ordering fields', async () => {
  const publicConfig = {
    name: 'Restaurante',
    logoUrl: 'logo.png',
    bannerUrl: 'banner.png',
    openingHours: '11h às 23h',
    openingDays: 'segunda a domingo',
    deliveryFee: 5,
    enabledPayments: 'CASH,PIX',
  };
  restaurantConfigRepository.getPublic = async () => publicConfig;
  restaurantConfigRepository.get = async () => assert.fail('public branding must not load fiscal configuration');
  assert.deepEqual(await brandingService.getPublicConfig(), publicConfig);
});

test('restaurant config repository never uses wildcard selects', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/repositories/restaurantConfig.repository.ts'),
    'utf8'
  );
  assert.doesNotMatch(source, /\.select\(\s*['\"]\*['\"]\s*\)/);
  assert.match(source, /FULL_CONFIG_COLUMNS/);
  assert.match(source, /OPERATIONAL_CONFIG_COLUMNS/);
  assert.match(source, /PUBLIC_CONFIG_COLUMNS/);
});
