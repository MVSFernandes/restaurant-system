import { supabase } from '../lib/supabase';
import { mapSupabaseError } from '../middlewares/errorHandler.middleware';
import type {
  InvoiceStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
} from '../types/domain';

export type FiscalHistoryStatus = 'AUTHORIZED' | 'WITHOUT' | 'REJECTED';

export interface OrderHistoryFilters {
  page: number;
  pageSize: number;
  startDate?: string;
  endDate?: string;
  customerName?: string;
  code?: string;
  type?: OrderType;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  orderStatus?: Extract<OrderStatus, 'FINISHED' | 'CANCELED'>;
  source?: OrderSource;
  fiscalStatus?: FiscalHistoryStatus;
  sessionId?: string;
}

const relationOne = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const selectFor = (filters: OrderHistoryFilters) => {
  const payments = filters.paymentMethod || filters.paymentStatus ? 'payments!inner(*)' : 'payments(*)';
  const invoices = filters.fiscalStatus === 'AUTHORIZED' || filters.fiscalStatus === 'REJECTED'
    ? 'invoices!inner(*)'
    : 'invoices(*)';
  return `*,order_items(*),${payments},tables(id,number),waiter:users!orders_waiter_fkey(id,name),user:users!orders_user_fkey(id,name),${invoices}`;
};

const mapInvoice = (row: any) => ({
  id: row.id,
  customerId: row.customer_id,
  orderId: row.order_id,
  creditTransactionId: row.credit_transaction_id,
  model: row.model,
  consumerDocument: row.consumer_document,
  focusRef: row.focus_ref,
  environment: row.environment,
  status: row.status as InvoiceStatus,
  sefazStatus: row.sefaz_status,
  sefazMessage: row.sefaz_message,
  accessKey: row.access_key,
  number: row.number,
  series: row.series,
  danfeUrl: row.danfe_url,
  xmlUrl: row.xml_url,
  qrcodeUrl: row.qrcode_url,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const latestInvoice = (rows: any[] = []) => {
  const sorted = [...rows].sort((left, right) =>
    String(right.created_at).localeCompare(String(left.created_at))
  );
  return sorted.find((invoice) => invoice.status === 'authorized')
    ?? sorted.find((invoice) => ['pending', 'processing'].includes(invoice.status))
    ?? sorted[0]
    ?? null;
};

const mapOrder = (row: any) => {
  const payment = relationOne<any>(row.payments);
  const invoice = latestInvoice(row.invoices);
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    status: row.status,
    total: row.total,
    deliveryFee: row.delivery_fee,
    customerName: row.customer_name,
    customerId: row.customer_id,
    tableId: row.table_id,
    userId: row.user_id,
    waiterId: row.waiter_id,
    cashRegisterSessionId: row.cash_register_session_id,
    deliveryType: row.delivery_type,
    deliveryStreet: row.delivery_street,
    deliveryNumber: row.delivery_number,
    deliveryNeighborhood: row.delivery_neighborhood,
    deliveryReference: row.delivery_reference,
    deliveryPhone: row.delivery_phone,
    deliveryNotes: row.delivery_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.order_items ?? []).map((item: any) => ({
      id: item.id,
      orderId: item.order_id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
      weight: item.weight,
      price: item.price,
      unitPrice: item.unit_price,
      saleType: item.sale_type,
      notes: item.notes,
    })),
    payment: payment ? {
      id: payment.id,
      orderId: payment.order_id,
      method: payment.method,
      amount: payment.amount,
      status: payment.status,
      transactionId: payment.transaction_id,
      createdAt: payment.created_at,
    } : null,
    table: row.tables,
    waiter: row.waiter,
    user: row.user,
    invoice: invoice ? mapInvoice(invoice) : null,
  };
};

export const orderHistoryRepository = {
  async search(filters: OrderHistoryFilters) {
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;
    let query: any = supabase
      .from('orders')
      .select(selectFor(filters), { count: 'exact' })
      .in('status', ['FINISHED', 'CANCELED']);

    if (filters.startDate) query = query.gte('created_at', `${filters.startDate}T00:00:00.000-03:00`);
    if (filters.endDate) query = query.lte('created_at', `${filters.endDate}T23:59:59.999-03:00`);
    if (filters.customerName) query = query.ilike('customer_name', `%${filters.customerName}%`);
    if (filters.code) query = query.ilike('id', `%${filters.code.replace(/^#/, '')}%`);
    if (filters.type) query = query.eq('type', filters.type);
    if (filters.orderStatus) query = query.eq('status', filters.orderStatus);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.sessionId) query = query.eq('cash_register_session_id', filters.sessionId);
    if (filters.paymentMethod) query = query.eq('payments.method', filters.paymentMethod);
    if (filters.paymentStatus) query = query.eq('payments.status', filters.paymentStatus);
    if (filters.fiscalStatus === 'AUTHORIZED') query = query.eq('invoices.status', 'authorized');
    if (filters.fiscalStatus === 'REJECTED') query = query.in('invoices.status', ['error', 'canceled']);
    if (filters.fiscalStatus === 'WITHOUT') query = query.is('invoices', null);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    return {
      data: (data ?? []).map(mapOrder),
      total: count ?? 0,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / filters.pageSize)),
    };
  },
};
