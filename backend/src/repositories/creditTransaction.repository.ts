import { supabase } from '../lib/supabase';
import { CreditTransaction } from '../types/domain';
import { mapSupabaseError } from '../middlewares/errorHandler.middleware';
import {
  toCreditTransactionDomain,
  toCreditTransactionInsert,
} from '../mappers/creditTransaction.mapper';

const TABLE = 'credit_transactions';

export const creditTransactionRepository = {
  async findById(id: string): Promise<CreditTransaction | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'CreditTransaction' });
    return data ? toCreditTransactionDomain(data) : null;
  },

  async findChargeByOrder(orderId: string): Promise<CreditTransaction | null> {
    const { data, error } = await supabase.from(TABLE).select('*').eq('order_id', orderId)
      .eq('type', 'CHARGE').maybeSingle();
    if (error) throw mapSupabaseError(error, { entity: 'CreditTransaction' });
    return data ? toCreditTransactionDomain(data) : null;
  },

  async findByCustomer(customerId: string): Promise<CreditTransaction[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) throw mapSupabaseError(error, { entity: 'CreditTransaction' });
    return (data ?? []).map(toCreditTransactionDomain);
  },

  /**
   * Lança um débito de fiado manualmente (sem pedido associado).
   * Usa RPC `add_credit_charge` que:
   *   1. Valida que customer existe
   *   2. Valida que amount > 0
   *   3. Incrementa customer.credit_used
   *   4. Insere o registro em credit_transactions
   * Erro P0001 se exceder credit_limit.
   */
  async chargeCredit(
    customerId: string,
    amount: number,
    description: string | null
  ): Promise<CreditTransaction> {
    const txId = `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const { data, error } = await supabase.rpc('add_credit_charge', {
      p_credit_tx_id: txId,
      p_customer_id: customerId,
      p_amount: amount,
      p_description: description,
    });

    if (error) throw mapSupabaseError(error, { entity: 'CreditTransaction' });
    return toCreditTransactionDomain(data);
  },

  /**
   * Registra um pagamento de fiado pelo cliente.
   * Usa RPC `pay_customer_credit` que:
   *   1. Valida que customer existe
   *   2. Decrementa credit_used (com LEAST pra não negativar)
   *   3. Insere registro PAYMENT em credit_transactions
   */
  async payCredit(
    customerId: string,
    amount: number,
    description: string | null
  ): Promise<CreditTransaction> {
    const txId = `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const { data, error } = await supabase.rpc('pay_customer_credit', {
      p_credit_tx_id: txId,
      p_customer_id: customerId,
      p_amount: amount,
      p_description: description,
    });

    if (error) throw mapSupabaseError(error, { entity: 'CreditTransaction' });
    return toCreditTransactionDomain(data);
  },

  /**
   * Paga um pedido usando fiado (crédito do cliente).
   * Usa RPC `pay_order_with_credit` que faz 4 operações atômicas:
   *   1. Valida pedido existe e está em status válido
   *   2. Valida cliente tem crédito disponível
   *   3. Incrementa customer.credit_used
   *   4. Insere registro CHARGE em credit_transactions
   *   5. Cria Payment com method=CREDIT
   *   6. Atualiza Order.status → FINISHED
   * Erros: P0001 (limite), P0002 (não encontrado)
   */
    async payOrderWithCredit(
    orderId: string,
    customerId: string,
    amount: number
    ): Promise<{ transactionId: string; paymentId: string }> {
    const txId = `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const { error } = await supabase.rpc('pay_order_with_credit', {
      p_order_id: orderId,
      p_customer_id: customerId,
      p_credit_tx_id: txId,
      p_payment_id: paymentId,
      p_method: 'CREDIT',
      p_amount: amount,
      p_description: null,
    });

    if (error) throw mapSupabaseError(error, { entity: 'CreditTransaction' });
    return { transactionId: txId, paymentId };
    },

  // Insert direto (sem RPC) — usado internamente se necessário
  async create(tx: CreditTransaction): Promise<CreditTransaction> {
    const payload = toCreditTransactionInsert(tx);
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) throw mapSupabaseError(error, { entity: 'CreditTransaction' });
    return toCreditTransactionDomain(data);
  },
};
