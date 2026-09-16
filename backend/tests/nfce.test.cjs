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
const { configService } = require('../src/services/domain.services');
const {
  buildFocusItems,
  buildNfceItems,
  buildNfcePayload,
  invoiceService,
  isValidCpf,
  mapNfcePaymentMethod,
  normalizeConsumerCpf,
  parseTaxRegime,
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
  updateConfig: restaurantConfigRepository.update,
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
  taxRegime: '4',
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
  nfceGroupItems: false,
  nfceGroupedItemDescription: 'REFEICAO',
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

const multipleFiscalItems = [
  {
    ...fiscalItems[0],
    id: 'item-meal',
    quantity: 2,
    unitPrice: 10.005,
    price: 20.01,
    product: {
      ...fiscalItems[0].product,
      id: 'product-meal',
      name: 'Almoço',
      ncm: '99999999',
      cfop: '5949',
      origin: '1',
      taxCode: '400',
    },
  },
  {
    ...fiscalItems[0],
    id: 'item-drink',
    productId: 'product-drink',
    quantity: 3,
    unitPrice: 6.666,
    price: 20,
    product: {
      ...fiscalItems[0].product,
      id: 'product-drink',
      name: 'Coca Lata',
    },
  },
];

const threeFiscalItems = ['Prato', 'Bebida', 'Sobremesa'].map((name, index) => ({
  ...fiscalItems[0],
  id: 'item-' + (index + 1),
  productId: 'product-' + (index + 1),
  unitPrice: (index + 1) * 10,
  price: (index + 1) * 10,
  product: {
    ...fiscalItems[0].product,
    id: 'product-' + (index + 1),
    name,
  },
}));

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
  invoiceRepository.findActiveByOrderId = async () => null;
  orderRepository.findById = original.findOrder;
  orderRepository.findItems = original.findItems;
  paymentRepository.findByOrder = original.findPayment;
  invoiceRepository.findByOrderId = original.findInvoiceByOrder;
  invoiceRepository.findById = original.findInvoiceById;
  invoiceRepository.create = original.createInvoice;
  invoiceRepository.update = original.updateInvoice;
  productRepository.findById = original.findProduct;
  restaurantConfigRepository.get = original.getConfig;
  restaurantConfigRepository.update = original.updateConfig;
  focusNfeService.issueNfce = original.issueNfce;
  focusNfeService.getNfce = original.getNfce;
  focusNfeService.getNfe = original.getNfe;
  global.fetch = original.fetch;
});

test('uses the configured CRT 4 and rejects missing or invalid tax regimes', () => {
  assert.equal(parseTaxRegime(config({ taxRegime: '4' })), 4);
  assert.equal(parseTaxRegime(config({ taxRegime: 'SIMPLES_NACIONAL_MEI' })), 4);
  assert.throws(() => parseTaxRegime(config({ taxRegime: null })), /CRT 1, 2, 3 ou 4/);
  assert.throws(() => parseTaxRegime(config({ taxRegime: '5' })), /CRT 1, 2, 3 ou 4/);
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

  assert.equal(payload.regime_tributario_emitente, 4);
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

test('validates, trims and persists grouped NFC-e configuration', async () => {
  let savedPatch;
  restaurantConfigRepository.get = async () => config();
  restaurantConfigRepository.update = async (_id, patch) => {
    savedPatch = patch;
    return config(patch);
  };

  const updated = await configService.update({
    nfceGroupItems: true,
    nfceGroupedItemDescription: '  REFEICAO ESPECIAL  ',
  });
  assert.equal(updated.nfceGroupItems, true);
  assert.equal(updated.nfceGroupedItemDescription, 'REFEICAO ESPECIAL');
  assert.equal(savedPatch.nfceGroupedItemDescription, 'REFEICAO ESPECIAL');

  await assert.rejects(
    configService.update({
      nfceGroupItems: true,
      nfceGroupedItemDescription: '   ',
    }),
    /entre 1 e 120 caracteres/,
  );
});

test('keeps individual NFC-e items when grouping is disabled', () => {
  const items = buildNfceItems(multipleFiscalItems, config({ nfceGroupItems: false }));
  assert.equal(items.length, 2);
  assert.equal(items[0].descricao, 'Almoço');
  assert.equal(items[1].descricao, 'Coca Lata');
});

test('groups meals, drinks and quantities into one configured NFC-e item', () => {
  const items = buildNfceItems(multipleFiscalItems, config({
    nfceGroupItems: true,
    nfceGroupedItemDescription: ' REFEICAO COMPLETA ',
  }));

  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    numero_item: 1,
    codigo_produto: 'REFEICAO',
    descricao: 'REFEICAO COMPLETA',
    cfop: '5102',
    unidade_comercial: 'un',
    quantidade_comercial: 1,
    valor_unitario_comercial: 40.01,
    valor_unitario_tributavel: 40.01,
    unidade_tributavel: 'un',
    codigo_ncm: '21069090',
    quantidade_tributavel: 1,
    valor_bruto: 40.01,
    icms_situacao_tributaria: 102,
    icms_origem: 0,
    pis_situacao_tributaria: '07',
    cofins_situacao_tributaria: '07',
  });
});

test('keeps NF-e item generation individual when NFC-e grouping is enabled', () => {
  const items = buildFocusItems(multipleFiscalItems, config({ nfceGroupItems: true }));
  assert.equal(items.length, 2);
  assert.equal(items[0].codigo_produto, 'product-meal');
  assert.equal(items[1].codigo_produto, 'product-drink');
});

test('validates grouped totals with delivery fee and cent rounding', () => {
  const payload = buildNfcePayload(
    invoice(),
    order({ total: 45.02, deliveryFee: 5.01 }),
    payment('PIX', { amount: 45.02 }),
    multipleFiscalItems,
    config({ nfceGroupItems: true }),
    null,
  );

  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].valor_outras_despesas, 5.01);
  assert.equal(payload.valor_produtos, 40.01);
  assert.equal(payload.valor_outras_despesas, 5.01);
  assert.equal(payload.valor_desconto, 0);
  assert.equal(payload.valor_total, 45.02);

  assert.throws(
    () => buildNfcePayload(
      invoice(),
      order({ total: 44.02, deliveryFee: 5.01 }),
      payment('PIX', { amount: 44.02 }),
      multipleFiscalItems,
      config({ nfceGroupItems: true }),
      null,
    ),
    /diverge do total do pedido/,
  );
});

test('distributes delivery fee in cents across grouped and individual NFC-e items', () => {
  for (const [grouped, expectedExpenses] of [
    [true, [5]],
    [false, [0.83, 1.67, 2.5]],
  ]) {
    const payload = buildNfcePayload(
      invoice(),
      order({ total: 65, deliveryFee: 5 }),
      payment('PIX', { amount: 65 }),
      threeFiscalItems,
      config({ nfceGroupItems: grouped }),
      null,
    );

    assert.deepEqual(
      payload.items.map((item) => item.valor_outras_despesas),
      expectedExpenses,
    );
    assert.equal(
      payload.items.reduce((sum, item) => sum + Math.round(item.valor_outras_despesas * 100), 0),
      500,
    );
    assert.equal(payload.valor_outras_despesas, 5);
    assert.equal(payload.valor_total, 65);
  }
});

test('rejects an empty or zero-value NFC-e item set', () => {
  assert.throws(
    () => buildNfceItems([], config({ nfceGroupItems: true })),
    /Pedido sem itens/,
  );
  assert.throws(
    () => buildNfceItems(
      [{ ...fiscalItems[0], price: 0 }],
      config({ nfceGroupItems: true }),
    ),
    /subtotal dos produtos deve ser maior que zero/,
  );
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

test('blocks a divergent NFC-e total before persistence and before calling Focus', async () => {
  orderRepository.findById = async () => order({ total: 24.99 });
  restaurantConfigRepository.get = async () => config({ nfceGroupItems: true });
  paymentRepository.findByOrder = async () => [payment('PIX', { amount: 24.99 })];
  invoiceRepository.findByOrderId = async () => null;
  orderRepository.findItems = async () => fiscalItems.map(({ product: _product, ...item }) => item);
  productRepository.findById = async () => fiscalItems[0].product;
  invoiceRepository.create = async () => assert.fail('must not persist a divergent NFC-e');
  focusNfeService.issueNfce = async () => assert.fail('must not submit a divergent NFC-e');

  await assert.rejects(
    invoiceService.issueNfce('order-1'),
    /diverge do total do pedido/,
  );
});

const { customerRepository } = require('../src/repositories/customer.repository');
const { creditTransactionRepository } = require('../src/repositories/creditTransaction.repository');
const { DomainError } = require('../src/types/errors');
const { normalizeConsumerDocument, isValidCnpj } = require('../src/services/invoice.service');

const fiscalCustomer = (patch = {}) => ({
  id: 'pj-1', name: 'Empresa', legalName: 'Empresa LTDA', personType: 'PJ',
  document: '11222333000181', stateRegistration: 'ISENTO', phone: '18999999999',
  fiscalStreet: 'Rua A', fiscalNumber: '10', fiscalNeighborhood: 'Centro',
  fiscalCity: 'Araçatuba', fiscalCityIbgeCode: '3502804', fiscalState: 'SP',
  fiscalZipCode: '16000000', ...patch,
});

const setupPaidSale = () => {
  const rows = [];
  const submissions = [];
  orderRepository.findById = async () => order({ deliveryFee: 5, total: 30 });
  paymentRepository.findByOrder = async () => [payment('PIX', { amount: 30 })];
  customerRepository.findById = async () => fiscalCustomer();
  restaurantConfigRepository.get = async () => config();
  orderRepository.findItems = async () => fiscalItems;
  productRepository.findById = async () => fiscalItems[0].product;
  invoiceRepository.findByOrderId = async () => rows.at(-1) ?? null;
  invoiceRepository.findById = async id => rows.find(row => row.id === id);
  invoiceRepository.findActiveByOrderId = async () => rows.find(row => ['authorized', 'pending', 'processing'].includes(row.status)) ?? null;
  invoiceRepository.create = async candidate => {
    if (rows.some(row => ['authorized', 'pending', 'processing'].includes(row.status))) {
      throw new DomainError('Documento fiscal já reservado', { status: 409 });
    }
    rows.push(candidate);
    return candidate;
  };
  invoiceRepository.update = async (id, patch) => {
    const row = rows.find(row => row.id === id);
    Object.assign(row, patch);
    return row;
  };
  focusNfeService.issueNfe = focusNfeService.issueNfce = async (ref, payload) => {
    submissions.push({ ref, payload });
    return { status: 'autorizado', caminho_danfe: '/danfe.pdf', caminho_xml_nota_fiscal: '/nota.xml' };
  };
  return { rows, submissions };
};

test('validates CPF/CNPJ and builds mutually exclusive recipient fields', () => {
  assert.equal(normalizeConsumerDocument('11.222.333/0001-81'), '11222333000181');
  assert.equal(normalizeConsumerDocument('529.982.247-25'), '52998224725');
  assert.equal(normalizeConsumerDocument(' '), null);
  for (const value of ['11111111111111', '11222333000180', 'abc', '1234', 'x11222333000181']) {
    assert.throws(() => normalizeConsumerDocument(value), /CPF ou CNPJ válido/);
  }
  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  for (const document of [null, '52998224725', '11222333000181']) {
    const payload = buildNfcePayload(invoice(), order(), payment(), fiscalItems, config(), document);
    assert.equal('cpf_destinatario' in payload, document?.length === 11);
    assert.equal('cnpj_destinatario' in payload, document?.length === 14);
    if (document?.length === 14) assert.equal(payload.cnpj_destinatario, document);
  }
});

test('issues paid-upfront NF-e with full PJ data for every checkout payment method', async () => {
  for (const [method, code] of [['CASH', '01'], ['PIX', '17'], ['CREDIT_CARD', '03'], ['DEBIT_CARD', '04']]) {
    const { submissions } = setupPaidSale();
    paymentRepository.findByOrder = async () => [payment(method, { amount: 30 })];
    const result = await invoiceService.issueOrderInvoice('order-1', 'pj-1');
    const payload = submissions[0].payload;
    assert.equal(result.model, '55');
    assert.equal(result.customerId, 'pj-1');
    assert.equal(result.creditTransactionId, null);
    assert.equal(result.status, 'authorized');
    assert.ok(result.danfeUrl && result.xmlUrl);
    assert.equal(payload.cnpj_destinatario, '11222333000181');
    assert.equal(payload.logradouro_destinatario, 'Rua A');
    assert.equal(payload.codigo_municipio_destinatario, '3502804');
    assert.equal(payload.cep_destinatario, '16000000');
    assert.equal(payload.regime_tributario_emitente, 4);
    assert.equal(payload.valor_total, 30);
    assert.equal(payload.valor_outras_despesas, 5);
    assert.equal(payload.formas_pagamento[0].forma_pagamento, code);
    assert.equal(payload.formas_pagamento[0].valor_pagamento, 30);
  }
});

test('distributes delivery fee proportionally across NF-e items with remainder on the last item', async () => {
  const { submissions } = setupPaidSale();
  orderRepository.findById = async () => order({ deliveryFee: 5, total: 65 });
  paymentRepository.findByOrder = async () => [payment('PIX', { amount: 65 })];
  orderRepository.findItems = async () => threeFiscalItems.map(({ product: _product, ...item }) => item);
  productRepository.findById = async id => threeFiscalItems.find(item => item.productId === id).product;

  await invoiceService.issueOrderInvoice('order-1', 'pj-1');
  const payload = submissions[0].payload;

  assert.deepEqual(
    payload.items.map((item) => item.valor_outras_despesas),
    [0.83, 1.67, 2.5],
  );
  assert.equal(
    payload.items.reduce((sum, item) => sum + Math.round(item.valor_outras_despesas * 100), 0),
    500,
  );
  assert.equal(payload.valor_outras_despesas, 5);
  assert.equal(payload.valor_total, 65);
});

test('rejects missing recipient, PF, incomplete fiscal data, unpaid and unfinished orders before persistence', async () => {
  for (const [change, recipient, message] of [
    [() => {}, '', /Selecione um cliente PJ/],
    [() => { customerRepository.findById = async () => fiscalCustomer({ personType: 'PF' }); }, 'pj-1', /cliente PJ/],
    [() => { customerRepository.findById = async () => fiscalCustomer({ fiscalCityIbgeCode: null }); }, 'pj-1', /fiscalCityIbgeCode/],
    [() => { paymentRepository.findByOrder = async () => []; }, 'pj-1', /pedido pago/],
    [() => { orderRepository.findById = async () => order({ status: 'NEW' }); }, 'pj-1', /pedido finalizado/],
  ]) {
    const { rows, submissions } = setupPaidSale();
    change();
    await assert.rejects(invoiceService.issueOrderInvoice('order-1', recipient), message);
    assert.equal(rows.length, 0);
    assert.equal(submissions.length, 0);
  }
});

test('blocks cross-model documents in either direction for authorized and in-flight sales', async () => {
  for (const model of ['55', '65']) for (const status of ['authorized', 'pending', 'processing']) {
    const { rows, submissions } = setupPaidSale();
    rows.push(invoice({ model, status }));
    const issue = model === '55' ? invoiceService.issueNfce('order-1') : invoiceService.issueOrderInvoice('order-1', 'pj-1');
    await assert.rejects(issue, error => error.code === 'FISCAL_DOCUMENT_CONFLICT' && error.status === 409);
    assert.equal(submissions.length, 0);
    assert.equal(rows.length, 1);
  }
});

test('reserves a sale before either concurrent model can submit to Focus', async () => {
  const { rows, submissions } = setupPaidSale();
  const results = await Promise.allSettled([
    invoiceService.issueNfce('order-1'), invoiceService.issueOrderInvoice('order-1', 'pj-1'),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(rows.length, 1);
  assert.equal(submissions.length, 1);
});

test('keeps the sale reserved after a timeout and reconciles by the same reference', async () => {
  const { rows } = setupPaidSale();
  focusNfeService.issueNfe = async () => { throw new Error('timeout'); };
  const result = await invoiceService.issueOrderInvoice('order-1', 'pj-1');
  assert.equal(result.status, 'processing');
  await assert.rejects(invoiceService.issueNfce('order-1'), /em processamento/);
  focusNfeService.getNfe = async ref => {
    assert.equal(ref, rows[0].focusRef);
    return { status: 'autorizado' };
  };
  assert.equal((await invoiceService.getInvoiceStatus(result.id)).status, 'authorized');
});

test('does not release a successfully submitted sale if saving the Focus result fails', async () => {
  const { rows, submissions } = setupPaidSale();
  invoiceRepository.update = async () => { throw new Error('database unavailable'); };
  await assert.rejects(invoiceService.issueOrderInvoice('order-1', 'pj-1'), /database unavailable/);
  assert.equal(rows[0].status, 'pending');
  await assert.rejects(invoiceService.issueNfce('order-1'), /em processamento/);
  assert.equal(submissions.length, 1);
});

test('allows a fresh NF-e attempt after rejection and preserves the credit entry point', async () => {
  const { rows } = setupPaidSale();
  rows.push(invoice({ model: '55', status: 'error' }));
  const result = await invoiceService.issueOrderInvoice('order-1', 'pj-1');
  assert.notEqual(result.focusRef, rows[0].focusRef);
  const originalIssue = invoiceService.issueCreditInvoice;
  paymentRepository.findByOrder = async () => [payment('CREDIT')];
  creditTransactionRepository.findChargeByOrder = async () => ({ id: 'charge-1', customerId: 'pj-1' });
  invoiceService.issueCreditInvoice = async id => { assert.equal(id, 'charge-1'); return result; };
  try { assert.equal(await invoiceService.issueOrderInvoice('order-1', 'pj-1'), result); }
  finally { invoiceService.issueCreditInvoice = originalIssue; }
});
