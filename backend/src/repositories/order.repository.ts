import { toPaymentInsert } from '../mappers/payment.mapper';
import type { Database, Json } from '../types/database';
import { supabase } from '../lib/supabase';
import { Order, OrderItem, OrderStatus, OrderType, Payment, Product } from '../types/domain';
import { mapSupabaseError } from '../middlewares/errorHandler.middleware';
import { toOrderDomain, toOrderInsert, toOrderUpdate } from '../mappers/order.mapper';
import { toOrderItemDomain, toOrderItemInsert } from '../mappers/orderItem.mapper';
import { toProductDomain } from '../mappers/product.mapper';
import { NotFoundError } from '../types/errors';
import { ACTIVE_ORDER_STATUSES } from '../constants/orders';

const TABLE = 'orders';
const ITEMS_TABLE = 'order_items';

const normalizeOrderItemWeight = (item: OrderItem): number | null => {
  const numericWeight = Number(item.weight);
  if (item.saleType === 'UNIT' || !Number.isFinite(numericWeight) || numericWeight <= 0) {
    return null;
  }
  return numericWeight;
};

export interface RecentOrderSummary {
  id: string;
  type: OrderType;
  status: OrderStatus;
  total: number;
  createdAt: Date;
  customerName: string | null;
  tableId: string | null;
  tableNumber: number | null;
  waiterId: string | null;
}

type RecentOrderRow = {
  id: string;
  type: string;
  status: string;
  total: number;
  created_at: string;
  customer_name: string | null;
  table_id: string | null;
  waiter_id: string | null;
  tables: { number: number } | { number: number }[] | null;
};

type ProductRow = Database['public']['Tables']['products']['Row'];
type DetailedOrderItemRow = Database['public']['Tables']['order_items']['Row'] & {
  products: ProductRow | ProductRow[] | null;
};
type DetailedOrderRow = Database['public']['Tables']['orders']['Row'] & {
  source?: string;
  order_items: DetailedOrderItemRow[];
};

export interface DetailedSessionOrder {
  order: Order;
  items: Array<OrderItem & { product: Product | null }>;
}

const relationOne = <T>(relation: T | T[] | null): T | null =>
  Array.isArray(relation) ? relation[0] ?? null : relation;


const tableNumberFromRelation = (relation: RecentOrderRow['tables']) => {
  if (Array.isArray(relation)) return relation[0]?.number ?? null;
  return relation?.number ?? null;
};

export const orderRepository = {
  async createWithStock(order: Order, items: OrderItem[], payment?: Payment, idempotencyKey?: string): Promise<Order> {
    const { data, error } = await supabase.rpc('create_order_with_stock', {
      p_order: { ...toOrderInsert(order), idempotency_key: idempotencyKey ?? null } as Json,
      p_items: items.map(toOrderItemInsert) as Json,
      p_payment: payment ? toPaymentInsert(payment) as Json : null,
    });
    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    return toOrderDomain(data as unknown as Database['public']['Tables']['orders']['Row']);
  },

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('idempotency_key', key).maybeSingle();
    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    return data ? toOrderDomain(data) : null;
  },

  async findById(id: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    return data ? toOrderDomain(data) : null;
  },

  async findByStatus(status: OrderStatus): Promise<Order[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: true });

    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    return (data ?? []).map(toOrderDomain);
  },

  async hasActiveByTable(tableId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('id')
      .eq('table_id', tableId)
      .in('status', [...ACTIVE_ORDER_STATUSES])
      .limit(1)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    return Boolean(data);
  },

  async findByStatuses(statuses: OrderStatus[]): Promise<Order[]> {
    if (statuses.length === 0) return [];

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .in('status', statuses)
      .order('created_at', { ascending: true });

    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    return (data ?? []).map(toOrderDomain);
  },

  async findRecentSummaries(
    limit = 5,
    filters: { waiterId?: string } = {}
  ): Promise<RecentOrderSummary[]> {
    let query = supabase
      .from(TABLE)
      .select('id,type,status,total,created_at,customer_name,table_id,waiter_id,tables(number)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filters.waiterId) {
      query = query.eq('waiter_id', filters.waiterId);
    }

    const { data, error } = await query;

    if (error) throw mapSupabaseError(error, { entity: 'Order' });

    return ((data ?? []) as unknown as RecentOrderRow[]).map((row) => ({
      id: row.id,
      type: row.type as OrderType,
      status: row.status as OrderStatus,
      total: row.total,
      createdAt: new Date(row.created_at),
      customerName: row.customer_name,
      tableId: row.table_id,
      waiterId: row.waiter_id,
      tableNumber: tableNumberFromRelation(row.tables),
    }));
  },

  async findBySession(sessionId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('cash_register_session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    return (data ?? []).map(toOrderDomain);
  },

  async findDetailedBySession(
    sessionId: string,
    filters: { tableId?: string; tableTabId?: string } = {}
  ): Promise<DetailedSessionOrder[]> {
    let query = supabase
      .from(TABLE)
      .select('*,order_items(*,products(*))')
      .eq('cash_register_session_id', sessionId);
    if (filters.tableId) query = query.eq('table_id', filters.tableId);
    if (filters.tableTabId) query = query.eq('table_tab_id', filters.tableTabId);
    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) throw mapSupabaseError(error, { entity: 'Order' });

    return ((data ?? []) as unknown as DetailedOrderRow[]).map((row) => ({
      order: toOrderDomain(row),
      items: (row.order_items ?? []).map((item) => {
        const product = relationOne(item.products);
        return {
          ...toOrderItemDomain(item),
          product: product ? toProductDomain(product) : null,
        };
      }),
    }));
  },

  async findByCustomer(customerId: string): Promise<Order[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    return (data ?? []).map(toOrderDomain);
  },

  async create(order: Order): Promise<Order> {
    const payload = toOrderInsert(order);
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    return toOrderDomain(data);
  },

  async update(id: string, patch: Partial<Order>): Promise<Order> {
    const payload = toOrderUpdate(patch);

    if (Object.keys(payload).length === 0) {
      const current = await this.findById(id);
      if (!current) throw new NotFoundError('Order', id);
      return current;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    if (!data) throw new NotFoundError('Order', id);
    return toOrderDomain(data);
  },

  // ---- ORDER ITEMS ----

  async findItems(orderId: string): Promise<OrderItem[]> {
    const { data, error } = await supabase
      .from(ITEMS_TABLE)
      .select('*')
      .eq('order_id', orderId);

    if (error) throw mapSupabaseError(error, { entity: 'OrderItem' });
    return (data ?? []).map(toOrderItemDomain);
  },

  // ---- STOCK-AFFECTING OPERATIONS (one database transaction each) ----
  // Itens, estoque e livro do pedido (order_stock_movements) só mudam por
  // estas RPCs; o banco recusa cancelar, excluir ou alterar itens por fora.

  /**
   * Cancela o pedido e devolve o estoque registrado no livro, com lock da
   * linha do pedido. As condições opcionais são conferidas de novo dentro do
   * lock (ex.: garçom só cancela o próprio pedido NEW). Pedido anterior ao
   * livro não devolve nada automaticamente: stockReviewRequired = true.
   */
  async cancelWithStock(
    orderId: string,
    conditions: { requiredStatus?: OrderStatus | null; requiredWaiterId?: string | null } = {}
  ): Promise<{ order: Order; alreadyCanceled: boolean; stockReviewRequired: boolean }> {
    const { data, error } = await supabase.rpc('cancel_order_with_stock', {
      p_order_id: orderId,
      p_required_status: conditions.requiredStatus ?? null,
      p_required_waiter_id: conditions.requiredWaiterId ?? null,
    });
    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    const result = data as unknown as {
      order: Database['public']['Tables']['orders']['Row'];
      already_canceled: boolean;
      stock_review_required?: boolean;
    };
    return {
      order: toOrderDomain(result.order),
      alreadyCanceled: Boolean(result.already_canceled),
      stockReviewRequired: Boolean(result.stock_review_required),
    };
  },

  /**
   * Registra a confirmação explícita de entrega, com o pedido travado no
   * banco. Grava delivered_at (relógio do banco) só na primeira vez; repetir
   * devolve o pedido como está. NEW/IN_PROGRESS/READY passam a DELIVERED;
   * FINISHED continua FINISHED, se delivery_tracked (senão
   * ORDER_DELIVERY_NOT_TRACKED). Pagamentos e estoque não mudam. Cancelado é
   * recusado (ORDER_DELIVERY_CANCELED).
   */
  async confirmDelivery(orderId: string): Promise<{ order: Order; alreadyDelivered: boolean }> {
    const { data, error } = await supabase.rpc('confirm_order_delivery', { p_order_id: orderId });
    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    const result = data as unknown as {
      order: Database['public']['Tables']['orders']['Row'];
      already_delivered: boolean;
    };
    return {
      order: toOrderDomain(result.order),
      alreadyDelivered: Boolean(result.already_delivered),
    };
  },

  /**
   * Troca os itens de um pedido NEW numa única transação: devolve o saldo do
   * livro, substitui os itens, baixa o estoque dos novos e aplica o patch
   * (total, taxa e dados de entrega). Qualquer falha não altera nada.
   */
  async updateItemsWithStock(
    orderId: string,
    items: OrderItem[],
    patch: Partial<Order>,
    conditions: { requiredWaiterId?: string | null } = {}
  ): Promise<Order> {
    const { data, error } = await supabase.rpc('update_order_items_with_stock', {
      p_order_id: orderId,
      p_items: items.map((item) => toOrderItemInsert({ ...item, weight: normalizeOrderItemWeight(item) })) as Json,
      p_order_patch: toOrderUpdate(patch) as Json,
      p_required_waiter_id: conditions.requiredWaiterId ?? null,
    });
    if (error) throw mapSupabaseError(error, { entity: 'Order' });
    return toOrderDomain(data as unknown as Database['public']['Tables']['orders']['Row']);
  },

  /**
   * Exclui o pedido numa única transação. Como antes, só pedidos ativos
   * devolvem estoque; a devolução segue o livro e não se repete.
   */
  async deleteWithStock(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_order_with_stock', { p_order_id: orderId });
    if (error) throw mapSupabaseError(error, { entity: 'Order' });
  },
};
