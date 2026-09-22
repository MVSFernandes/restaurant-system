import { createId } from '@paralleldrive/cuid2';
import { cashRegisterRepository } from '../repositories/cashRegister.repository';
import { paymentRepository } from '../repositories/payment.repository';
import { auditLogRepository } from '../repositories/auditLog.repository';
import { orderRepository } from '../repositories/order.repository';
import { userRepository } from '../repositories/user.repository';
import { invoiceRepository } from '../repositories/invoice.repository';
import { CashRegisterSession, CashWithdrawal, PaymentMethod } from '../types/domain';
import {
  CashRegisterClosedError,
  PendingCashRegisterOrdersError,
  ValidationError,
} from '../types/errors';
import { formatBRL } from '../utils/currency';

export interface OperatorSummary {
  id: string;
  name: string;
}

export interface CashWithdrawalSummary extends CashWithdrawal {
  createdBy: OperatorSummary | null;
}

export interface FiscalDocumentSummary {
  authorizedNfceCount: number;
  authorizedNfceTotal: number;
  authorizedNfeCount: number;
  authorizedNfeTotal: number;
  pendingOrRejectedCount: number;
}

export interface SessionSummary extends CashRegisterSession {
  openedBy: OperatorSummary | null;
  closedBy: OperatorSummary | null;
  totalEntries: number;
  totalWithdrawals: number;
  expectedBalance: number;
  pixTotal: number;
  creditTotal: number;
  debitTotal: number;
  onAccountTotal: number;
  totalRevenue: number;
  orderCount: number;
  fiscalDocuments: FiscalDocumentSummary;
  withdrawals: CashWithdrawalSummary[];
}

export interface SuggestWithdrawalResult {
  suggestedAmount: number;
  totalCashReceived: number;
  totalWithdrawn: number;
  openingAmount: number;
  message: string | null;
}

type PaymentTotals = Record<PaymentMethod, number>;

async function getPaymentTotals(sessionId: string): Promise<PaymentTotals> {
  const [payments, orders] = await Promise.all([
    paymentRepository.findBySession(sessionId),
    orderRepository.findBySession(sessionId),
  ]);
  const nonCanceledOrderIds = new Set(
    orders
      .filter((order) => order.status !== 'CANCELED')
      .map((order) => order.id)
  );
  const paid = payments.filter(
    (payment) => payment.status === 'PAID' && nonCanceledOrderIds.has(payment.orderId)
  );
  const totals: PaymentTotals = {
    CASH: 0,
    PIX: 0,
    CREDIT_CARD: 0,
    DEBIT_CARD: 0,
    CREDIT: 0,
  };

  for (const payment of paid) {
    totals[payment.method] += Number(payment.amount);
  }
  return totals;
}

async function findOperator(id: string | null): Promise<OperatorSummary | null> {
  if (!id) return null;
  const user = await userRepository.findById(id);
  return user ? { id: user.id, name: user.name } : null;
}

async function enrichSession(session: CashRegisterSession): Promise<SessionSummary> {
  const [paymentTotals, withdrawals, orders, openedBy, closedBy] = await Promise.all([
    getPaymentTotals(session.id),
    cashRegisterRepository.findWithdrawalsBySession(session.id),
    orderRepository.findBySession(session.id),
    findOperator(session.openedById),
    findOperator(session.closedById),
  ]);

  const nonCanceledOrders = orders.filter((order) => order.status !== 'CANCELED');
  const orderTotals = new Map(nonCanceledOrders.map((order) => [order.id, Number(order.total || 0)]));
  const invoices = await invoiceRepository.findAllForOrders([...orderTotals.keys()]);
  const fiscalDocuments: FiscalDocumentSummary = {
    authorizedNfceCount: 0,
    authorizedNfceTotal: 0,
    authorizedNfeCount: 0,
    authorizedNfeTotal: 0,
    pendingOrRejectedCount: 0,
  };

  for (const invoice of invoices) {
    if (invoice.status === 'authorized') {
      const amount = invoice.orderId ? orderTotals.get(invoice.orderId) ?? 0 : 0;
      if (invoice.model === '65') {
        fiscalDocuments.authorizedNfceCount += 1;
        fiscalDocuments.authorizedNfceTotal += amount;
      } else {
        fiscalDocuments.authorizedNfeCount += 1;
        fiscalDocuments.authorizedNfeTotal += amount;
      }
    } else if (['error', 'pending', 'processing'].includes(invoice.status)) {
      fiscalDocuments.pendingOrRejectedCount += 1;
    }
  }
  const enrichedWithdrawals = await Promise.all(
    withdrawals.map(async (withdrawal): Promise<CashWithdrawalSummary> => ({
      ...withdrawal,
      createdBy: await findOperator(withdrawal.createdById),
    }))
  );
  const totalWithdrawals = withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
  const totalEntries = paymentTotals.CASH;
  const expectedBalance = session.openingAmount + totalEntries - totalWithdrawals;
  const totalRevenue = Object.values(paymentTotals).reduce((sum, value) => sum + value, 0);

  return {
    ...session,
    openedBy,
    closedBy,
    totalEntries,
    totalWithdrawals,
    expectedBalance,
    pixTotal: paymentTotals.PIX,
    creditTotal: paymentTotals.CREDIT_CARD,
    debitTotal: paymentTotals.DEBIT_CARD,
    onAccountTotal: paymentTotals.CREDIT,
    totalRevenue,
    orderCount: nonCanceledOrders.length,
    fiscalDocuments,
    withdrawals: enrichedWithdrawals,
  };
}

export const cashRegisterService = {
  async getCurrentSession(): Promise<SessionSummary | null> {
    const session = await cashRegisterRepository.findOpenSession();
    if (!session) return null;
    return enrichSession(session);
  },

  async getHistory(limit = 20): Promise<SessionSummary[]> {
    const sessions = await cashRegisterRepository.findRecentSessions(limit);
    return Promise.all(sessions.map(enrichSession));
  },

  async suggestWithdrawal(): Promise<SuggestWithdrawalResult> {
    const session = await cashRegisterRepository.findOpenSession();
    if (!session) throw new CashRegisterClosedError();

    const paymentTotals = await getPaymentTotals(session.id);
    const withdrawals = await cashRegisterRepository.findWithdrawalsBySession(session.id);
    const totalWithdrawn = withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
    const suggestedAmount = Math.max(0, paymentTotals.CASH - totalWithdrawn);
    const roundedSuggestion = Math.round(suggestedAmount * 100) / 100;

    return {
      suggestedAmount: roundedSuggestion,
      totalCashReceived: paymentTotals.CASH,
      totalWithdrawn,
      openingAmount: session.openingAmount,
      message: roundedSuggestion === 0
        ? `A gaveta tem apenas o fundo de ${formatBRL(session.openingAmount)}. Não há valor a retirar.`
        : null,
    };
  },

  async openSession(
    openingAmount: number,
    notes: string | null,
    actingUserId: string
  ): Promise<SessionSummary> {
    const existing = await cashRegisterRepository.findOpenSession();
    if (existing) throw new ValidationError('session', 'Já existe um caixa aberto.');
    if (openingAmount < 0) {
      throw new ValidationError('openingAmount', 'O valor de abertura não pode ser negativo.');
    }

    const session = await cashRegisterRepository.openSession({
      id: createId(),
      status: 'OPEN',
      openingAmount,
      closingAmount: null,
      withdrawalTotal: 0,
      notes,
      openedById: actingUserId,
      closedById: null,
      openedAt: new Date(),
      closedAt: null,
    });

    await auditLogRepository.log({
      id: createId(),
      userId: actingUserId,
      action: 'CASH_REGISTER_OPENED',
      entity: 'CashRegisterSession',
      entityId: session.id,
      details: JSON.stringify({ openingAmount, notes, openedAt: session.openedAt }),
      createdAt: new Date(),
    });

    return enrichSession(session);
  },

  async closeSession(
    closingAmount: number,
    notes: string | null,
    actingUserId: string
  ): Promise<SessionSummary> {
    const session = await cashRegisterRepository.findOpenSession();
    if (!session) throw new CashRegisterClosedError();
    if (closingAmount < 0) {
      throw new ValidationError('closingAmount', 'O valor de fechamento não pode ser negativo.');
    }

    const pendingOrders = await cashRegisterRepository.findPendingOrdersForClose(session.id);
    if (pendingOrders.length > 0) {
      await auditLogRepository.log({
        id: createId(),
        userId: actingUserId,
        action: 'CASH_CLOSE_BLOCKED',
        entity: 'CashRegisterSession',
        entityId: session.id,
        details: JSON.stringify({
          pendingOrders,
          attemptedClosingAmount: closingAmount,
          attemptedAt: new Date().toISOString(),
        }),
        createdAt: new Date(),
      });
      throw new PendingCashRegisterOrdersError(pendingOrders);
    }

    const paymentTotals = await getPaymentTotals(session.id);
    const withdrawals = await cashRegisterRepository.findWithdrawalsBySession(session.id);
    const withdrawalTotal = withdrawals.reduce((sum, withdrawal) => sum + withdrawal.amount, 0);
    const expectedAmount = session.openingAmount + paymentTotals.CASH - withdrawalTotal;
    const closingDate = new Date();
    const difference = Math.round((closingAmount - expectedAmount) * 100) / 100;

    if (difference !== 0 && !notes?.trim()) {
      throw new ValidationError(
        'notes',
        'Informe uma justificativa para a diferença encontrada no fechamento.'
      );
    }

    const updated = await cashRegisterRepository.closeOpenSession(session.id, {
      status: 'CLOSED',
      closingAmount,
      notes: notes?.trim() || session.notes,
      closedAt: closingDate,
      closedById: actingUserId,
      withdrawalTotal,
    });

    await auditLogRepository.log({
      id: createId(),
      userId: actingUserId,
      action: 'CASH_REGISTER_CLOSED',
      entity: 'CashRegisterSession',
      entityId: session.id,
      details: JSON.stringify({
        openingAmount: session.openingAmount,
        totalEntries: paymentTotals.CASH,
        closingAmount,
        withdrawalTotal,
        expectedAmount,
        difference,
        justification: notes?.trim() || null,
        closedAt: closingDate.toISOString(),
        pixTotal: paymentTotals.PIX,
        creditTotal: paymentTotals.CREDIT_CARD,
        debitTotal: paymentTotals.DEBIT_CARD,
        onAccountTotal: paymentTotals.CREDIT,
      }),
      createdAt: new Date(),
    });

    return enrichSession(updated);
  },

  async addWithdrawal(
    amount: number,
    reason: string,
    actingUserId: string
  ): Promise<CashWithdrawalSummary> {
    const session = await cashRegisterRepository.findOpenSession();
    if (!session) throw new CashRegisterClosedError();
    if (!amount || amount <= 0 || !reason.trim()) {
      throw new ValidationError('withdrawal', 'Informe valor e motivo da sangria.');
    }

    const withdrawal = await cashRegisterRepository.addWithdrawal({
      id: createId(),
      sessionId: session.id,
      amount,
      reason: reason.trim(),
      createdById: actingUserId,
      createdAt: new Date(),
    });

    await auditLogRepository.log({
      id: createId(),
      userId: actingUserId,
      action: 'CASH_WITHDRAWAL',
      entity: 'CashWithdrawal',
      entityId: withdrawal.id,
      details: JSON.stringify({ amount, reason: reason.trim(), sessionId: session.id }),
      createdAt: new Date(),
    });

    return {
      ...withdrawal,
      createdBy: await findOperator(withdrawal.createdById),
    };
  },
};
