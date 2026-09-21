const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';

const {
  detectImageMime,
  validateBrandingImage,
  toPublicRestaurantConfig,
} = require('../src/services/branding.service');
const { configService } = require('../src/services/domain.services');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');

const image = (mimetype, bytes, size = bytes.length) => ({
  mimetype,
  buffer: Buffer.from(bytes),
  originalname: 'marca.png',
  size,
});

test('public config exposes only identity and public ordering fields', () => {
  const publicConfig = toPublicRestaurantConfig({
    name: 'Restaurante',
    logoUrl: 'logo.png',
    bannerUrl: 'banner.png',
    openingHours: '11h às 14h',
    openingDays: 'segunda a domingo',
    deliveryFee: 5,
    enabledPayments: 'CASH,PIX',
    cnpj: '00000000000100',
    legalName: 'Razão Social',
    stateRegistration: '123',
    fiscalStreet: 'Rua Fiscal',
    nfceCsc: 'segredo',
  });

  assert.deepEqual(publicConfig, {
    name: 'Restaurante',
    logoUrl: 'logo.png',
    bannerUrl: 'banner.png',
    openingHours: '11h às 14h',
    openingDays: 'segunda a domingo',
    deliveryFee: 5,
    enabledPayments: 'CASH,PIX',
  });
});

test('configuration preserves zero for every delivery fee and rejects negative values', async () => {
  restaurantConfigRepository.get = async () => ({
    id: 'config',
    nfceGroupItems: false,
    nfceGroupedItemDescription: 'REFEICAO',
  });
  let saved;
  restaurantConfigRepository.update = async (_id, patch) => {
    saved = patch;
    return patch;
  };

  await configService.update({
    deliveryFee: 0,
    urbanDeliveryFee: 0,
    ruralDeliveryFee: 0,
  });

  assert.equal(saved.deliveryFee, 0);
  assert.equal(saved.urbanDeliveryFee, 0);
  assert.equal(saved.ruralDeliveryFee, 0);
  await assert.rejects(
    configService.update({ urbanDeliveryFee: -1 }),
    error => error.status === 400 && /taxa de entrega válida/.test(error.message)
  );
});

test('detects the supported image formats from binary signatures', () => {
  assert.equal(detectImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xdb])), 'image/jpeg');
  assert.equal(detectImageMime(Buffer.from('RIFF0000WEBP', 'ascii')), 'image/webp');
  assert.equal(detectImageMime(Buffer.from('%PDF-1.7')), null);
});

test('rejects a declared type that does not match the file contents', () => {
  assert.throws(
    () => validateBrandingImage(image('image/png', [0xff, 0xd8, 0xff]), 'logo'),
    /conteúdo do arquivo não corresponde/
  );
});

test('enforces separate size limits for logo and banner', () => {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  assert.throws(
    () => validateBrandingImage(image('image/png', png, 2 * 1024 * 1024 + 1), 'logo'),
    /limite de 2 MB/
  );
  assert.equal(
    validateBrandingImage(image('image/png', png, 2 * 1024 * 1024 + 1), 'banner'),
    'image/png'
  );
  assert.throws(
    () => validateBrandingImage(image('image/png', png, 4 * 1024 * 1024 + 1), 'banner'),
    /limite de 4 MB/
  );
});

test('rejects SVG with a clear security message', () => {
  assert.throws(
    () => validateBrandingImage(image('image/svg+xml', Buffer.from('<svg><script /></svg>')), 'logo'),
    /SVG não são aceitos/
  );
});
