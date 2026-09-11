const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';
process.env.FOCUS_NFE_TOKEN = 'test-only-focus-token';
process.env.FOCUS_NFE_BASE_URL = 'https://focus.example.test/v2';

const { invoiceRepository } = require('../src/repositories/invoice.repository');
const { orderRepository } = require('../src/repositories/order.repository');
const { paymentRepository } = require('../src/repositories/payment.repository');
const { productRepository } = require('../src/repositories/product.repository');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');
const { focusNfeService } = require('../src/services/focusNfe.service');
const {
  buildNfcePayload,
  invoiceService,
  isValidCpf,
  mapNfcePaymentMethod,
  normalizeConsumerCpf,
} = require('../src/services/invoice.service');

const original = {
  findOrder: orderRepository.findById,
  findItems: orderRepository.findItems,
  findPayment: paymentRepository.findByOrder,
  findInvoiceByOrder: invoiceRepository.findByOrderId,
  findInvoiceById: invoiceRepository.findById,
  createInvoice: invoiceRepository.create,
  updateInvoice: invoiceRepository.update,
  findProduct: productRepository.findById,
  getConfig: restaurantConfigRepository.get,
  issueNfce: focusNfeService.issueNfce,
  getNfce: focusNfeService.getNfce,
  getNfe: focusNfeService.getNfe,
  fetch: global.fetch,
};

const config = (patch = {}) => ({
  id: 'config-1',
  name: 'Restaurante',
  legalName: 'Restaurante LTDA',
  cnpj: '12345678000188',
  stateRegistration: '123456789',
  taxRegime: '1',
  fiscalStreet: 'Rua B',
  fiscalNumber: '20',
  fiscalNeighborhood: 'Centro',
  fiscalCity: 'Araçatuba',
  fiscalCityIbgeCode: '3502804',
  fiscalState: 'SP',
  fiscalZipCode: '16000000',
  defaultNcm: '21069090',
  defaultCfop: '5102',
  defaultOrigin: '0',
  defaultTaxCode: '102',
  nfceEnabled: true,
  ...patch,
});

const order = (patch = {}) => ({
  id: 'order-1',
  status: 'FINISHED',
  type: 'DINE_IN',
  total: 25,
  deliveryFee: 0,
  customerId: null,
  ...patch,
});

const payment = (method = 'CASH', patch = {}) => ({
  id: 'payment-1',
  orderId: 'order-1',
  method,
  amount: 25,
  status: 'PAID',
  transactionId: null,
  createdAt: new Date(),
  ...patch,
});

const fiscalItems = [{
  id: 'item-1',
  orderId: 'order-1',
  productId: 'product-1',
  quantity: 1,
  weight: null,
  saleType: 'UNIT',
  unitPrice: 25,
  price: 25,
  notes: null,
  product: {
    id: 'product-1',
    name: 'Refeição',
    ncm: '21069090',
    cfop: '5102',
    origin: '0',
    taxCode: '102',
  },
}];

const invoice = (patch = {}) => ({
  id: 'invoice-1',
  customerId: null,
  orderId: 'order-1',
  creditTransactionId: null,
  model: '65',
  consumerDocument: null,
  focusRef: 'nfce_order-1',
  environment: 'homologation',
  status: 'authorized',
  sefazStatus: '100',
  sefazMessage: 'Autorizado o uso da NFC-e',
  accessKey: '3526',
  number: '1',
  series: '1',
  danfeUrl: 'https://focus.example/danfe.pdf',
  xmlUrl: 'https://focus.example/nfce.xml',
  qrcodeUrl: 'https://sefaz.example/consulta?p=3526',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...patch,
});

beforeEach(() => {
  orderRepository.findById = original.findOrder;
  orderRepository.findItems = original.findItems;
  paymentRepository.findByOrder = original.findPayment;
  invoiceRepository.findByOrderId = original.findInvoiceByOrder;
  invoiceRepository.findById = original.findInvoiceById;
  invoiceRepository.create = original.createInvoice;
  invoiceRepository.update = original.updateInvoice;
  productRepository.findById = original.findProduct;
  restaurantConfigRepository.get = original.getConfig;
  focusNfeService.issueNfce = original.issueNfce;
  focusNfeService.getNfce = original.getNfce;
  focusNfeService.getNfe = original.getNfe;
  global.fetch = original.fetch;
});

test('maps every supported paid-at-checkout method to the NFC-e tPag code', () => {
  assert.equal(mapNfcePaymentMethod('CASH'), '01');
  assert.equal(mapNfcePaymentMethod('PIX'), '17');
  assert.equal(mapNfcePaymentMethod('CREDIT_CARD'), '03');
  assert.equal(mapNfcePaymentMethod('DEBIT_CARD'), '04');
  assert.throws(() => mapNfcePaymentMethod('CREDIT'), /fiado/);
});

test('validates and normalizes an optional consumer CPF', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(normalizeConsumerCpf('529.982.247-25'), '52998224725');
  assert.equal(normalizeConsumerCpf(''), null);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.throws(() => normalizeConsumerCpf('123.456.789-00'), /CPF válido/);
});

test('builds an unidentified-consumer payload without CPF fields', () => {
  const payload = buildNfcePayload(
    invoice(),
    order(),
    payment('CASH'),
    fiscalItems,
    config(),
    null,
  );

  assert.equal(payload.presenca_comprador, 1);
  assert.equal(payload.formas_pagamento[0].forma_pagamento, '01');
  assert.equal(payload.formas_pagamento[0].valor_pagamento, 25);
  assert.equal('cpf_destinatario' in payload, false);
  assert.equal('indicador_inscricao_estadual_destinatario' in payload, false);
});

test('builds an identified-consumer payload with CPF and card integration', () => {
  const payload = buildNfcePayload(
    invoice({ consumerDocument: '52998224725' }),
    order(),
    payment('CREDIT_CARD'),
    fiscalItems,
    config(),
    '52998224725',
  );

  assert.equal(payload.cpf_destinatario, '52998224725');
  assert.equal(payload.indicador_inscricao_estadual_destinatario, 9);
  assert.equal(payload.formas_pagamento[0].forma_pagamento, '03');
  assert.equal(payload.formas_pagamento[0].tipo_integracao, 2);
});

test('uses the NFC-e Focus resource for issue and status requests', async () => {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: options.method === 'POST' ? 201 : 200,
      text: async () => JSON.stringify({ status: 'autorizado' }),
    };
  };

  await focusNfeService.issueNfce('nfce ref', { items: [] });
  await focusNfeService.getNfce('nfce ref');

  assert.equal(requests[0].url, 'https://focus.example.test/v2/nfce?ref=nfce+ref');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[1].url, 'https://focus.example.test/v2/nfce/nfce%20ref');
  assert.equal(requests[1].options.method, 'GET');
});

test('returns an authorized invoice without creating a duplicate for the order', async () => {
  const existing = invoice();
  orderRepository.findById = async () => order();
  restaurantConfigRepository.get = async () => config();
  paymentRepository.findByOrder = async () => [payment('PIX')];
  invoiceRepository.findByOrderId = async () => existing;
  invoiceRepository.create = async () => assert.fail('must not create a duplicate invoice');
  focusNfeService.issueNfce = async () => assert.fail('must not submit a duplicate invoice');

  assert.equal(await invoiceService.issueNfce('order-1', null), existing);
});

test('blocks NFC-e when the order is unfinished, unpaid, disabled, or paid on credit', async (t) => {
  await t.test('unfinished order', async () => {
    orderRepository.findById = async () => order({ status: 'DELIVERED' });
    restaurantConfigRepository.get = async () => config();
    await assert.rejects(invoiceService.issueNfce('order-1'), /pedido finalizado/);
  });

  await t.test('unpaid order', async () => {
    orderRepository.findById = async () => order();
    restaurantConfigRepository.get = async () => config();
    paymentRepository.findByOrder = async () => [];
    await assert.rejects(invoiceService.issueNfce('order-1'), /pedido pago/);
  });

  await t.test('disabled configuration', async () => {
    orderRepository.findById = async () => order();
    restaurantConfigRepository.get = async () => config({ nfceEnabled: false });
    await assert.rejects(invoiceService.issueNfce('order-1'), /desabilitada/);
  });

  await t.test('credit payment', async () => {
    orderRepository.findById = async () => order();
    restaurantConfigRepository.get = async () => config();
    paymentRepository.findByOrder = async () => [payment('CREDIT')];
    await assert.rejects(invoiceService.issueNfce('order-1'), /fiado/);
  });
});

test('synchronizes an in-flight NFC-e through the model 65 endpoint', async () => {
  const processing = invoice({ status: 'processing', danfeUrl: null, xmlUrl: null });
  invoiceRepository.findById = async () => processing;
  focusNfeService.getNfe = async () => assert.fail('must not query the NF-e resource');
  focusNfeService.getNfce = async (ref) => {
    assert.equal(ref, processing.focusRef);
    return { status: 'autorizado', caminho_danfe: '/cupom.pdf' };
  };
  invoiceRepository.update = async (_id, patch) => ({ ...processing, ...patch });

  const result = await invoiceService.getInvoiceStatus(processing.id);
  assert.equal(result.status, 'authorized');
  assert.equal(result.danfeUrl, 'https://focus.example.test/cupom.pdf');
});

test('reissues a rejected NFC-e with a fresh ref and persists the synchronous result', async () => {
  const rejected = invoice({ status: 'error', focusRef: 'consumed-ref' });
  let created;
  let submitted;

  orderRepository.findById = async () => order();
  restaurantConfigRepository.get = async () => config();
  paymentRepository.findByOrder = async () => [payment('PIX')];
  invoiceRepository.findByOrderId = async () => rejected;
  invoiceRepository.create = async (candidate) => {
    created = candidate;
    return candidate;
  };
  invoiceRepository.update = async (_id, patch) => ({ ...created, ...patch });
  orderRepository.findItems = async () => fiscalItems.map(({ product: _product, ...item }) => item);
  productRepository.findById = async () => fiscalItems[0].product;
  focusNfeService.issueNfce = async (ref, payload) => {
    submitted = { ref, payload };
    return {
      status: 'autorizado',
      status_sefaz: '100',
      mensagem_sefaz: 'Autorizado o uso da NFC-e',
      caminho_danfe: '/danfe.pdf',
      caminho_xml_nota_fiscal: '/nfce.xml',
      qrcode_url: 'https://sefaz.example/consulta?p=123',
    };
  };

  const result = await invoiceService.issueNfce('order-1', '529.982.247-25');
  assert.notEqual(created.focusRef, rejected.focusRef);
  assert.equal(created.model, '65');
  assert.equal(created.customerId, null);
  assert.equal(created.consumerDocument, '52998224725');
  assert.equal(submitted.ref, created.focusRef);
  assert.equal(submitted.payload.formas_pagamento[0].forma_pagamento, '17');
  assert.equal(result.status, 'authorized');
  assert.equal(result.qrcodeUrl, 'https://sefaz.example/consulta?p=123');
});
