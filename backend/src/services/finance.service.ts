import { createId } from '@paralleldrive/cuid2';
import { payableAccountRepository } from '../repositories/payableAccount.repository';
import { PayableAccount } from '../types/domain';
import { NotFoundError } from '../types/errors';
import { dayRangeUtc, subtractCalendarPeriodUtc } from '../utils/datetime';

// Tipos do relatório financeiro (espelha o retorno da RPC finance_report)
export interface FinanceReportResult {
  totalRevenue: number;
  totalExpenses: number;
  totalWithdrawals: number;
  netProfit: number;
  totalOrders: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  topCustomers: Array<{ name: string; totalSpent: number; orderCount: number }>;
  paymentMethods: Record<string, number>;
}

export type ReportPeriod = 'today' | 'week' | 'month' | 'year';

export function periodToDates(
  period: ReportPeriod,
  now = new Date()
): { startDate: string; endDate: string } {
  let start: Date;
  let end = now;

  switch (period) {
    case 'today': {
      const range = dayRangeUtc(now);
      start = range.start;
      end = range.endExclusive;
      break;
    }
    case 'week':
      start = subtractCalendarPeriodUtc(now, { days: 7 });
      break;
    case 'year':
      start = subtractCalendarPeriodUtc(now, { years: 1 });
      break;
    case 'month':
    default:
      start = subtractCalendarPeriodUtc(now, { months: 1 });
      break;
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

export const financeService = {
  // ---- PAYABLE ACCOUNTS ----

  async listPayables(): Promise<PayableAccount[]> {
    return payableAccountRepository.findAll();
  },

  async createPayable(input: {
    description: string;
    amount: number;
    dueDate: Date;
    supplierId?: string | null;
  }): Promise<PayableAccount> {
    return payableAccountRepository.create({
      id: createId(),
      description: input.description,
      amount: parseFloat(String(input.amount)),
      dueDate: input.dueDate,
      paid: false,
      paidAt: null,
      supplierId: input.supplierId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  },

  async updatePayable(
    id: string,
    input: {
      description?: string;
      amount?: number;
      dueDate?: Date;
      supplierId?: string | null;
    }
  ): Promise<PayableAccount> {
    const existing = await payableAccountRepository.findById(id);
    if (!existing) throw new NotFoundError('PayableAccount', id);

    return payableAccountRepository.update(id, {
      description: input.description,
      amount: input.amount !== undefined ? parseFloat(String(input.amount)) : undefined,
      dueDate: input.dueDate,
      supplierId: input.supplierId,
    });
  },

  async deletePayable(id: string): Promise<void> {
    const existing = await payableAccountRepository.findById(id);
    if (!existing) throw new NotFoundError('PayableAccount', id);
    return payableAccountRepository.delete(id);
  },

  async markAsPaid(id: string): Promise<PayableAccount> {
    return payableAccountRepository.markAsPaid(id);
  },

  // ---- RELATÓRIO FINANCEIRO ----
  // Nota: na Onda 6, isso será delegado pra RPC finance_report do Supabase.
  // Por ora mantemos a lógica aqui pra garantir paridade com o legado.
  async getReport(period: ReportPeriod = 'month'): Promise<{ period: ReportPeriod; dates: ReturnType<typeof periodToDates> }> {
    const dates = periodToDates(period);
    // TODO Onda 6: chamar supabase.rpc('finance_report', { p_start_date, p_end_date })
    // e mapear o resultado pro formato FinanceReportResult.
    // Por ora retorna os parâmetros pra o controller chamar o Prisma legado.
    return { period, dates };
  },
};