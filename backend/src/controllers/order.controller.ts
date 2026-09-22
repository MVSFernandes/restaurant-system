import { Request, Response } from 'express';
import { orderService } from '../services/order.service';
import { orderRepository } from '../repositories/order.repository';
import { cashRegisterRepository } from '../repositories/cashRegister.repository';
import { notifyStockChanged } from '../services/stockRealtime.service';
import {
  notifyOrderChanged,
  notifyOrderIdChanged,
  orderMutationEvent,
} from '../services/orderRealtime.service';
import { ORDER_EVENTS } from '../constants/realtime';
import { DomainError } from '../types/errors';
import { productRepository } from '../repositories/product.repository';
import { paymentRepository } from '../repositories/payment.repository';
import { orderHistoryRepository, OrderHistoryFilters } from '../repositories/orderHistory.repository';
import type { Order, Payment } from '../types/domain';

type IdempotencyResult = {
  status: number;
  body: unknown;
};

type IdempotencyEntry = {
  createdAt: number;
  promise?: Promise<IdempotencyResult>;
  result?: IdempotencyResult;
};

const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const idempotencyStore = new Map<string, IdempotencyEntry>();

const cleanupIdempotencyStore = () => {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore.entries()) {
    if (now - entry.createdAt > IDEMPOTENCY_TTL_MS) {
      idempotencyStore.delete(key);
    }
  }
};

const getIdempotencyKey = (req: Request) => {
  const headerKey = req.get('X-Idempotency-Key');
  const bodyKey = req.body?.idempotencyKey;
  const rawKey = typeof headerKey === 'string' && headerKey.trim() ? headerKey : bodyKey;
  return typeof rawKey === 'string' ? rawKey.trim().slice(0, 200) : '';
};

const getScopedIdempotencyKey = (req: Request, scope: string) => {
  const key = getIdempotencyKey(req);
  if (!key) return '';
  const user = (req as any).user;
  const actor = user?.id ?? req.ip ?? 'public';
  return `${scope}:${actor}:${key}`;
};

const sendIdempotencyResult = (
  res: Response,
  result: IdempotencyResult,
  replayed = false
) => {
  if (replayed) res.setHeader('X-Idempotent-Replay', 'true');
  res.status(result.status).json(result.body);
};

const runIdempotent = async (
  req: Request,
  res: Response,
  scope: string,
  handler: () => Promise<IdempotencyResult>,
  fallback: string
) => {
  const scopedKey = getScopedIdempotencyKey(req, scope);

  try {
    if (!scopedKey) {
      const result = await handler();
      sendIdempotencyResult(res, result);
      return;
    }

    cleanupIdempotencyStore();
    const existing = idempotencyStore.get(scopedKey);
    if (existing) {
      const result = existing.result ?? await existing.promise!;
      sendIdempotencyResult(res, result, true);
      return;
    }

    const promise = handler();
    idempotencyStore.set(scopedKey, { createdAt: Date.now(), promise });

    const result = await promise;
    idempotencyStore.set(scopedKey, { createdAt: Date.now(), result });
    sendIdempotencyResult(res, result);
  } catch (error) {
    const result = toErrorResult(error, fallback);
    if (scopedKey && result.status >= 500) {
      idempotencyStore.set(scopedKey, { createdAt: Date.now(), result });
    } else if (scopedKey) {
      idempotencyStore.delete(scopedKey);
    }
    sendIdempotencyResult(res, result);
  }
};

// Helper: busca itens do pedido com produto aninhado
async function getItemsWithProduct(orderId: string) {
  const items = await orderRepository.findItems(orderId);
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      product: await productRepository.findById(item.productId),
    }))
  );
}

async function getCreatedOrderBody(order: Order) {
  try {
    return { ...order, items: await getItemsWithProduct(order.id) };
  } catch (error) {
    console.error('ORDER RESPONSE ENRICHMENT ERROR:', order.id, error);
    return { ...order, items: [] };
  }
}

const toErrorResult = (error: unknown, fallback: string): IdempotencyResult => {
  if (error instanceof DomainError) {
    return { status: error.status, body: { message: error.message } };
  }
  console.error(error);
  return { status: 500, body: { message: fallback } };
};

const handleError = (res: Response, error: unknown, fallback: string) => {
  sendIdempotencyResult(res, toErrorResult(error, fallback));
};

export const getOrders = async (req: Request, res: Response) => {
  try {
    const { tableId, status, myOrders, waiterId } = req.query;
    const user = (req as any).user;

    const session = await cashRegisterRepository.findOpenSession();
    if (!session) return res.json([]);

    let orders = await orderRepository.findBySession(session.id);

    if (status) {
      const statuses = (status as string).split(',');
      orders = orders.filter((o) => statuses.includes(o.status));
    } else {
      orders = orders.filter((o) => !['FINISHED', 'CANCELED'].includes(o.status));
    }

    if (tableId) orders = orders.filter((o) => o.tableId === tableId);
    if (waiterId) orders = orders.filter((o) => o.waiterId === waiterId);
    if (myOrders === 'true' && user?.id) orders = orders.filter((o) => o.waiterId === user.id);
    if (user?.role === 'WAITER' && user?.id) orders = orders.filter((o) => o.waiterId === user.id);

    const latestPaymentByOrderId = new Map<string, Payment>();
    try {
      const payments = await paymentRepository.findBySession(session.id);
      for (const payment of payments) {
        const current = latestPaymentByOrderId.get(payment.orderId);
        if (!current || payment.createdAt >= current.createdAt) {
          latestPaymentByOrderId.set(payment.orderId, payment);
        }
      }
    } catch (error) {
      console.error('ORDER PAYMENT ENRICHMENT ERROR:', error);
    }

    const enriched = await Promise.all(
      orders.map(async (o) => {
        const items = await orderRepository.findItems(o.id);
        const itemsWithProduct = await Promise.all(
          items.map(async (item) => {
            const product = await productRepository.findById(item.productId);
            return { ...item, product };
          })
        );
        return { ...o, items: itemsWithProduct, payment: latestPaymentByOrderId.get(o.id) ?? null };
      })
    );

    res.json(enriched);
  } catch (error) {
    handleError(res, error, 'Erro ao buscar pedidos');
  }
};

export const getRecentOrders = async (req: Request, res: Response) => {
  try {
    const rawLimit = Number(req.query.limit ?? 5);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 20) : 5;
    const user = (req as any).user;

    const filters: { waiterId?: string } = {};
    if ((req.query.myOrders === 'true' || user?.role === 'WAITER') && user?.id) {
      filters.waiterId = user.id;
    }

    const orders = await orderRepository.findRecentSummaries(limit, filters);

    res.setHeader('Cache-Control', 'no-store');
    res.json(
      orders.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    handleError(res, error, 'Erro ao buscar pedidos recentes');
  }
};

const queryValue = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const allowedQueryValue = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined => {
  const normalized = queryValue(value) as T;
  return allowed.includes(normalized) ? normalized : undefined;
};

export const getOrderHistory = async (req: Request, res: Response) => {
  try {
    const rawPage = Number(req.query.page ?? 1);
    const rawPageSize = Number(req.query.pageSize ?? 20);
    const filters: OrderHistoryFilters = {
      page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
      pageSize: Number.isInteger(rawPageSize) ? Math.min(Math.max(rawPageSize, 1), 50) : 20,
      startDate: queryValue(req.query.startDate) || undefined,
      endDate: queryValue(req.query.endDate) || undefined,
      customerName: queryValue(req.query.customerName) || undefined,
      code: queryValue(req.query.code).replace(/^#/, '') || undefined,
      type: allowedQueryValue(req.query.type, ['DINE_IN', 'TAKE_AWAY', 'DELIVERY'] as const),
      paymentMethod: allowedQueryValue(req.query.paymentMethod, ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'CREDIT'] as const),
      paymentStatus: allowedQueryValue(req.query.paymentStatus, ['PAID', 'PENDING', 'CANCELED'] as const),
      orderStatus: allowedQueryValue(req.query.orderStatus, ['FINISHED', 'CANCELED'] as const),
      source: allowedQueryValue(req.query.source, ['PDV', 'PUBLIC_MENU', 'WAITER'] as const),
      fiscalStatus: allowedQueryValue(req.query.fiscalStatus, ['AUTHORIZED', 'WITHOUT', 'REJECTED'] as const),
      sessionId: queryValue(req.query.sessionId) || undefined,
    };

    res.setHeader('Cache-Control', 'no-store');
    res.json(await orderHistoryRepository.search(filters));
  } catch (error) {
    handleError(res, error, 'Erro ao buscar histórico de pedidos');
  }
};
export const getOrderById = async (req: Request, res: Response) => {
  try {
    const order = await orderRepository.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    const [items, payments] = await Promise.all([
      getItemsWithProduct(order.id),
      paymentRepository.findByOrder(order.id),
    ]);
    res.json({ ...order, items, payment: payments[payments.length - 1] ?? null });
  } catch (error) {
    handleError(res, error, 'Erro ao buscar pedido');
  }
};

export const createOrder = async (req: Request, res: Response) => {
  await runIdempotent(req, res, 'orders:create', async () => {
    const user = (req as any).user;
    const order = await orderService.createOrder(req.body, { id: user.id, role: user.role }, getScopedIdempotencyKey(req, 'orders:create'));
    void notifyStockChanged();
    void notifyOrderChanged(ORDER_EVENTS.created, order);
    return { status: 201, body: await getCreatedOrderBody(order) };
  }, 'Erro ao criar pedido');
};

export const createPublicOrder = async (req: Request, res: Response) => {
  await runIdempotent(req, res, 'orders:create-public', async () => {
    const order = await orderService.createPublicOrder(req.body, getScopedIdempotencyKey(req, 'orders:create-public'));
    void notifyStockChanged();
    void notifyOrderChanged(ORDER_EVENTS.created, order);
    return { status: 201, body: await getCreatedOrderBody(order) };
  }, 'Erro ao criar pedido público');
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const order = await orderService.updateStatus(
      req.params.id,
      req.body.status,
      { id: user.id, role: user.role }
    );
    void notifyStockChanged();
    void notifyOrderChanged(orderMutationEvent(order.status), order);
    const items = await getItemsWithProduct(order.id);
    res.json({ ...order, items });
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar status do pedido');
  }
};

export const processPayment = async (req: Request, res: Response) => {
  try {
    const { method, amount, customerId } = req.body;
    const payment = await orderService.processPayment(
      req.params.id, method, amount ? Number(amount) : undefined, customerId
    );
    void notifyOrderIdChanged(ORDER_EVENTS.updated, req.params.id);
    res.json(payment);
  } catch (error) {
    handleError(res, error, 'Erro ao processar pagamento');
  }
};

export const updateOrder = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const order = await orderService.updateOrder(
      req.params.id,
      req.body,
      { id: user.id, role: user.role }
    );
    void notifyStockChanged();
    void notifyOrderChanged(orderMutationEvent(order.status), order);
    const items = await getItemsWithProduct(order.id);
    res.json({ ...order, items });
  } catch (error) {
    handleError(res, error, 'Erro ao atualizar pedido');
  }
};

export const deleteOrder = async (req: Request, res: Response) => {
  try {
    await orderService.deleteOrder(req.params.id);
    void notifyStockChanged();
    void notifyOrderIdChanged(ORDER_EVENTS.canceled, req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error, 'Erro ao excluir pedido');
  }
};

// PDF
import { PdfService } from '../services/pdf.service';
import { restaurantConfigRepository } from '../repositories/restaurantConfig.repository';

export const getOrderReceipt = async (req: Request, res: Response) => {
  try {
    const order = await orderRepository.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    const items = await getItemsWithProduct(order.id);
    const config = await restaurantConfigRepository.get();
    const pdfBuffer = await PdfService.generateOrderReceipt({ ...order, items } as any, config as any);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=pedido-${order.id.slice(-6)}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    handleError(res, error, 'Erro ao gerar PDF do pedido');
  }
};
