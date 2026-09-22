import { supabase } from '../lib/supabase';
import { Payment } from '../types/domain';
import { mapSupabaseError } from '../middlewares/errorHandler.middleware';
import { toPaymentDomain, toPaymentInsert, toPaymentUpdate } from '../mappers/payment.mapper';
import { NotFoundError } from '../types/errors';

const TABLE = 'payments';

export const paymentRepository = {
  async findById(id: string): Promise<Payment | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'Payment' });
    return data ? toPaymentDomain(data) : null;
  },

  async findByOrder(orderId: string): Promise<Payment[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error) throw mapSupabaseError(error, { entity: 'Payment' });
    return (data ?? []).map(toPaymentDomain);
  },

  /**
   * Busca todos os pagamentos de pedidos de uma sessão de caixa.
   * Faz em 2 passos para evitar problemas com joins via PostgREST:
   *   1. Busca IDs dos pedidos da sessão
   *   2. Busca payments desses pedidos
   */
  async findBySession(sessionId: string): Promise<Payment[]> {
    // Passo 1: busca IDs dos pedidos da sessão
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id')
      .eq('cash_register_session_id', sessionId);

    if (ordersError) throw mapSupabaseError(ordersError, { entity: 'Payment' });
    if (!orders || orders.length === 0) return [];

    const orderIds = orders.map((o) => o.id);

    // Passo 2: busca payments desses pedidos
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .in('order_id', orderIds);

    if (error) throw mapSupabaseError(error, { entity: 'Payment' });
    return (data ?? []).map(toPaymentDomain);
  },

  async cancelPendingByOrder(orderId: string): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .update({ status: 'CANCELED' })
      .eq('order_id', orderId)
      .eq('status', 'PENDING');

    if (error) throw mapSupabaseError(error, { entity: 'Payment' });
  },

  async create(payment: Payment): Promise<Payment> {
    const payload = toPaymentInsert(payment);
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) throw mapSupabaseError(error, { entity: 'Payment' });
    return toPaymentDomain(data);
  },

  async update(id: string, patch: Partial<Payment>): Promise<Payment> {
    const payload = toPaymentUpdate(patch);

    if (Object.keys(payload).length === 0) {
      const current = await this.findById(id);
      if (!current) throw new NotFoundError('Payment', id);
      return current;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'Payment' });
    if (!data) throw new NotFoundError('Payment', id);
    return toPaymentDomain(data);
  },

  async delete(id: string): Promise<void> {
    const { error, count } = await supabase
      .from(TABLE)
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw mapSupabaseError(error, { entity: 'Payment' });
    if (count === 0) throw new NotFoundError('Payment', id);
  },
};