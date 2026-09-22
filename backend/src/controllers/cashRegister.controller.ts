import { Request, Response } from 'express';
import { cashRegisterService } from '../services/cashRegister.service';
import { orderRepository } from '../repositories/order.repository';
import { paymentRepository } from '../repositories/payment.repository';
import { tableRepository } from '../repositories/table.repository';
import { userRepository } from '../repositories/user.repository';
import { DomainError } from '../types/errors';

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof DomainError) {
    return res.status(error.status).json({
      message: error.message,
      code: error.code,
      details: error.details,
    });
  }
  console.error(error);
  return res.status(500).json({ message: fallback });
};

export const getCurrentCashRegister = async (_req: Request, res: Response) => {
  try {
    const session = await cashRegisterService.getCurrentSession();
    res.json(session);
  } catch (error) {
    handleError(res, error, 'Erro ao buscar caixa atual');
  }
};

export const getCashRegisterHistory = async (_req: Request, res: Response) => {
  try {
    const sessions = await cashRegisterService.getHistory(20);
    res.json(sessions);
  } catch (error) {
    handleError(res, error, 'Erro ao buscar histórico do caixa');
  }
};

export const getCashClosuresHistory = async (req: Request, res: Response) => {
  try {
    const rawPage = Number(req.query.page ?? 1);
    const rawPageSize = Number(req.query.pageSize ?? 10);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Number.isInteger(rawPageSize) ? Math.min(Math.max(rawPageSize, 1), 30) : 10;
    const startDate = typeof req.query.startDate === 'string' && req.query.startDate ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' && req.query.endDate ? req.query.endDate : undefined;

    res.setHeader('Cache-Control', 'no-store');
    res.json(await cashRegisterService.getHistoryPage({ page, pageSize, startDate, endDate }));
  } catch (error) {
    handleError(res, error, 'Erro ao buscar fechamentos de caixa');
  }
};
export const suggestWithdrawalAmount = async (_req: Request, res: Response) => {
  try {
    const result = await cashRegisterService.suggestWithdrawal();
    res.json(result);
  } catch (error) {
    handleError(res, error, 'Erro ao sugerir valor de sangria');
  }
};

export const openCashRegister = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { openingAmount, notes } = req.body;
    const session = await cashRegisterService.openSession(
      Number(openingAmount || 0),
      notes || null,
      user.id
    );
    res.status(201).json(session);
  } catch (error) {
    handleError(res, error, 'Erro ao abrir caixa');
  }
};

export const closeCashRegister = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { closingAmount, notes } = req.body;
    const session = await cashRegisterService.closeSession(
      Number(closingAmount || 0),
      notes || null,
      user.id
    );
    res.json(session);
  } catch (error) {
    handleError(res, error, 'Erro ao fechar caixa');
  }
};

export const createCashWithdrawal = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { amount, reason } = req.body;
    const withdrawal = await cashRegisterService.addWithdrawal(
      Number(amount),
      String(reason || '').trim(),
      user.id
    );
    res.status(201).json(withdrawal);
  } catch (error) {
    handleError(res, error, 'Erro ao registrar sangria');
  }
};

/**
 * Histórico de pedidos fechados por sessão de caixa.
 * Mantém a lógica de filtros do legado.
 */
export const getClosedOrdersHistory = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, customerName } = req.query;

    const sessions = await cashRegisterService.getHistory(30);
    const closed = sessions.filter((session) => session.status === 'CLOSED');

    const history = await Promise.all(
      closed.map(async (session) => {
        if (startDate || endDate) {
          const sessionDate = session.openedAt;
          if (startDate && sessionDate < new Date(`${startDate}T00:00:00.000`)) return null;
          if (endDate && sessionDate > new Date(`${endDate}T23:59:59.999`)) return null;
        }

        const orders = await orderRepository.findBySession(session.id);
        const nonCanceled = orders.filter((order) => order.status !== 'CANCELED');
        const normalizedCustomerName = String(customerName || '').trim().toLocaleLowerCase('pt-BR');
        const matchingOrders = normalizedCustomerName
          ? nonCanceled.filter((order) =>
              (order.customerName || '').toLocaleLowerCase('pt-BR').includes(normalizedCustomerName)
            )
          : nonCanceled;

        const enrichedOrders = await Promise.all(
          matchingOrders.map(async (order) => {
            const [items, payments, table, waiter, user] = await Promise.all([
              orderRepository.findItems(order.id),
              paymentRepository.findByOrder(order.id),
              order.tableId ? tableRepository.findById(order.tableId) : Promise.resolve(null),
              order.waiterId ? userRepository.findById(order.waiterId) : Promise.resolve(null),
              order.userId ? userRepository.findById(order.userId) : Promise.resolve(null),
            ]);
            return {
              ...order,
              items,
              payment: payments[payments.length - 1] ?? null,
              table: table ? { id: table.id, number: table.number } : null,
              waiter: waiter ? { id: waiter.id, name: waiter.name } : null,
              user: user ? { id: user.id, name: user.name } : null,
            };
          })
        );

        return {
          ...session,
          matchedOrdersCount: enrichedOrders.length,
          totalOrdersInSession: nonCanceled.length,
          orders: enrichedOrders,
        };
      })
    );

    res.json(history.filter(Boolean));
  } catch (error) {
    handleError(res, error, 'Erro ao buscar histórico de pedidos do caixa');
  }
};
