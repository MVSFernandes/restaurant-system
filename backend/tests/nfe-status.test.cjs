const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://database.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';
process.env.FOCUS_NFE_TOKEN = 'test-only-focus-token';
process.env.FOCUS_NFE_BASE_URL = 'https://focus.example.test/v2';

const { invoiceRepository } = require('../src/repositories/invoice.repository');
const { creditTransactionRepository } = require('../src/repositories/creditTransaction.repository');
const { customerRepository } = require('../src/repositories/customer.repository');
const { orderRepository } = require('../src/repositories/order.repository');
const { productRepository } = require('../src/repositories/product.repository');
const { restaurantConfigRepository } = require('../src/repositories/restaurantConfig.repository');
const {
  focusNfeService,
  mapFocusInvoiceFields,
  normalizeFocusStatus,
} = require('../src/services/focusNfe.service');
const {
  buildRecipientIeFields,
  invoiceService,
} = require('../src/services/invoice.service');

const original = {
  findInvoiceById: invoiceRepository.findById,
  findInvoiceByCredit: invoiceRepository.findByCreditTransactionId,
  createInvoice: invoiceRepository.create,
  updateInvoice: invoiceRepository.update,
  getNfe: focusNfeService.getNfe,
  issueNfe: focusNfeService.issueNfe,
  findCharge: creditTransactionRepository.findById,
  findCustomer: customerRepository.findById,
  findItems: orderRepository.findItems,
  findProduct: productRepository.findById,
  getConfig: restaurantConfigRepository.get,
  fetch: global.fetch,
};

const invoice = (patch = {}) => ({
  id: 'invoice-old',
  customerId: 'customer-1',
  orderId: 'order-1',
  creditTransactionId: 'charge-1',
  focusRef: 'consumed-ref',
  environment: 'homologation',
  status: 'processing',
  sefazStatus: null,
  sefazMessage: null,
  accessKey: null,
  number: null,
  series: null,
  danfeUrl: null,
  xmlUrl: null,
  createdAt: new Date('2026-09-10T10:00:00Z'),
  updatedAt: new Date('2026-09-10T10:00:00Z'),
  ...patch,
});

beforeEach(() => {
  Object.assign(invoiceRepository, {
    findById: original.findInvoiceById,
    findByCreditTransactionId: original.findInvoiceByCredit,
    create: original.createInvoice,
    update: original.updateInvoice,
  });
  focusNfeService.getNfe = original.getNfe;
  focusNfeService.issueNfe = original.issueNfe;
  creditTransactionRepository.findById = original.findCharge;
  customerRepository.findById = original.findCustomer;
  orderRepository.findItems = original.findItems;
  productRepository.findById = original.findProduct;
  restaurantConfigRepository.get = original.getConfig;
  global.fetch = original.fetch;
});

afterEach(() => {
  global.fetch = original.fetch;
});

test('maps every authorized field returned by Focus and normalizes download URLs', () => {
  assert.deepEqual(
    mapFocusInvoiceFields({
      status: 'autorizado',
      status_sefaz: 100,
      mensagem_sefaz: 'Autorizado o uso da NF-e',
      chave_nfe: '3526',
      numero: 42,
      serie: 1,
      caminho_danfe: '/arquivos/danfe.pdf',
      caminho_xml_nota_fiscal: '/arquivos/nfe.xml',
    }),
    {
      status: 'authorized',
      sefazStatus: '100',
      sefazMessage: 'Autorizado o uso da NF-e',
      accessKey: '3526',
      number: '42',
      series: '1',
      danfeUrl: 'https://focus.example.test/arquivos/danfe.pdf',
      xmlUrl: 'https://focus.example.test/arquivos/nfe.xml',
    },
  );
  assert.equal(normalizeFocusStatus('rejeitada'), 'error');
  assert.equal(normalizeFocusStatus('denegado'), 'error');
});

test('queries the documented Focus endpoint by encoded ref using GET', async () => {
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 'processando_autorizacao' }),
    };
  };

  assert.deepEqual(await focusNfeService.getNfe('ref with spaces'), {
    status: 'processando_autorizacao',
  });
  assert.equal(request.url, 'https://focus.example.test/v2/nfe/ref%20with%20spaces');
  assert.equal(request.options.method, 'GET');
  assert.match(request.options.headers.Authorization, /^Basic /);
});

test('synchronizes a processing invoice and persists the Focus result', async () => {
  const current = invoice();
  let queriedRef;
  let update;
  invoiceRepository.findById = async () => current;
  focusNfeService.getNfe = async (ref) => {
    queriedRef = ref;
    return {
      status: 'autorizado',
      status_sefaz: '100',
      mensagem_sefaz: 'Autorizada',
      chave_nfe: 'key',
      numero: '9',
      serie: '1',
      danfe_url: 'https://focus.example/danfe',
      xml_url: 'https://focus.example/xml',
    };
  };
  invoiceRepository.update = async (id, patch) => {
    update = { id, patch };
    return { ...current, ...patch };
  };

  const result = await invoiceService.getInvoiceStatus(current.id);
  assert.equal(queriedRef, current.focusRef);
  assert.equal(update.id, current.id);
  assert.equal(update.patch.status, 'authorized');
  assert.equal(result.danfeUrl, 'https://focus.example/danfe');
  assert.equal(result.xmlUrl, 'https://focus.example/xml');
});

test('does not query Focus again for a final invoice', async () => {
  const current = invoice({ status: 'authorized' });
  invoiceRepository.findById = async () => current;
  focusNfeService.getNfe = async () => assert.fail('Focus must not be queried');
  assert.equal(await invoiceService.getInvoiceStatus(current.id), current);
});

test('maps numeric recipient IE to indicator 1 and strips punctuation', () => {
  assert.deepEqual(buildRecipientIeFields(' 123.456.789-110 '), {
    indicador_inscricao_estadual_destinatario: 1,
    inscricao_estadual_destinatario: '123456789110',
  });
});

test('maps empty or non-numeric recipient IE to indicator 9 and omits IE', () => {
  for (const value of ['', null, 'ISENTO', 'isento', '12A34']) {
    const fields = buildRecipientIeFields(value);
    assert.deepEqual(fields, { indicador_inscricao_estadual_destinatario: 9 });
    assert.equal('inscricao_estadual_destinatario' in fields, false);
  }
});

test('re-issues a rejected invoice as a new row with a fresh Focus ref', async () => {
  const rejected = invoice({
    status: 'error',
    sefazStatus: '728',
    sefazMessage: 'NF-e sem informação da IE do destinatário',
  });
  let created;
  let submitted;
  let oldUpdates = 0;

  creditTransactionRepository.findById = async () => ({
    id: 'charge-1',
    type: 'CHARGE',
    customerId: 'customer-1',
    orderId: 'order-1',
  });
  invoiceRepository.findByCreditTransactionId = async () => rejected;
  invoiceRepository.create = async (candidate) => {
    created = candidate;
    return candidate;
  };
  invoiceRepository.update = async (id, patch) => {
    if (id === rejected.id) oldUpdates += 1;
    return { ...created, ...patch };
  };
  orderRepository.findItems = async () => [{
    id: 'item-1',
    orderId: 'order-1',
    productId: 'product-1',
    quantity: 1,
    weight: null,
    saleType: 'UNIT',
    unitPrice: 25,
    price: 25,
    notes: null,
  }];
  productRepository.findById = async () => ({
    id: 'product-1',
    name: 'Produto',
    ncm: '21069090',
    cfop: '5102',
    origin: '0',
    taxCode: '102',
  });
  customerRepository.findById = async () => ({
    id: 'customer-1',
    name: 'Cliente',
    legalName: 'Cliente LTDA',
    personType: 'PJ',
    document: '12345678000199',
    stateRegistration: 'ISENTO',
    phone: '18999999999',
    fiscalStreet: 'Rua A',
    fiscalNumber: '10',
    fiscalNeighborhood: 'Centro',
    fiscalCity: 'Araçatuba',
    fiscalCityIbgeCode: '3502804',
    fiscalState: 'SP',
    fiscalZipCode: '16000000',
  });
  restaurantConfigRepository.get = async () => ({
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
  });
  focusNfeService.issueNfe = async (ref, payload) => {
    submitted = { ref, payload };
    return { status: 'processando_autorizacao' };
  };

  const result = await invoiceService.issueCreditInvoice('charge-1');
  assert.notEqual(created.id, rejected.id);
  assert.notEqual(created.focusRef, rejected.focusRef);
  assert.equal(created.creditTransactionId, rejected.creditTransactionId);
  assert.equal(submitted.ref, created.focusRef);
  assert.equal(submitted.payload.indicador_inscricao_estadual_destinatario, 9);
  assert.equal('inscricao_estadual_destinatario' in submitted.payload, false);
  assert.equal(result.status, 'processing');
  assert.equal(oldUpdates, 0);
});

test('does not resubmit an authorized or in-flight invoice', async () => {
  creditTransactionRepository.findById = async () => ({
    id: 'charge-1',
    type: 'CHARGE',
    customerId: 'customer-1',
    orderId: 'order-1',
  });
  for (const status of ['authorized', 'pending', 'processing']) {
    const current = invoice({ status });
    invoiceRepository.findByCreditTransactionId = async () => current;
    invoiceRepository.create = async () => assert.fail('must not create another invoice');
    focusNfeService.issueNfe = async () => assert.fail('must not resubmit to Focus');
    assert.equal(await invoiceService.issueCreditInvoice('charge-1'), current);
  }
});
