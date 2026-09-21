import { createHash } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { categoryRepository } from '../repositories/category.repository';
import { paymentRepository } from '../repositories/payment.repository';
import { cashRegisterRepository } from '../repositories/cashRegister.repository';
import { restaurantConfigRepository } from '../repositories/restaurantConfig.repository';
import { tableRepository } from '../repositories/table.repository';
import { customerRepository } from '../repositories/customer.repository';
import { creditTransactionRepository } from '../repositories/creditTransaction.repository';
import { userRepository } from '../repositories/user.repository';
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
  customerId?: string | null;
  customerName?: string | null;
  waiterId?: string | null;
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

// Formato que a RPC consume_order_stock/restore_order_stock espera
type StockRpcItem = { product_id: string; quantity: number; weight: number | null };

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

async function resolveItemPricing(item: CreateOrderItemInput): Promise<ResolvedItemPricing> {
  const product = await productRepository.findById(item.productId);
  if (!product) throw new NotFoundError('Product', item.productId);

  const category = await categoryRepository.findById(product.categoryId);
  const saleType: SaleType = (item.saleType as SaleType) ?? (product.isByWeight ? 'WEIGHT' : 'UNIT');
  const normalizedWeight = normalizeOrderItemWeight(saleType, item.weight);

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

/**
 * Converte itens resolvidos no formato que a RPC espera.
 * A RPC recebe product_id + quantity + weight e faz o cálculo internamente.
 */
function toStockRpcItems(items: ResolvedItemPricing[]): StockRpcItem[] {
  return items.map((i) => ({
    product_id: i.productId,
    quantity: i.quantity,
    weight: i.weight,
  }));
}

async function releaseTableIfEmpty(tableId: string | null): Promise<void> {
  if (!tableId) return;
  await tableRepository.update(tableId, { status: 'AVAILABLE' });
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

    if (input.type === 'TAKE_AWAY' && !String(input.customerName ?? '').trim()) {
      throw new ValidationError('customerName', 'Informe o nome do cliente para retirada.');
    }
    if (input.type === 'DELIVERY' && !String(input.customerName ?? '').trim()) {
      throw new ValidationError('customerName', 'Informe o nome do cliente para entrega.');
    }

    const waiterId = actingUser.role === 'WAITER' ? actingUser.id : (input.waiterId ?? null);

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
      customerName: input.customerName ?? null,
      customerId: input.customerId ?? null,
      tableId: input.tableId ?? null,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return orderRepository.createWithStock(order, creationItems(orderId, resolvedItems), undefined, storedKey);
  },

  async createPublicOrder(
    input: Omit<CreateOrderInput, 'waiterId'> & {
      customerPhone?: string | null;
      paymentMethod?: string | null;
    },
    idempotencyKey?: string
  ): Promise<Order> {
    const storedKey = normalizedIdempotencyKey(idempotencyKey);
    if (storedKey) {
      const existing = await orderRepository.findByIdempotencyKey(storedKey);
      if (existing) return existing;
    }
    const session = await cashRegisterRepository.findOpenSession();
    if (!session) throw new CashRegisterClosedError();

    const type = input.type ?? 'TAKE_AWAY';
    const config = await restaurantConfigRepository.get();
    const paymentMethod = validatePublicPaymentMethod(input.paymentMethod, config.enabledPayments);

    if (type !== 'DINE_IN' && !String(input.customerName ?? '').trim()) {
      throw new ValidationError('customerName', 'Informe o nome do cliente.');
    }

    let customerId: string | null = null;
    if (input.customerPhone) {
      let customer = await customerRepository.findByPhone(input.customerPhone);
      if (!customer && input.customerName) {
        customer = await customerRepository.create({
          id: createId(),
          name: input.customerName,
          phone: input.customerPhone,
          email: null,
          address: null,
          creditLimit: 0,
          creditUsed: 0,
          personType: 'PF',
          document: null,
          legalName: null,
          stateRegistration: null,
          fiscalZipCode: null,
          fiscalStreet: null,
          fiscalNumber: null,
          fiscalNeighborhood: null,
          fiscalCity: null,
          fiscalCityIbgeCode: null,
          fiscalState: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      customerId = customer?.id ?? null;
    }

    const admin = await userRepository.findAdminUser();
    if (!admin) throw new NotFoundError('User', 'admin');

    let total = 0;
    const resolvedItems: ResolvedItemPricing[] = [];
    for (const item of input.items) {
      const pricing = await resolveItemPricing(item);
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
      customerName: input.customerName ?? null,
      customerId,
      tableId: null,
      userId: admin.id,
      waiterId: null,
      cashRegisterSessionId: session.id,
      deliveryType: (input.deliveryType as any) ?? null,
      deliveryStreet: input.deliveryStreet ?? null,
      deliveryNumber: input.deliveryNumber ?? null,
      deliveryNeighborhood: input.deliveryNeighborhood ?? null,
      deliveryReference: input.deliveryReference ?? null,
      deliveryPhone: input.deliveryPhone ?? input.customerPhone ?? null,
      deliveryNotes: input.deliveryNotes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const payment: Payment = {
      id: createId(),
      orderId,
      method: paymentMethod,
      amount: total,
      status: paymentMethod === 'PIX' ? 'PAID' : 'PENDING',
      transactionId: null,
      createdAt: new Date(),
    };
    return orderRepository.createWithStock(order, creationItems(orderId, resolvedItems), payment, storedKey);
  },

  async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    actingUser: { id: string; role: UserRole }
  ): Promise<Order> {
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

    // Cancelar → restaurar estoque via RPC
    if (order.status !== 'CANCELED' && newStatus === 'CANCELED') {
      const items = await orderRepository.findItems(orderId);
      const stockPayload: StockRpcItem[] = items.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
        weight: i.weight,
      }));
      if (stockPayload.length > 0) {
        await orderRepository.restoreStock(stockPayload);
      }
    }

    const updated = await orderRepository.update(orderId, { status: newStatus });

    if (newStatus === 'FINISHED' || newStatus === 'CANCELED') {
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
      const oldItems = await orderRepository.findItems(orderId);
      const oldStockPayload: StockRpcItem[] = oldItems.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
        weight: i.weight,
      }));
      if (oldStockPayload.length > 0) await orderRepository.restoreStock(oldStockPayload);

      for (const item of oldItems) {
        await orderRepository.removeItem(item.id);
      }

      let newTotal = 0;
      const resolvedItems: ResolvedItemPricing[] = [];
      for (const item of input.items) {
        const pricing = await resolveItemPricing(item);
        newTotal += pricing.price;
        resolvedItems.push(pricing);
      }

      patch.total = newTotal + effectiveDeliveryFee;

      for (const item of resolvedItems) {
        await orderRepository.addItem({
          id: createId(),
          orderId,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          weight: item.weight,
          price: item.price,
          unitPrice: item.unitPrice,
          manualPrice: item.manualPrice,
          saleType: item.saleType,
          notes: item.notes,
        });
      }

      const newStockPayload = toStockRpcItems(resolvedItems);
      if (newStockPayload.length > 0) await orderRepository.consumeStock(newStockPayload);
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

    const activeStatuses: OrderStatus[] = ['NEW', 'IN_PROGRESS', 'READY', 'DELIVERED'];
    if (activeStatuses.includes(order.status)) {
      const items = await orderRepository.findItems(orderId);
      const stockPayload: StockRpcItem[] = items.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
        weight: i.weight,
      }));
      if (stockPayload.length > 0) await orderRepository.restoreStock(stockPayload);
    }

    const items = await orderRepository.findItems(orderId);
    for (const item of items) await orderRepository.removeItem(item.id);

    const payments = await paymentRepository.findByOrder(orderId);
    for (const p of payments) await paymentRepository.delete(p.id);

    await orderRepository.delete(orderId);
    await releaseTableIfEmpty(order.tableId);
  },
};
