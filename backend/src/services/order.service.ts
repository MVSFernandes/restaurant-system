import { createHash } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { categoryRepository } from '../repositories/category.repository';
import { paymentRepository } from '../repositories/payment.repository';
import { cashRegisterRepository } from '../repositories/cashRegister.repository';
import { tableRepository } from '../repositories/table.repository';
import { customerRepository } from '../repositories/customer.repository';
import { creditTransactionRepository } from '../repositories/creditTransaction.repository';
import { userRepository } from '../repositories/user.repository';
import {
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  Payment,
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

    const deliveryFee = input.type === 'DELIVERY' ? (input.deliveryFee ?? 0) : 0;
    total += deliveryFee;

    const orderId = createId();
    const order: Order = {
      id: orderId,
      type: input.type,
      status: 'NEW',
      total,
      deliveryFee,
      customerName: input.customerName ?? null,
      customerId: input.customerId ?? null,
      tableId: input.tableId ?? null,
      userId: actingUser.id,
      waiterId,
      cashRegisterSessionId: session.id,
      deliveryType: (input.deliveryType as any) ?? null,
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

    const deliveryFee = type === 'DELIVERY' ? (input.deliveryFee ?? 0) : 0;
    total += deliveryFee;

    const orderId = createId();
    const order: Order = {
      id: orderId,
      type,
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

    const payment: Payment | undefined = input.paymentMethod ? {
      id: createId(), orderId, method: input.paymentMethod as Payment['method'],
      amount: total, status: 'PENDING', transactionId: null, createdAt: new Date(),
    } : undefined;
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
    if (input.deliveryType !== undefined) patch.deliveryType = input.deliveryType as any;
    if (input.deliveryFee !== undefined) patch.deliveryFee = input.deliveryFee;

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

      const deliveryFee = input.deliveryFee ?? order.deliveryFee;
      patch.total = newTotal + deliveryFee;

      for (const item of resolvedItems) {
        await orderRepository.addItem({
          id: createId(),
          orderId,
          productId: item.productId,
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
