import { createHash } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { categoryRepository } from '../repositories/category.repository';
import { paymentRepository } from '../repositories/payment.repository';
import { cashRegisterRepository } from '../repositories/cashRegister.repository';
import { restaurantConfigRepository } from '../repositories/restaurantConfig.repository';
import { tableRepository } from '../repositories/table.repository';
import { tableTabRepository } from '../repositories/tableTab.repository';
import { customerRepository } from '../repositories/customer.repository';
import { creditTransactionRepository } from '../repositories/creditTransaction.repository';
import {
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  DeliveryType,
  Payment,
  PaymentMethod,
  SaleType,
  UserRole,
  TableTab,
} from '../types/domain';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  InvalidStatusTransitionError,
  CashRegisterClosedError,
} from '../types/errors';

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

export interface CreateOrderItemInput {
  productId: string;
  quantity?: number;
  weight?: number | null;
  unitPrice?: number | null;
  manualPrice?: number | null;
  saleType?: string | null;
  notes?: string | null;
}

export interface CreateOrderInput {
  type: OrderType;
  tableId?: string | null;
  tableTabId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  deliveryFee?: number;
  deliveryType?: string | null;
  deliveryStreet?: string | null;
  deliveryNumber?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryReference?: string | null;
  deliveryPhone?: string | null;
  deliveryNotes?: string | null;
  items: CreateOrderItemInput[];
}

export interface UpdateOrderInput {
  customerName?: string | null;
  deliveryFee?: number;
  deliveryType?: string | null;
  deliveryStreet?: string | null;
  deliveryNumber?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryReference?: string | null;
  deliveryPhone?: string | null;
  deliveryNotes?: string | null;
  items?: CreateOrderItemInput[];
}

// ---------------------------------------------------------------------------
// Contrato do checkout público (POST /orders/public)
// ---------------------------------------------------------------------------
//
// O cliente do cardápio só declara o que é dele: contato, tipo de pedido
// (retirada ou entrega), endereço de entrega, forma de pagamento e itens com
// quantidade. Mesa, comanda, operador, garçom, cliente cadastrado, origem,
// status, preços e totais são decididos pelo servidor. Qualquer outro campo
// é recusado explicitamente, em vez de ser ignorado em silêncio.

export const PUBLIC_ORDER_TYPES = ['TAKE_AWAY', 'DELIVERY'] as const;
export type PublicOrderType = (typeof PUBLIC_ORDER_TYPES)[number];

const PUBLIC_ORDER_STRING_FIELDS = [
  'customerName',
  'customerPhone',
  'paymentMethod',
  'deliveryStreet',
  'deliveryNumber',
  'deliveryNeighborhood',
  'deliveryReference',
  'deliveryPhone',
  'deliveryNotes',
] as const;

// idempotencyKey é lido pelo controller. deliveryFee é aceito porque o
// cardápio o envia para exibição, mas é ignorado: vale a taxa configurada.
const PUBLIC_ORDER_FIELDS = new Set<string>([
  ...PUBLIC_ORDER_STRING_FIELDS,
  'idempotencyKey',
  'type',
  'deliveryFee',
  'items',
]);
const PUBLIC_ORDER_ITEM_FIELDS = new Set<string>(['productId', 'quantity', 'notes']);

export interface PublicOrderItemInput {
  productId: string;
  quantity: number;
  notes: string | null;
}

export interface PublicOrderInput {
  type: PublicOrderType;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: string | null;
  deliveryStreet: string | null;
  deliveryNumber: string | null;
  deliveryNeighborhood: string | null;
  deliveryReference: string | null;
  deliveryPhone: string | null;
  deliveryNotes: string | null;
  items: PublicOrderItemInput[];
}

const NOT_ACCEPTED_IN_PUBLIC_ORDER = 'Este campo não é aceito no pedido do cardápio';

function optionalPublicString(source: Record<string, unknown>, field: string): string | null {
  const value = source[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ValidationError(field, 'Informe um texto válido');
  }
  return value.trim() || null;
}

/**
 * Valida o corpo do checkout público contra uma lista fechada de campos.
 * Campos internos (tableId, tableTabId, waiterId, userId, customerId, source,
 * status, total, preços de item...) são recusados com 400.
 */
export function parsePublicOrderInput(body: unknown): PublicOrderInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('body', 'Envie os dados do pedido');
  }
  const source = body as Record<string, unknown>;

  for (const field of Object.keys(source)) {
    if (!PUBLIC_ORDER_FIELDS.has(field)) {
      throw new ValidationError(field, NOT_ACCEPTED_IN_PUBLIC_ORDER);
    }
  }

  const type = source.type ?? 'TAKE_AWAY';
  if (!PUBLIC_ORDER_TYPES.includes(type as PublicOrderType)) {
    throw new ValidationError('type', 'O cardápio aceita apenas pedidos para retirada ou entrega');
  }

  if (!Array.isArray(source.items) || source.items.length === 0) {
    throw new ValidationError('items', 'Adicione itens ao pedido');
  }
  const items = source.items.map((rawItem, index): PublicOrderItemInput => {
    const prefix = `items[${index}]`;
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      throw new ValidationError(prefix, 'Item inválido');
    }
    const item = rawItem as Record<string, unknown>;
    for (const field of Object.keys(item)) {
      if (!PUBLIC_ORDER_ITEM_FIELDS.has(field)) {
        throw new ValidationError(`${prefix}.${field}`, NOT_ACCEPTED_IN_PUBLIC_ORDER);
      }
    }
    if (typeof item.productId !== 'string' || !item.productId.trim()) {
      throw new ValidationError(`${prefix}.productId`, 'Selecione um produto');
    }
    const quantity = item.quantity ?? 1;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError(`${prefix}.quantity`, 'Informe uma quantidade inteira maior que zero');
    }
    return {
      productId: item.productId,
      quantity,
      notes: optionalPublicString(item, 'notes'),
    };
  });

  const strings = Object.fromEntries(
    PUBLIC_ORDER_STRING_FIELDS.map((field) => [field, optionalPublicString(source, field)])
  ) as Record<(typeof PUBLIC_ORDER_STRING_FIELDS)[number], string | null>;

  return { type: type as PublicOrderType, ...strings, items };
}

// Resultado de pricing de um item
interface ResolvedItemPricing {
  productId: string;
  productName: string;
  quantity: number;
  weight: number | null;
  price: number;
  unitPrice: number;
  manualPrice: number | null;
  saleType: SaleType;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

const PUBLIC_PAYMENT_METHODS: PaymentMethod[] = [
  'CASH',
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
];

export function publicPaymentMethods(enabledPayments?: string | null): PaymentMethod[] {
  if (!enabledPayments?.trim()) return [...PUBLIC_PAYMENT_METHODS];

  const configured = new Set(
    enabledPayments
      .split(',')
      .map((method) => method.trim().toUpperCase())
      .filter(Boolean)
  );
  return PUBLIC_PAYMENT_METHODS.filter((method) => configured.has(method));
}

export function validatePublicPaymentMethod(
  method: string | null | undefined,
  enabledPayments?: string | null
): PaymentMethod {
  const normalized = String(method ?? '').trim().toUpperCase() as PaymentMethod;
  if (!publicPaymentMethods(enabledPayments).includes(normalized)) {
    throw new ValidationError(
      'paymentMethod',
      'Selecione uma forma de pagamento válida e habilitada.'
    );
  }
  return normalized;
}

// orders_delivery_type_check accepts only these text values. Custom and no-fee
// selections persist their amount in delivery_fee and use null for delivery_type.
export const DATABASE_DELIVERY_TYPES: readonly DeliveryType[] = ['URBAN', 'RURAL'];
type DeliveryFeeSelection = DeliveryType | 'CUSTOM' | 'NONE';

function validatedDeliveryFeeSelection(
  value: string | null | undefined
): DeliveryFeeSelection {
  const selections: DeliveryFeeSelection[] = [
    ...DATABASE_DELIVERY_TYPES,
    'CUSTOM',
    'NONE',
  ];
  if (!selections.includes(value as DeliveryFeeSelection)) {
    throw new ValidationError('deliveryType', 'Selecione uma taxa de entrega válida.');
  }
  return value as DeliveryFeeSelection;
}

function databaseDeliveryType(selection: DeliveryFeeSelection): DeliveryType | null {
  return DATABASE_DELIVERY_TYPES.includes(selection as DeliveryType)
    ? (selection as DeliveryType)
    : null;
}

function validatedDeliveryFee(orderType: OrderType, value: unknown): number {
  if (orderType !== 'DELIVERY') return 0;
  if (value === null || value === undefined || value === '') {
    throw new ValidationError('deliveryFee', 'Informe o valor da taxa de entrega.');
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new ValidationError('deliveryFee', 'Informe uma taxa de entrega válida.');
  }
  return numeric;
}

function normalizeOrderItemWeight(
  saleType: SaleType | string | null | undefined,
  weight: number | null | undefined
): number | null {
  const numericWeight = Number(weight);
  if (saleType === 'UNIT' || !Number.isFinite(numericWeight) || numericWeight <= 0) {
    return null;
  }
  return numericWeight;
}

export const BY_WEIGHT_NOT_AVAILABLE_ONLINE =
  'Produtos vendidos por peso não podem ser pedidos pelo cardápio online: a pesagem é feita no restaurante';

async function resolveItemPricing(
  item: CreateOrderItemInput,
  options: { publicCheckout?: boolean } = {}
): Promise<ResolvedItemPricing> {
  const product = await productRepository.findById(item.productId);
  if (!product) throw new NotFoundError('Product', item.productId);
  if (product.isPaused) {
    throw new ValidationError('productId', `O produto "${product.name}" está pausado`);
  }

  // O cardápio público não tem como informar peso: o produto por peso não é
  // vendido por ali, em vez de sair por R$ 0 (peso ausente vira preço zero).
  if (options.publicCheckout && product.isByWeight) {
    throw new ValidationError('productId', `${BY_WEIGHT_NOT_AVAILABLE_ONLINE} ("${product.name}")`);
  }

  // Peso informado precisa ser um número de gramas maior que zero.
  if (item.weight !== undefined && item.weight !== null) {
    const informedWeight = Number(item.weight);
    if (!Number.isFinite(informedWeight) || informedWeight <= 0) {
      throw new ValidationError('weight', `Informe um peso válido, em gramas, para "${product.name}"`);
    }
  }

  const category = await categoryRepository.findById(product.categoryId);
  const saleType: SaleType = (item.saleType as SaleType) ?? (product.isByWeight ? 'WEIGHT' : 'UNIT');
  const normalizedWeight = normalizeOrderItemWeight(saleType, item.weight);

  // Produto por peso sem peso só é aceito com preço ajustado pelo operador
  // (manualPrice, fluxo autenticado do PDV). Sem os dois, sairia por R$ 0.
  const hasManualPrice = item.manualPrice !== undefined && item.manualPrice !== null;
  if (product.isByWeight && normalizedWeight === null && !hasManualPrice) {
    throw new ValidationError('weight', `Informe o peso de "${product.name}"`);
  }

  let unitPrice =
    item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== 0
      ? item.unitPrice
      : product.price;

  if (
    (item.unitPrice === undefined || item.unitPrice === null || item.unitPrice === 0) &&
    product.isByWeight &&
    category?.isMealCategory
  ) {
    if (saleType === ('SELF_SERVICE' as SaleType) && category.selfServicePricePerKg != null) {
      unitPrice = category.selfServicePricePerKg;
    } else if (category.pricePerKg != null) {
      unitPrice = category.pricePerKg;
    }
  }

  const manualPrice =
    item.manualPrice !== undefined && item.manualPrice !== null ? item.manualPrice : null;

  let itemPrice = 0;
  if (manualPrice !== null) {
    itemPrice = manualPrice;
  } else if (product.isByWeight) {
    const weightInKg = (normalizedWeight ?? 0) / 1000;
    itemPrice = unitPrice * weightInKg;
  } else {
    itemPrice = unitPrice * (item.quantity ?? 1);
  }

  return {
    productId: item.productId,
    productName: product.name,
    quantity: item.quantity ?? 1,
    weight: normalizedWeight,
    price: itemPrice,
    unitPrice,
    manualPrice,
    saleType,
    notes: item.notes ?? null,
  };
}


function normalizedNullableName(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

async function validateOrderTableContext(input: CreateOrderInput): Promise<TableTab | null> {
  if (input.type === 'DINE_IN') {
    if (!input.tableId) {
      throw new ValidationError('tableId', 'Selecione a mesa do pedido.');
    }
    if (!input.tableTabId) {
      throw new ValidationError('tableTabId', 'Selecione a comanda do pedido.');
    }

    const [table, tab] = await Promise.all([
      tableRepository.findById(input.tableId),
      tableTabRepository.findById(input.tableTabId),
    ]);
    if (!table) throw new NotFoundError('Table', input.tableId);
    if (!tab || tab.tableId !== input.tableId) {
      throw new ValidationError('tableTabId', 'A comanda não pertence à mesa selecionada.');
    }
    if (tab.status !== 'OPEN') {
      throw new ValidationError(
        'tableTabId',
        'A comanda já foi fechada. A conta já foi paga.'
      );
    }
    if (table.status !== 'OCCUPIED') {
      throw new ValidationError('tableId', 'A mesa da comanda precisa estar ocupada.');
    }
    return tab;
  }

  if (input.tableId || input.tableTabId) {
    throw new ValidationError('tableTabId', 'Pedidos sem consumo no local não usam mesa ou comanda.');
  }
  return null;
}
async function releaseTableIfEmpty(tableId: string | null): Promise<void> {
  if (!tableId) return;
  if (await tableTabRepository.hasOpenByTable(tableId)) return;
  const hasActiveOrders = await orderRepository.hasActiveByTable(tableId);
  if (!hasActiveOrders) {
    await tableRepository.update(tableId, { status: 'AVAILABLE' });
  }
}

// ---------------------------------------------------------------------------
// Service público
// ---------------------------------------------------------------------------

function normalizedIdempotencyKey(key?: string): string | undefined {
  return key ? createHash('sha256').update(key).digest('hex') : undefined;
}

function creationItems(orderId: string, items: ResolvedItemPricing[]): OrderItem[] {
  return items.map((item) => ({ ...item, id: createId(), orderId }));
}

export const orderService = {
  async createOrder(
    input: CreateOrderInput,
    actingUser: { id: string; role: UserRole },
    idempotencyKey?: string
  ): Promise<Order> {
    const storedKey = normalizedIdempotencyKey(idempotencyKey);
    if (storedKey) {
      const existing = await orderRepository.findByIdempotencyKey(storedKey);
      if (existing) return existing;
    }
    const session = await cashRegisterRepository.findOpenSession();
    if (!session) throw new CashRegisterClosedError();

    const tableTab = await validateOrderTableContext(input);
    const customerName = normalizedNullableName(tableTab?.name ?? input.customerName);

    if (input.type === 'TAKE_AWAY' && !customerName) {
      throw new ValidationError('customerName', 'Informe o nome do cliente para retirada.');
    }
    if (input.type === 'DELIVERY' && !customerName) {
      throw new ValidationError('customerName', 'Informe o nome do cliente para entrega.');
    }

    // userId é sempre quem está autenticado. waiterId só existe quando o
    // próprio garçom lança o pedido (app do garçom, na comanda). No PDV o
    // corpo da requisição não escolhe garçom nem responsável: userId e
    // waiterId enviados pelo cliente são ignorados.
    const waiterId = actingUser.role === 'WAITER' ? actingUser.id : null;

    let total = 0;
    const resolvedItems: ResolvedItemPricing[] = [];
    for (const item of input.items) {
      const pricing = await resolveItemPricing(item);
      total += pricing.price;
      resolvedItems.push(pricing);
    }

    const deliveryFeeSelection =
      input.type === 'DELIVERY' ? validatedDeliveryFeeSelection(input.deliveryType) : null;
    const deliveryType = deliveryFeeSelection
      ? databaseDeliveryType(deliveryFeeSelection)
      : null;
    const deliveryFee =
      deliveryFeeSelection === 'NONE'
        ? 0
        : validatedDeliveryFee(input.type, input.deliveryFee);
    total += deliveryFee;

    const orderId = createId();
    const order: Order = {
      id: orderId,
      type: input.type,
      source: actingUser.role === 'WAITER' ? 'WAITER' : 'PDV',
      status: 'NEW',
      total,
      deliveryFee,
      customerName,
      customerId: input.customerId ?? null,
      tableId: input.tableId ?? null,
      tableTabId: tableTab?.id ?? null,
      userId: actingUser.id,
      waiterId,
      cashRegisterSessionId: session.id,
      deliveryType,
      deliveryStreet: input.deliveryStreet ?? null,
      deliveryNumber: input.deliveryNumber ?? null,
      deliveryNeighborhood: input.deliveryNeighborhood ?? null,
      deliveryReference: input.deliveryReference ?? null,
      deliveryPhone: input.deliveryPhone ?? null,
      deliveryNotes: input.deliveryNotes ?? null,
      // O banco grava o prazo na inserção, pelo tipo; o pedido devolvido o traz.
      promisedAt: null,
      deliveredAt: null,
      // Não é enviado: o banco grava true na inserção.
      deliveryTracked: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return orderRepository.createWithStock(order, creationItems(orderId, resolvedItems), undefined, storedKey);
  },

  /**
   * Checkout público do cardápio.
   *
   * - Só retirada (TAKE_AWAY) e entrega (DELIVERY); mesa e comanda ficam nas
   *   rotas autenticadas do PDV e do garçom.
   * - O contato informado (nome e telefone) é um dado declarado deste pedido e
   *   fica em orders.customer_name / orders.delivery_phone. Ele não identifica
   *   um cliente cadastrado: o pedido não é ligado a um cadastro existente nem
   *   cria um cadastro novo só porque alguém digitou um telefone.
   * - Ninguém da equipe registrou o pedido: user_id fica null e a origem é
   *   PUBLIC_MENU (ver migration 20261104220000).
   */
  async createPublicOrder(body: unknown, idempotencyKey?: string): Promise<Order> {
    const input = parsePublicOrderInput(body);

    const storedKey = normalizedIdempotencyKey(idempotencyKey);
    if (storedKey) {
      const existing = await orderRepository.findByIdempotencyKey(storedKey);
      if (existing) return existing;
    }
    const session = await cashRegisterRepository.findOpenSession();
    if (!session) throw new CashRegisterClosedError();

    const type = input.type;
    const customerName = normalizedNullableName(input.customerName);
    const config = await restaurantConfigRepository.get();
    const paymentMethod = validatePublicPaymentMethod(input.paymentMethod, config.enabledPayments);

    if (!customerName) {
      throw new ValidationError('customerName', 'Informe o nome do cliente.');
    }

    let total = 0;
    const resolvedItems: ResolvedItemPricing[] = [];
    for (const item of input.items) {
      const pricing = await resolveItemPricing(item, { publicCheckout: true });
      total += pricing.price;
      resolvedItems.push(pricing);
    }

    const requestedDeliveryFee = Number(config.deliveryFee ?? 0);
    if (!Number.isFinite(requestedDeliveryFee) || requestedDeliveryFee < 0) {
      throw new ValidationError('deliveryFee', 'Informe uma taxa de entrega válida.');
    }
    const deliveryFee = type === 'DELIVERY' ? requestedDeliveryFee : 0;
    total += deliveryFee;

    const orderId = createId();
    const order: Order = {
      id: orderId,
      type,
      source: 'PUBLIC_MENU',
      status: 'NEW',
      total,
      deliveryFee,
      customerName,
      customerId: null,
      tableId: null,
      tableTabId: null,
      userId: null,
      waiterId: null,
      cashRegisterSessionId: session.id,
      deliveryType: null,
      deliveryStreet: input.deliveryStreet ?? null,
      deliveryNumber: input.deliveryNumber ?? null,
      deliveryNeighborhood: input.deliveryNeighborhood ?? null,
      deliveryReference: input.deliveryReference ?? null,
      deliveryPhone: input.deliveryPhone ?? input.customerPhone ?? null,
      deliveryNotes: input.deliveryNotes ?? null,
      // O banco grava o prazo na inserção, pelo tipo; o pedido devolvido o traz.
      promisedAt: null,
      deliveredAt: null,
      // Não é enviado: o banco grava true na inserção.
      deliveryTracked: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const payment: Payment = {
      id: createId(),
      orderId,
      method: paymentMethod,
      amount: total,
      status: 'PENDING',
      transactionId: null,
      createdAt: new Date(),
    };
    return orderRepository.createWithStock(order, creationItems(orderId, resolvedItems), payment, storedKey);
  },

  async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    actingUser: { id: string; role: UserRole }
  ): Promise<Order & { stockReviewRequired?: boolean }> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new NotFoundError('Order', orderId);

    if (actingUser.role === 'WAITER') {
      if (order.waiterId !== actingUser.id) {
        throw new ForbiddenError('Você só pode alterar pedidos lançados por você.');
      }
      if (newStatus !== 'CANCELED') {
        throw new ForbiddenError('Garçom só pode cancelar os próprios pedidos.');
      }
      if (order.status !== 'NEW') {
        throw new ValidationError('status', 'Só é possível cancelar pedidos novos.');
      }
    }

    if (order.status === 'CANCELED' && newStatus !== 'CANCELED') {
      throw new InvalidStatusTransitionError(order.status, newStatus);
    }

    // Cancelar: status, estorno de estoque (pelo livro do pedido) e
    // cancelamento dos pagamentos pendentes (trigger) numa única transação,
    // com lock da linha do pedido. Repetir o cancelamento não devolve de novo.
    // Os estados canceláveis continuam os mesmos de antes; para o garçom, o
    // banco reconfere dentro do lock que o pedido ainda é dele e está NEW.
    if (newStatus === 'CANCELED') {
      const { order: canceled, stockReviewRequired } = await orderRepository.cancelWithStock(
        orderId,
        actingUser.role === 'WAITER'
          ? { requiredStatus: 'NEW', requiredWaiterId: actingUser.id }
          : {}
      );
      await releaseTableIfEmpty(order.tableId);
      // Campo adicional na resposta: o cancelamento já foi concluído; para
      // pedido anterior ao livro, avisa que o estoque precisa de conferência
      // (nada foi devolvido automaticamente). Repetir o cancelamento mantém o
      // aviso enquanto a conferência estiver pendente.
      return { ...canceled, stockReviewRequired };
    }

    // Entregar é a confirmação explícita de entrega, com as mesmas permissões
    // de antes. O banco grava delivered_at uma única vez, com o pedido
    // travado, e não toca no pagamento: entregue antes de pagar continua com
    // o pagamento pendente; finalizado antes de entregar (FINISHED) continua
    // FINISHED, agora com o horário da entrega, se o pedido for posterior ao
    // registro de entregas (delivery_tracked; conferido com a linha travada).
    if (newStatus === 'DELIVERED') {
      const { order: delivered } = await orderRepository.confirmDelivery(orderId);
      return delivered;
    }

    const updated = await orderRepository.update(orderId, { status: newStatus });

    if (newStatus === 'FINISHED') {
      await releaseTableIfEmpty(order.tableId);
    }

    return updated;
  },

  async processPayment(
    orderId: string,
    method: string,
    amount?: number,
    customerId?: string | null
  ): Promise<Payment> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new NotFoundError('Order', orderId);

    const paymentAmount = amount ?? order.total;

    if (method === 'CREDIT') {
      const finalCustomerId = customerId ?? order.customerId;
      if (!finalCustomerId) {
        throw new ValidationError('customerId', 'Selecione um cliente para lançar no fiado.');
      }
      const customer = await customerRepository.findById(finalCustomerId);
      if (!customer) throw new NotFoundError('Customer', finalCustomerId);

      await creditTransactionRepository.payOrderWithCredit(orderId, finalCustomerId, paymentAmount);
      await releaseTableIfEmpty(order.tableId);

      const payments = await paymentRepository.findByOrder(orderId);
      return payments[payments.length - 1];
    }

    const existingPayments = await paymentRepository.findByOrder(orderId);
    let payment: Payment;

    if (existingPayments.length > 0) {
      payment = await paymentRepository.update(existingPayments[0].id, {
        method: method as any,
        amount: paymentAmount,
        status: 'PAID',
      });
    } else {
      payment = await paymentRepository.create({
        id: createId(),
        orderId,
        method: method as any,
        amount: paymentAmount,
        status: 'PAID',
        transactionId: null,
        createdAt: new Date(),
      });
    }

    await orderRepository.update(orderId, { status: 'FINISHED' });
    await releaseTableIfEmpty(order.tableId);

    return payment;
  },

  async updateOrder(
    orderId: string,
    input: UpdateOrderInput,
    actingUser: { id: string; role: UserRole }
  ): Promise<Order> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new NotFoundError('Order', orderId);

    if (actingUser.role === 'WAITER' && order.waiterId !== actingUser.id) {
      throw new ForbiddenError('Você só pode editar pedidos lançados por você.');
    }
    if (order.status !== 'NEW') {
      throw new ValidationError('status', 'Só é possível editar pedidos no status NEW.');
    }

    const patch: Partial<Order> = {};
    if (input.customerName !== undefined) patch.customerName = input.customerName;
    if (input.deliveryStreet !== undefined) patch.deliveryStreet = input.deliveryStreet;
    if (input.deliveryNumber !== undefined) patch.deliveryNumber = input.deliveryNumber;
    if (input.deliveryNeighborhood !== undefined) patch.deliveryNeighborhood = input.deliveryNeighborhood;
    if (input.deliveryReference !== undefined) patch.deliveryReference = input.deliveryReference;
    if (input.deliveryPhone !== undefined) patch.deliveryPhone = input.deliveryPhone;
    if (input.deliveryNotes !== undefined) patch.deliveryNotes = input.deliveryNotes;
    if (input.deliveryType !== undefined) {
      patch.deliveryType = order.type === 'DELIVERY'
        ? databaseDeliveryType(validatedDeliveryFeeSelection(input.deliveryType))
        : null;
    }
    let effectiveDeliveryFee = order.deliveryFee;
    const removesDeliveryFee = input.deliveryType === 'NONE';
    if (input.deliveryFee !== undefined || removesDeliveryFee) {
      effectiveDeliveryFee = removesDeliveryFee
        ? 0
        : validatedDeliveryFee(order.type, input.deliveryFee);
      patch.deliveryFee = effectiveDeliveryFee;
    }

    if (input.items && input.items.length > 0) {
      let newTotal = 0;
      const resolvedItems: ResolvedItemPricing[] = [];
      for (const item of input.items) {
        const pricing = await resolveItemPricing(item);
        newTotal += pricing.price;
        resolvedItems.push(pricing);
      }

      patch.total = newTotal + effectiveDeliveryFee;

      // Itens, estoque, livro do pedido e patch numa única transação. O banco
      // reconfere, com o pedido travado, que ele ainda está NEW (e, para o
      // garçom, que ainda é dele): uma falha ou um cancelamento concorrente
      // não deixa baixa ou devolução pela metade.
      return orderRepository.updateItemsWithStock(
        orderId,
        creationItems(orderId, resolvedItems),
        patch,
        { requiredWaiterId: actingUser.role === 'WAITER' ? actingUser.id : null }
      );
    } else if (input.deliveryFee !== undefined || removesDeliveryFee) {
      const currentItems = await orderRepository.findItems(orderId);
      const itemsTotal = currentItems.reduce((sum, item) => sum + Number(item.price), 0);
      patch.total = itemsTotal + effectiveDeliveryFee;
    }

    return orderRepository.update(orderId, patch);
  },

  async deleteOrder(orderId: string): Promise<void> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw new NotFoundError('Order', orderId);

    // Uma transação: devolução (só pedidos ativos, como antes, conforme o
    // livro), pagamentos, itens e pedido. Se algo impedir a exclusão (ex.:
    // nota fiscal vinculada), nada muda.
    await orderRepository.deleteWithStock(orderId);
    await releaseTableIfEmpty(order.tableId);
  },
};
