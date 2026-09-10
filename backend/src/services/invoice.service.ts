import { createId } from '@paralleldrive/cuid2';
import { creditTransactionRepository } from '../repositories/creditTransaction.repository';
import { customerRepository } from '../repositories/customer.repository';
import { invoiceRepository } from '../repositories/invoice.repository';
import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { restaurantConfigRepository } from '../repositories/restaurantConfig.repository';
import { focusNfeService, mapFocusInvoiceFields } from './focusNfe.service';
import { Invoice, OrderItem, Product, RestaurantConfig } from '../types/domain';
import { DomainError, NotFoundError, ValidationError } from '../types/errors';

type NfeItem = OrderItem & { product: Product };

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
    throw new ValidationError(field, 'Campo fiscal obrigatorio para emissao de NF-e');
  }
  return String(value).trim();
};

const parseTaxRegime = (config: RestaurantConfig) => {
  const raw = String(config.taxRegime ?? 'SIMPLES_NACIONAL').trim();
  const numeric = Number(raw);
  if ([1, 2, 3].includes(numeric)) return numeric;

  const map: Record<string, number> = {
    SIMPLES_NACIONAL: 1,
    SIMPLES_NACIONAL_EXCESSO: 2,
    REGIME_NORMAL: 3,
  };

  return map[raw.toUpperCase()] ?? 1;
};

const buildFocusPayload = async (
  invoice: Invoice,
  items: NfeItem[],
  config: RestaurantConfig
) => {
  const customer = await customerRepository.findById(invoice.customerId);
  if (!customer) throw new NotFoundError('Customer', invoice.customerId);

  if (customer.personType !== 'PJ') {
    throw new ValidationError('personType', 'NF-e de fiado esta disponivel apenas para cliente PJ');
  }

  const customerDocument = digitsOnly(customer.document);
  if (customerDocument.length !== 14) {
    throw new ValidationError('document', 'Informe um CNPJ valido para o cliente PJ');
  }

  const emitterCnpj = digitsOnly(config.cnpj);
  if (emitterCnpj.length !== 14) {
    throw new ValidationError('cnpj', 'Informe o CNPJ do restaurante nas configuracoes fiscais');
  }

  const focusItems = items.map((item, index) => {
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
    informacoes_adicionais_contribuinte: `NF-e emitida para cobranca de fiado. Ref interna: ${invoice.focusRef}`,
  };
};

const loadInvoiceItems = async (orderId: string | null): Promise<NfeItem[]> => {
  if (!orderId) throw new ValidationError('orderId', 'A NF-e exige uma venda vinculada a pedido');

  const items = await orderRepository.findItems(orderId);
  if (items.length === 0) throw new ValidationError('items', 'Pedido sem itens para emitir NF-e');

  const enriched: NfeItem[] = [];
  for (const item of items) {
    const product = await productRepository.findById(item.productId);
    if (!product) throw new NotFoundError('Product', item.productId);
    enriched.push({ ...item, product });
  }

  return enriched;
};

export const invoiceService = {
  async issueCreditInvoice(creditTransactionId: string): Promise<Invoice> {
    const charge = await creditTransactionRepository.findById(creditTransactionId);
    if (!charge) throw new NotFoundError('CreditTransaction', creditTransactionId);
    if (charge.type !== 'CHARGE') {
      throw new ValidationError('creditTransactionId', 'Informe uma cobranca de fiado');
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

    // Focus consumes every submitted ref, including rejected/canceled attempts.
    // Preserve the old row for history and create a fresh attempt without schema changes.
    let invoice = await invoiceRepository.create({
      id: createId(),
      customerId: charge.customerId,
      orderId: charge.orderId,
      creditTransactionId: charge.id,
      focusRef: previousInvoice ? `fiado_${createId()}` : `fiado_${charge.id}`,
      environment: focusNfeService.getEnvironment(),
      status: 'pending',
      sefazStatus: null,
      sefazMessage: null,
      accessKey: null,
      number: null,
      series: null,
      danfeUrl: null,
      xmlUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      const [items, config] = await Promise.all([
        loadInvoiceItems(charge.orderId),
        restaurantConfigRepository.get(),
      ]);
      const payload = await buildFocusPayload(invoice, items, config);
      const focusResponse = await focusNfeService.issueNfe(invoice.focusRef, payload);
      return invoiceRepository.update(invoice.id, mapFocusInvoiceFields(focusResponse));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao emitir NF-e';
      await invoiceRepository.update(invoice.id, {
        status: 'error',
        sefazMessage: message,
      });

      if (error instanceof DomainError) throw error;
      throw new DomainError(message, { code: 'FOCUS_NFE_ISSUE_ERROR', status: 500 });
    }
  },

  async getInvoiceStatus(id: string): Promise<Invoice> {
    const invoice = await invoiceRepository.findById(id);
    if (!invoice) throw new NotFoundError('Invoice', id);

    if (!['pending', 'processing'].includes(invoice.status)) return invoice;

    const focusResponse = await focusNfeService.getNfe(invoice.focusRef);
    return invoiceRepository.update(invoice.id, mapFocusInvoiceFields(focusResponse));
  },

  async applyFocusWebhook(payload: Record<string, any>): Promise<Invoice | null> {
    const focusRef = payload.ref || payload.referencia || payload.referencia_nfe;
    if (!focusRef) return null;

    const invoice = await invoiceRepository.findByFocusRef(String(focusRef));
    if (!invoice) return null;

    return invoiceRepository.update(invoice.id, mapFocusInvoiceFields(payload));
  },
};
