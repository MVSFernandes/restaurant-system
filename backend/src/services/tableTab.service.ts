import { createId } from '@paralleldrive/cuid2';
import { cashRegisterRepository } from '../repositories/cashRegister.repository';
import { tableRepository } from '../repositories/table.repository';
import { tableTabRepository } from '../repositories/tableTab.repository';
import type { PaymentMethod, TableTabStatus, TableTabSummary } from '../types/domain';
import { CashRegisterClosedError, NotFoundError, ValidationError } from '../types/errors';

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CREDIT',
];

function normalizedName(name: unknown): string {
  const value = String(name ?? '').trim();
  if (!value) throw new ValidationError('name', 'Informe o nome da comanda');
  return value;
}

export const tableTabService = {
  async listForTable(
    tableId: string,
    status?: TableTabStatus
  ): Promise<{ tabs: TableTabSummary[]; total: number }> {
    const table = await tableRepository.findById(tableId);
    if (!table) throw new NotFoundError('Table', tableId);
    const tabs = await tableTabRepository.findByTable(tableId, status);
    const total = tabs
      .filter((tab) => tab.status === 'OPEN')
      .reduce((sum, tab) => sum + tab.total, 0);
    return { tabs, total };
  },

  async findById(id: string): Promise<TableTabSummary> {
    const tab = await tableTabRepository.findSummaryById(id);
    if (!tab) throw new NotFoundError('TableTab', id);
    return tab;
  },

  async create(tableId: string, name: unknown, userId: string): Promise<TableTabSummary> {
    const normalized = normalizedName(name);
    const [table, session, duplicate] = await Promise.all([
      tableRepository.findById(tableId),
      cashRegisterRepository.findOpenSession(),
      tableTabRepository.findOpenByName(tableId, normalized),
    ]);
    if (!table) throw new NotFoundError('Table', tableId);
    if (table.status !== 'OCCUPIED') {
      throw new ValidationError('tableId', 'A comanda só pode ser aberta em uma mesa ocupada');
    }
    if (!session) throw new CashRegisterClosedError();
    if (duplicate) {
      throw new ValidationError('name', 'Já existe uma comanda aberta com esse nome nesta mesa');
    }

    const now = new Date();
    const created = await tableTabRepository.create({
      id: createId(),
      tableId,
      cashRegisterSessionId: session.id,
      name: normalized,
      status: 'OPEN',
      openedById: userId,
      closedById: null,
      openedAt: now,
      closedAt: null,
      updatedAt: now,
    });
    return { ...created, total: 0, paidTotal: 0, balance: 0, orderCount: 0, orders: [] };
  },

  async rename(id: string, name: unknown): Promise<TableTabSummary> {
    const normalized = normalizedName(name);
    const tab = await tableTabRepository.findById(id);
    if (!tab) throw new NotFoundError('TableTab', id);
    if (tab.status !== 'OPEN') {
      throw new ValidationError('status', 'Comanda fechada não pode ser alterada');
    }
    const duplicate = await tableTabRepository.findOpenByName(tab.tableId, normalized);
    if (duplicate && duplicate.id !== id) {
      throw new ValidationError('name', 'Já existe uma comanda aberta com esse nome nesta mesa');
    }
    await tableTabRepository.rename(id, normalized);
    return this.findById(id);
  },

  async close(
    id: string,
    method: unknown,
    customerId: string | null | undefined,
    userId: string
  ): Promise<TableTabSummary> {
    const tab = await this.findById(id);
    if (tab.status === 'CLOSED') return tab;

    const normalizedMethod = method == null || method === ''
      ? null
      : String(method).trim().toUpperCase() as PaymentMethod;
    if (tab.balance > 0 && !normalizedMethod) {
      throw new ValidationError('method', 'Informe a forma de pagamento');
    }
    if (normalizedMethod && !PAYMENT_METHODS.includes(normalizedMethod)) {
      throw new ValidationError('method', 'Informe uma forma de pagamento válida');
    }
    if (normalizedMethod === 'CREDIT' && !customerId) {
      throw new ValidationError('customerId', 'Selecione um cliente para lançar no fiado');
    }

    return tableTabRepository.close(id, normalizedMethod, customerId ?? null, userId);
  },
};
