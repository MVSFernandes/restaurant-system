import { supabase } from '../lib/supabase';
import { mapSupabaseError } from '../middlewares/errorHandler.middleware';
import { toTableTabDomain } from '../mappers/tableTab.mapper';
import { toOrderItemDomain } from '../mappers/orderItem.mapper';
import type {
  OrderStatus,
  PaymentMethod,
  TableTab,
  TableTabDetail,
  TableTabStatus,
  TableTabSummary,
} from '../types/domain';
import { NotFoundError } from '../types/errors';

const TABLE = 'table_tabs';
const SUMMARY_SELECT = '*,orders(id,status,total,created_at,updated_at,order_items(id),payments(amount,status))';
const DETAIL_SELECT = '*,orders(id,status,total,created_at,updated_at,order_items(*),payments(amount,status))';

type SummaryOrderRow = {
  id: string;
  status: string;
  total: number;
  created_at: string;
  updated_at: string;
  order_items?: Array<Record<string, any>> | Record<string, any> | null;
  payments?: Array<{ amount: number; status: string }> | { amount: number; status: string } | null;
};

type SummaryRow = {
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
  orders?: SummaryOrderRow[] | SummaryOrderRow | null;
};

const relationMany = <T>(value: T | T[] | null | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

function summaryTotals(row: SummaryRow) {
  const rows = relationMany(row.orders);
  const orders = rows.map((order) => ({
    id: order.id,
    status: order.status as OrderStatus,
    total: Number(order.total),
    createdAt: new Date(order.created_at),
    updatedAt: new Date(order.updated_at),
    itemCount: relationMany(order.order_items).length,
  }));
  const total = rows
    .filter((order) => order.status !== 'CANCELED')
    .reduce((sum, order) => sum + Number(order.total), 0);
  const paidTotal = rows.reduce(
    (sum, order) => sum + relationMany(order.payments)
      .filter((payment) => payment.status === 'PAID')
      .reduce((paymentSum, payment) => paymentSum + Number(payment.amount), 0),
    0
  );
  const activeRows = rows.filter((order) => order.status !== 'CANCELED');
  const itemCount = activeRows.reduce(
    (sum, order) => sum + relationMany(order.order_items).length,
    0
  );
  const lastOrderAt = rows.reduce<Date | null>((latest, order) => {
    const createdAt = new Date(order.created_at);
    return !latest || createdAt > latest ? createdAt : latest;
  }, null);

  return {
    total,
    paidTotal,
    balance: Math.max(0, total - paidTotal),
    orderCount: orders.length,
    itemCount,
    lastOrderAt,
    orders,
  };
}

export function toTableTabSummary(row: SummaryRow): TableTabSummary {
  return {
    ...toTableTabDomain(row as any),
    ...summaryTotals(row),
  };
}

function toDetail(row: SummaryRow): TableTabDetail {
  const summary = toTableTabSummary(row);
  const orderRows = relationMany(row.orders);
  return {
    ...summary,
    orders: summary.orders.map((order) => {
      const source = orderRows.find((candidate) => candidate.id === order.id);
      return {
        ...order,
        items: relationMany(source?.order_items).map((item) => toOrderItemDomain(item as any)),
      };
    }),
  };
}

export const tableTabRepository = {
  async findById(id: string): Promise<TableTab | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw mapSupabaseError(error, { entity: 'TableTab' });
    return data ? toTableTabDomain(data as any) : null;
  },

  async findSummaryById(id: string): Promise<TableTabSummary | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(SUMMARY_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw mapSupabaseError(error, { entity: 'TableTab' });
    return data ? toTableTabSummary(data as unknown as SummaryRow) : null;
  },

  async findDetailById(id: string): Promise<TableTabDetail | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(DETAIL_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw mapSupabaseError(error, { entity: 'TableTab' });
    return data ? toDetail(data as unknown as SummaryRow) : null;
  },

  async findByTable(tableId: string, status?: TableTabStatus): Promise<TableTabSummary[]> {
    let query = supabase
      .from(TABLE)
      .select(SUMMARY_SELECT)
      .eq('table_id', tableId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('opened_at', { ascending: true });
    if (error) throw mapSupabaseError(error, { entity: 'TableTab' });
    return ((data ?? []) as unknown as SummaryRow[]).map(toTableTabSummary);
  },

  async findAllOpenSummaries(): Promise<TableTabSummary[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select(SUMMARY_SELECT)
      .eq('status', 'OPEN')
      .order('opened_at', { ascending: true });
    if (error) throw mapSupabaseError(error, { entity: 'TableTab' });
    return ((data ?? []) as unknown as SummaryRow[]).map(toTableTabSummary);
  },

  async findOpenByName(tableId: string, name: string): Promise<TableTab | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('table_id', tableId)
      .eq('status', 'OPEN')
      .ilike('name', name.trim())
      .limit(1)
      .maybeSingle();
    if (error) throw mapSupabaseError(error, { entity: 'TableTab' });
    return data ? toTableTabDomain(data as any) : null;
  },

  async hasOpenByTable(tableId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id')
      .eq('table_id', tableId)
      .eq('status', 'OPEN')
      .limit(1)
      .maybeSingle();
    if (error) throw mapSupabaseError(error, { entity: 'TableTab' });
    return Boolean(data);
  },

  async findOpenBySession(sessionId: string): Promise<TableTab[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('cash_register_session_id', sessionId)
      .eq('status', 'OPEN')
      .order('opened_at', { ascending: true });
    if (error) throw mapSupabaseError(error, { entity: 'TableTab' });
    return (data ?? []).map((row) => toTableTabDomain(row as any));
  },

  async openAtomic(tab: TableTab): Promise<TableTab> {
    const { data, error } = await supabase.rpc('open_table_tab', {
      p_id: tab.id,
      p_table_id: tab.tableId,
      p_cash_register_session_id: tab.cashRegisterSessionId,
      p_name: tab.name,
      p_opened_by_id: tab.openedById,
    });
    if (error) throw mapSupabaseError(error, { entity: 'TableTab', field: 'name' });
    return toTableTabDomain(data as any);
  },

  async rename(id: string, name: string): Promise<TableTab> {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) throw mapSupabaseError(error, { entity: 'TableTab', field: 'name' });
    if (!data) throw new NotFoundError('TableTab', id);
    return toTableTabDomain(data as any);
  },

  async close(
    id: string,
    method: PaymentMethod | null,
    customerId: string | null,
    closedById: string
  ): Promise<TableTabSummary> {
    const { error } = await supabase.rpc('close_table_tab', {
      p_table_tab_id: id,
      p_payment_method: method,
      p_customer_id: customerId,
      p_closed_by_id: closedById,
    });
    if (error) throw mapSupabaseError(error, { entity: 'TableTab' });
    const summary = await this.findSummaryById(id);
    if (!summary) throw new NotFoundError('TableTab', id);
    return summary;
  },
};
