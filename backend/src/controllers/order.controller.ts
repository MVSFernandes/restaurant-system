import { Request, Response } from 'express';
import { orderService } from '../services/order.service';
import { orderRepository } from '../repositories/order.repository';
import { cashRegisterRepository } from '../repositories/cashRegister.repository';
import { notifyStockChanged } from '../services/stockRealtime.service';
import { DomainError } from '../types/errors';
import { productRepository } from '../repositories/product.repository';

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
    if (scopedKey) idempotencyStore.delete(scopedKey);
    handleError(res, error, fallback);
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

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof DomainError) return res.status(error.status).json({ message: error.message });
  console.error(error);
  return res.status(500).json({ message: fallback });
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

    const enriched = await Promise.all(
      orders.map(async (o) => {
        const items = await orderRepository.findItems(o.id);
        const itemsWithProduct = await Promise.all(
          items.map(async (item) => {
            const product = await productRepository.findById(item.productId);
            return { ...item, product };
          })
        );
        return { ...o, items: itemsWithProduct };
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

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const order = await orderRepository.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    const items = await getItemsWithProduct(order.id);
    res.json({ ...order, items });
  } catch (error) {
    handleError(res, error, 'Erro ao buscar pedido');
  }
};

export const createOrder = async (req: Request, res: Response) => {
  await runIdempotent(req, res, 'orders:create', async () => {
    const user = (req as any).user;
    const order = await orderService.createOrder(req.body, { id: user.id, role: user.role });
    void notifyStockChanged();
    const items = await getItemsWithProduct(order.id);
    return { status: 201, body: { ...order, items } };
  }, 'Erro ao criar pedido');
};

export const createPublicOrder = async (req: Request, res: Response) => {
  await runIdempotent(req, res, 'orders:create-public', async () => {
    const order = await orderService.createPublicOrder(req.body);
    void notifyStockChanged();
    const items = await getItemsWithProduct(order.id);
    return { status: 201, body: { ...order, items } };
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

export const getCompanyReceipt = async (req: Request, res: Response) => {
  try {
    const { companyName, companyCnpj } = req.query;
    const order = await orderRepository.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    const items = await getItemsWithProduct(order.id);
    const config = await restaurantConfigRepository.get();
    const pdfBuffer = await PdfService.generateCompanyReceipt(
      { ...order, items } as any,
      config as any,
      { name: (companyName as string) || 'N/A', cnpj: (companyCnpj as string) || 'N/A' }
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=recibo-empresa-${order.id.slice(-6)}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    handleError(res, error, 'Erro ao gerar recibo para empresa');
  }
};
