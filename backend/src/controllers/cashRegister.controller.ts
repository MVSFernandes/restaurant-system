import { Request, Response } from 'express';
import { cashRegisterService } from '../services/cashRegister.service';
import { orderRepository } from '../repositories/order.repository';
import { paymentRepository } from '../repositories/payment.repository';
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
    const { startDate, endDate } = req.query;

    const sessions = await cashRegisterService.getHistory(30);
    const closed = sessions.filter((s) => s.status === 'CLOSED');

    const history = await Promise.all(
      closed.map(async (session) => {
        if (startDate || endDate) {
          const sessionDate = session.openedAt;
          if (startDate && sessionDate < new Date(`${startDate}T00:00:00.000`)) return null;
          if (endDate && sessionDate > new Date(`${endDate}T23:59:59.999`)) return null;
        }

        const orders = await orderRepository.findBySession(session.id);
        const nonCanceled = orders.filter((o) => o.status !== 'CANCELED');

        // Enriquece cada pedido com seus itens (frontend usa order.items.map)
        const enrichedOrders = await Promise.all(
          nonCanceled.map(async (o) => {
            const [items, payments] = await Promise.all([
              orderRepository.findItems(o.id),
              paymentRepository.findByOrder(o.id),
            ]);
            return {
              ...o,
              items,
              payment: payments[payments.length - 1] ?? null,
            };
          })
        );

        return {
          ...session,
          matchedOrdersCount: enrichedOrders.length,
          totalOrdersInSession: enrichedOrders.length,
          orders: enrichedOrders,
        };
      })
    );

    res.json(history.filter(Boolean));
  } catch (error) {
    handleError(res, error, 'Erro ao buscar histórico de pedidos do caixa');
  }
};
