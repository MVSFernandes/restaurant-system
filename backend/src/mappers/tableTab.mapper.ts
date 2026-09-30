import { TableTab, TableTabStatus } from '../types/domain';

export type TableTabRow = {
  id: string;
  table_id: string;
  cash_register_session_id: string;
  name: string;
  status: string;
  opened_by_id: string;
  closed_by_id: string | null;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
};

export type TableTabInsert = {
  id: string;
  table_id: string;
  cash_register_session_id: string;
  name: string;
  status: string;
  opened_by_id: string;
  closed_by_id: string | null;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
};

export function toTableTabDomain(row: TableTabRow): TableTab {
  return {
    id: row.id,
    tableId: row.table_id,
    cashRegisterSessionId: row.cash_register_session_id,
    name: row.name,
    status: row.status as TableTabStatus,
    openedById: row.opened_by_id,
    closedById: row.closed_by_id,
    openedAt: new Date(row.opened_at),
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    updatedAt: new Date(row.updated_at),
  };
}

export function toTableTabInsert(tab: TableTab): TableTabInsert {
  return {
    id: tab.id,
    table_id: tab.tableId,
    cash_register_session_id: tab.cashRegisterSessionId,
    name: tab.name,
    status: tab.status,
    opened_by_id: tab.openedById,
    closed_by_id: tab.closedById,
    opened_at: tab.openedAt.toISOString(),
    closed_at: tab.closedAt?.toISOString() ?? null,
    updated_at: tab.updatedAt.toISOString(),
  };
}
