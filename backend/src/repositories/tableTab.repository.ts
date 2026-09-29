import { supabase } from '../lib/supabase';
import { mapSupabaseError } from '../middlewares/errorHandler.middleware';
import { toTableTabDomain, toTableTabInsert } from '../mappers/tableTab.mapper';
import type {
  OrderStatus,
  PaymentMethod,
  TableTab,
  TableTabStatus,
  TableTabSummary,
} from '../types/domain';
import { NotFoundError } from '../types/errors';

const TABLE = 'table_tabs';

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
  orders?: Array<{
    id: string;
    status: string;
    total: number;
    payments?: Array<{ amount: number; status: string }> | { amount: number; status: string } | null;
  }>;
};

const relationMany = <T>(value: T | T[] | null | undefined): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

function toSummary(row: SummaryRow): TableTabSummary {
  const orders = relationMany(row.orders).map((order) => ({
    id: order.id,
    status: order.status as OrderStatus,
    total: Number(order.total),
  }));
  const total = relationMany(row.orders)
    .filter((order) => order.status !== 'CANCELED')
    .reduce((sum, order) => sum + Number(order.total), 0);
  const paidTotal = relationMany(row.orders).reduce(
    (sum, order) => sum + relationMany(order.payments)
      .filter((payment) => payment.status === 'PAID')
      .reduce((paymentSum, payment) => paymentSum + Number(payment.amount), 0),
    0
  );

  return {
    ...toTableTabDomain(row as any),
    total,
    paidTotal,
    balance: Math.max(0, total - paidTotal),
    orderCount: orders.length,
    orders,
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
      .select('*,orders(id,status,total,payments(amount,status))')
      .eq('id', id)
      .maybeSingle();
    if (error) throw mapSupabaseError(error, { entity: 'TableTab' });
    return data ? toSummary(data as unknown as SummaryRow) : null;
  },

  async findByTable(tableId: string, status?: TableTabStatus): Promise<TableTabSummary[]> {
    let query = supabase
      .from(TABLE)
      .select('*,orders(id,status,total,payments(amount,status))')
      .eq('table_id', tableId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('opened_at', { ascending: true });
    if (error) throw mapSupabaseError(error, { entity: 'TableTab' });
    return ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
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

  async create(tab: TableTab): Promise<TableTab> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(toTableTabInsert(tab))
      .select()
      .single();
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
