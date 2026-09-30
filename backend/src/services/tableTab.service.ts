import { createId } from '@paralleldrive/cuid2';
import { cashRegisterRepository } from '../repositories/cashRegister.repository';
import { tableRepository } from '../repositories/table.repository';
import { tableTabRepository } from '../repositories/tableTab.repository';
import type {
  PaymentMethod,
  TableTabDetail,
  TableTabStatus,
  TableTabSummary,
  WaiterTableOverview,
} from '../types/domain';
import { CashRegisterClosedError, NotFoundError, ValidationError } from '../types/errors';

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CREDIT',
];

export type TableOverviewView = 'all' | 'mine' | 'free';

function normalizedName(name: unknown): string {
  const value = String(name ?? '').trim();
  if (!value) throw new ValidationError('name', 'Informe o nome da comanda');
  return value;
}

export const tableTabService = {
  async listTableOverview(
    currentUserId: string,
    view: TableOverviewView = 'all',
    now = new Date()
  ): Promise<WaiterTableOverview[]> {
    const [tables, openTabs] = await Promise.all([
      tableRepository.findAll(),
      tableTabRepository.findAllOpenSummaries(),
    ]);

    const overview = tables.map((table) => {
      const tabs = openTabs.filter((tab) => tab.tableId === table.id);
      const openedAt = tabs.reduce<Date | null>(
        (earliest, tab) => !earliest || tab.openedAt < earliest ? tab.openedAt : earliest,
        null
      );
      return {
        ...table,
        openBalance: tabs.reduce((sum, tab) => sum + tab.balance, 0),
        openTabCount: tabs.length,
        openedAt,
        openForMinutes: openedAt
          ? Math.max(0, Math.floor((now.getTime() - openedAt.getTime()) / 60_000))
          : null,
        hasCurrentWaiterTab: tabs.some((tab) => tab.openedById === currentUserId),
      };
    });

    if (view === 'mine') return overview.filter((table) => table.hasCurrentWaiterTab);
    if (view === 'free') return overview.filter((table) => table.status === 'AVAILABLE');
    return overview;
  },

  async listForTable(
    tableId: string,
    status?: TableTabStatus
  ): Promise<{ tabs: TableTabSummary[]; total: number; balance: number }> {
    const table = await tableRepository.findById(tableId);
    if (!table) throw new NotFoundError('Table', tableId);
    const tabs = await tableTabRepository.findByTable(tableId, status);
    const openTabs = tabs.filter((tab) => tab.status === 'OPEN');
    return {
      tabs,
      total: openTabs.reduce((sum, tab) => sum + tab.total, 0),
      balance: openTabs.reduce((sum, tab) => sum + tab.balance, 0),
    };
  },

  async findById(id: string): Promise<TableTabDetail> {
    const tab = await tableTabRepository.findDetailById(id);
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
    if (!['AVAILABLE', 'OCCUPIED'].includes(table.status)) {
      throw new ValidationError('tableId', 'A mesa não está disponível para abrir comanda');
    }
    if (!session) throw new CashRegisterClosedError();
    if (duplicate) {
      throw new ValidationError('name', 'Já existe uma comanda aberta com esse nome nesta mesa');
    }

    const now = new Date();
    const created = await tableTabRepository.openAtomic({
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
    return {
      ...created,
      total: 0,
      paidTotal: 0,
      balance: 0,
      orderCount: 0,
      itemCount: 0,
      lastOrderAt: null,
      orders: [],
    };
  },

  async rename(id: string, name: unknown): Promise<TableTabDetail> {
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
