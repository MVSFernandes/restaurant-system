import { createId } from '@paralleldrive/cuid2';
import { creditTransactionRepository } from '../repositories/creditTransaction.repository';
import { customerRepository } from '../repositories/customer.repository';
import { invoiceRepository } from '../repositories/invoice.repository';
import { orderRepository } from '../repositories/order.repository';
import { paymentRepository } from '../repositories/payment.repository';
import { productRepository } from '../repositories/product.repository';
import { restaurantConfigRepository } from '../repositories/restaurantConfig.repository';
import { focusNfeService, mapFocusInvoiceFields } from './focusNfe.service';
import {
  Invoice,
  Order,
  OrderItem,
  Payment,
  PaymentMethod,
  Product,
  RestaurantConfig,
} from '../types/domain';
import { DomainError, NotFoundError, ValidationError } from '../types/errors';

type FiscalItem = OrderItem & { product: Product };

const digitsOnly = (value?: string | null) => String(value ?? '').replace(/\D/g, '');

export const buildRecipientIeFields = (value?: string | null) => {
  const raw = String(value ?? '').trim();
  const digits = digitsOnly(raw);
  const isNumericRegistration = !!digits && /^[\d.\-/\s]+$/.test(raw);

  if (!isNumericRegistration) {
    return { indicador_inscricao_estadual_destinatario: 9 as const };
  }

  return {
    indicador_inscricao_estadual_destinatario: 1 as const,
    inscricao_estadual_destinatario: digits,
  };
};

const requireValue = (value: string | null | undefined, field: string) => {
  if (!String(value ?? '').trim()) {
    throw new ValidationError(field, 'Campo fiscal obrigatório para emissão do documento fiscal');
  }
  return String(value).trim();
};

export const parseTaxRegime = (config: RestaurantConfig) => {
  const raw = String(config.taxRegime ?? '').trim();
  const legacyAliases: Record<string, number> = {
    SIMPLES_NACIONAL: 1,
    SIMPLES_NACIONAL_EXCESSO: 2,
    REGIME_NORMAL: 3,
    SIMPLES_NACIONAL_MEI: 4,
  };
  const numeric = legacyAliases[raw.toUpperCase()] ?? Number(raw);

  if (!Number.isInteger(numeric) || ![1, 2, 3, 4].includes(numeric)) {
    throw new ValidationError(
      'taxRegime',
      'Informe um regime tributário válido nas configurações fiscais (CRT 1, 2, 3 ou 4)'
    );
  }

  return numeric;
};

const buildEmitterFields = (config: RestaurantConfig) => {
  const emitterCnpj = digitsOnly(config.cnpj);
  if (emitterCnpj.length !== 14) {
    throw new ValidationError('cnpj', 'Informe o CNPJ do restaurante nas configurações fiscais');
  }

  return {
    cnpj_emitente: emitterCnpj,
    nome_emitente: requireValue(config.legalName ?? config.name, 'legalName'),
    nome_fantasia_emitente: config.name,
    logradouro_emitente: requireValue(config.fiscalStreet, 'fiscalStreet'),
    numero_emitente: requireValue(config.fiscalNumber, 'fiscalNumber'),
    bairro_emitente: requireValue(config.fiscalNeighborhood, 'fiscalNeighborhood'),
    municipio_emitente: requireValue(config.fiscalCity, 'fiscalCity'),
    codigo_municipio_emitente: requireValue(config.fiscalCityIbgeCode, 'fiscalCityIbgeCode'),
    uf_emitente: requireValue(config.fiscalState, 'fiscalState'),
    cep_emitente: digitsOnly(requireValue(config.fiscalZipCode, 'fiscalZipCode')),
    inscricao_estadual_emitente: requireValue(config.stateRegistration, 'stateRegistration'),
    regime_tributario_emitente: parseTaxRegime(config),
  };
};

export const buildFocusItems = (items: FiscalItem[], config: RestaurantConfig) =>
  items.map((item, index) => {
    const ncm = item.product.ncm ?? config.defaultNcm;
    const cfop = item.product.cfop ?? config.defaultCfop;
    const origin = item.product.origin ?? config.defaultOrigin ?? '0';
    const taxCode = item.product.taxCode ?? config.defaultTaxCode ?? '102';
    const isWeighted = item.saleType === 'WEIGHT' && item.weight != null;
    const quantity = isWeighted ? Number(item.weight || 0) / 1000 : Number(item.quantity || 1);
    const unitPrice = Number(item.unitPrice ?? (quantity > 0 ? item.price / quantity : item.price));

    if (!ncm) throw new ValidationError('ncm', `Produto sem NCM: ${item.product.name}`);
    if (!cfop) throw new ValidationError('cfop', `Produto sem CFOP: ${item.product.name}`);

    return {
      numero_item: index + 1,
      codigo_produto: item.product.id,
      descricao: item.product.name,
      cfop,
      unidade_comercial: isWeighted ? 'kg' : 'un',
      quantidade_comercial: quantity,
      valor_unitario_comercial: unitPrice,
      valor_unitario_tributavel: unitPrice,
      unidade_tributavel: isWeighted ? 'kg' : 'un',
      codigo_ncm: digitsOnly(ncm),
      quantidade_tributavel: quantity,
      valor_bruto: Number(item.price || 0),
      icms_situacao_tributaria: Number(taxCode),
      icms_origem: Number(origin),
      pis_situacao_tributaria: '07',
      cofins_situacao_tributaria: '07',
    };
  });

const buildNfePayload = async (
  invoice: Invoice,
  items: FiscalItem[],
  config: RestaurantConfig
) => {
  if (!invoice.customerId) {
    throw new ValidationError('customerId', 'A NF-e exige um cliente vinculado');
  }

  const customer = await customerRepository.findById(invoice.customerId);
  if (!customer) throw new NotFoundError('Customer', invoice.customerId);

  if (customer.personType !== 'PJ') {
    throw new ValidationError('personType', 'NF-e de fiado está disponível apenas para cliente PJ');
  }

  const customerDocument = digitsOnly(customer.document);
  if (customerDocument.length !== 14) {
    throw new ValidationError('document', 'Informe um CNPJ válido para o cliente PJ');
  }

  const focusItems = buildFocusItems(items, config);
  const total = focusItems.reduce((sum, item) => sum + Number(item.valor_bruto || 0), 0);
  const now = new Date().toISOString();
  const recipientIeFields = buildRecipientIeFields(customer.stateRegistration);

  return {
    natureza_operacao: 'Venda de mercadoria',
    data_emissao: now,
    data_entrada_saida: now,
    tipo_documento: 1,
    local_destino: 1,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 1,
    ...buildEmitterFields(config),
    nome_destinatario: requireValue(customer.legalName ?? customer.name, 'legalName'),
    cnpj_destinatario: customerDocument,
    ...recipientIeFields,
    logradouro_destinatario: requireValue(customer.fiscalStreet, 'fiscalStreet'),
    numero_destinatario: requireValue(customer.fiscalNumber, 'fiscalNumber'),
    bairro_destinatario: requireValue(customer.fiscalNeighborhood, 'fiscalNeighborhood'),
    municipio_destinatario: requireValue(customer.fiscalCity, 'fiscalCity'),
    codigo_municipio_destinatario: requireValue(customer.fiscalCityIbgeCode, 'fiscalCityIbgeCode'),
    uf_destinatario: requireValue(customer.fiscalState, 'fiscalState'),
    cep_destinatario: digitsOnly(requireValue(customer.fiscalZipCode, 'fiscalZipCode')),
    pais_destinatario: 'Brasil',
    telefone_destinatario: digitsOnly(customer.phone),
    valor_frete: 0,
    valor_seguro: 0,
    valor_desconto: 0,
    valor_outras_despesas: 0,
    valor_total: total,
    valor_produtos: total,
    modalidade_frete: 9,
    items: focusItems,
    informacoes_adicionais_contribuinte: `NF-e emitida para cobrança de fiado. Ref interna: ${invoice.focusRef}`,
  };
};

const repeatedCpf = /^(\d)\1{10}$/;

export const isValidCpf = (value?: string | null) => {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11 || repeatedCpf.test(cpf)) return false;

  const calculateDigit = (length: number) => {
    const sum = cpf
      .slice(0, length)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
};

export const normalizeConsumerCpf = (value?: string | null) => {
  const cpf = digitsOnly(value);
  if (!cpf) return null;
  if (!isValidCpf(cpf)) {
    throw new ValidationError('consumerDocument', 'Informe um CPF válido ou deixe o campo em branco');
  }
  return cpf;
};

const nfcePaymentCodes: Partial<Record<PaymentMethod, string>> = {
  CASH: '01',
  CREDIT_CARD: '03',
  DEBIT_CARD: '04',
  PIX: '17',
};

export const mapNfcePaymentMethod = (method: PaymentMethod | string) => {
  if (method === 'CREDIT') {
    throw new ValidationError('paymentMethod', 'Pedidos pagos no fiado seguem o fluxo de NF-e');
  }

  const code = nfcePaymentCodes[method as PaymentMethod];
  if (!code) {
    throw new ValidationError('paymentMethod', 'Forma de pagamento não suportada para NFC-e');
  }
  return code;
};

export const buildNfcePayload = (
  invoice: Invoice,
  order: Order,
  payment: Payment,
  items: FiscalItem[],
  config: RestaurantConfig,
  consumerDocument: string | null
) => {
  const focusItems = buildFocusItems(items, config);
  const productsTotal = focusItems.reduce((sum, item) => sum + Number(item.valor_bruto || 0), 0);
  const paymentCode = mapNfcePaymentMethod(payment.method);
  const isCard = payment.method === 'CREDIT_CARD' || payment.method === 'DEBIT_CARD';

  return {
    natureza_operacao: 'VENDA AO CONSUMIDOR',
    data_emissao: new Date().toISOString(),
    tipo_documento: 1,
    local_destino: 1,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 1,
    ...buildEmitterFields(config),
    ...(consumerDocument
      ? {
          cpf_destinatario: consumerDocument,
          indicador_inscricao_estadual_destinatario: 9,
        }
      : {}),
    valor_frete: 0,
    valor_seguro: 0,
    valor_desconto: 0,
    valor_outras_despesas: Number(order.deliveryFee || 0),
    valor_total: Number(order.total),
    valor_produtos: productsTotal,
    modalidade_frete: 9,
    items: focusItems,
    formas_pagamento: [
      {
        indicador_pagamento: 0,
        forma_pagamento: paymentCode,
        valor_pagamento: Number(payment.amount || order.total),
        ...(isCard ? { tipo_integracao: 2 } : {}),
      },
    ],
    informacoes_adicionais_contribuinte: `NFC-e do pedido ${order.id}. Ref interna: ${invoice.focusRef}`,
  };
};

const loadFiscalItems = async (orderId: string | null, label: string): Promise<FiscalItem[]> => {
  if (!orderId) throw new ValidationError('orderId', `${label} exige uma venda vinculada a pedido`);

  const items = await orderRepository.findItems(orderId);
  if (items.length === 0) throw new ValidationError('items', `Pedido sem itens para emitir ${label}`);

  const enriched = await Promise.all(
    items.map(async (item) => {
      const product = await productRepository.findById(item.productId);
      if (!product) throw new NotFoundError('Product', item.productId);
      return { ...item, product };
    })
  );

  return enriched;
};

const createInvoiceAttempt = (input: {
  customerId: string | null;
  orderId: string | null;
  creditTransactionId: string | null;
  model: '55' | '65';
  consumerDocument: string | null;
  focusRef: string;
}): Invoice => ({
  id: createId(),
  ...input,
  environment: focusNfeService.getEnvironment(),
  status: 'pending',
  sefazStatus: null,
  sefazMessage: null,
  accessKey: null,
  number: null,
  series: null,
  danfeUrl: null,
  xmlUrl: null,
  qrcodeUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const saveIssueError = async (invoice: Invoice, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  await invoiceRepository.update(invoice.id, {
    status: 'error',
    sefazMessage: message,
  });

  if (error instanceof DomainError) throw error;
  throw new DomainError(message, { code: 'FOCUS_NFE_ISSUE_ERROR', status: 500 });
};

export const invoiceService = {
  async issueCreditInvoice(creditTransactionId: string): Promise<Invoice> {
    const charge = await creditTransactionRepository.findById(creditTransactionId);
    if (!charge) throw new NotFoundError('CreditTransaction', creditTransactionId);
    if (charge.type !== 'CHARGE') {
      throw new ValidationError('creditTransactionId', 'Informe uma cobrança de fiado');
    }

    const previousInvoice = await invoiceRepository.findByCreditTransactionId(
      creditTransactionId
    );

    if (
      previousInvoice &&
      ['authorized', 'pending', 'processing'].includes(previousInvoice.status)
    ) {
      return previousInvoice;
    }

    let invoice = await invoiceRepository.create(createInvoiceAttempt({
      customerId: charge.customerId,
      orderId: charge.orderId,
      creditTransactionId: charge.id,
      model: '55',
      consumerDocument: null,
      focusRef: previousInvoice ? `fiado_${createId()}` : `fiado_${charge.id}`,
    }));

    try {
      const [items, config] = await Promise.all([
        loadFiscalItems(charge.orderId, 'a NF-e'),
        restaurantConfigRepository.get(),
      ]);
      const payload = await buildNfePayload(invoice, items, config);
      const focusResponse = await focusNfeService.issueNfe(invoice.focusRef, payload);
      return invoiceRepository.update(invoice.id, mapFocusInvoiceFields(focusResponse));
    } catch (error) {
      return saveIssueError(invoice, error, 'Erro ao emitir NF-e');
    }
  },

  async issueNfce(orderId: string, consumerDocument?: string | null): Promise<Invoice> {
    if (!String(orderId ?? '').trim()) {
      throw new ValidationError('orderId', 'Informe o pedido para emitir a NFC-e');
    }

    const [order, config] = await Promise.all([
      orderRepository.findById(orderId),
      restaurantConfigRepository.get(),
    ]);
    if (!order) throw new NotFoundError('Order', orderId);
    if (!config.nfceEnabled) {
      throw new ValidationError('nfceEnabled', 'A emissão de NFC-e está desabilitada nas configurações');
    }
    if (order.status !== 'FINISHED') {
      throw new ValidationError('status', 'A NFC-e só pode ser emitida para pedido finalizado');
    }

    const payments = await paymentRepository.findByOrder(orderId);
    const payment = [...payments].reverse().find((candidate) => candidate.status === 'PAID');
    if (!payment) {
      throw new ValidationError('payment', 'A NFC-e só pode ser emitida para pedido pago');
    }
    mapNfcePaymentMethod(payment.method);

    const previousInvoice = await invoiceRepository.findByOrderId(orderId, '65');
    if (
      previousInvoice &&
      ['authorized', 'pending', 'processing'].includes(previousInvoice.status)
    ) {
      return previousInvoice;
    }

    const normalizedConsumerDocument = normalizeConsumerCpf(consumerDocument);
    let invoice = await invoiceRepository.create(createInvoiceAttempt({
      customerId: order.customerId,
      orderId: order.id,
      creditTransactionId: null,
      model: '65',
      consumerDocument: normalizedConsumerDocument,
      focusRef: previousInvoice ? `nfce_${createId()}` : `nfce_${order.id}`,
    }));

    try {
      const items = await loadFiscalItems(order.id, 'a NFC-e');
      const payload = buildNfcePayload(
        invoice,
        order,
        payment,
        items,
        config,
        normalizedConsumerDocument
      );
      const focusResponse = await focusNfeService.issueNfce(invoice.focusRef, payload);
      return invoiceRepository.update(invoice.id, mapFocusInvoiceFields(focusResponse));
    } catch (error) {
      return saveIssueError(invoice, error, 'Erro ao emitir NFC-e');
    }
  },

  async getInvoiceStatus(id: string): Promise<Invoice> {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);

    if (!['pending', 'processing'].includes(invoice.status)) return invoice;

    const focusResponse = (invoice.model ?? '55') === '65'
      ? await focusNfeService.getNfce(invoice.focusRef)
      : await focusNfeService.getNfe(invoice.focusRef);
    return invoiceRepository.update(invoice.id, mapFocusInvoiceFields(focusResponse));
  },

  async getOrderNfce(orderId: string): Promise<Invoice | null> {
    const invoice = await invoiceRepository.findByOrderId(orderId, '65');
    if (!invoice) return null;
    return ['pending', 'processing'].includes(invoice.status)
      ? this.getInvoiceStatus(invoice.id)
      : invoice;
  },

  async applyFocusWebhook(payload: Record<string, any>): Promise<Invoice | null> {
    const focusRef = payload.ref || payload.referencia || payload.referencia_nfe;
    if (!focusRef) return null;

    const invoice = await invoiceRepository.findByFocusRef(String(focusRef));
    if (!invoice) return null;

    return invoiceRepository.update(invoice.id, mapFocusInvoiceFields(payload));
  },
};
