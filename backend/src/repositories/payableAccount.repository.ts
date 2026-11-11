import { supabase } from '../lib/supabase';
import { Database } from '../types/database';
import { PayableAccount, PayableAccountListItem } from '../types/domain';
import { mapSupabaseError } from '../middlewares/errorHandler.middleware';
import {
  toPayableAccountDomain,
  toPayableAccountInsert,
  toPayableAccountUpdate,
} from '../mappers/payableAccount.mapper';
import { NotFoundError } from '../types/errors';

const TABLE = 'payable_accounts';

type SupplierSummary = { id: string; name: string };
type PayableListRow = Database['public']['Tables']['payable_accounts']['Row'] & {
  supplier: SupplierSummary | SupplierSummary[] | null;
};

const supplierFromRelation = (relation: PayableListRow['supplier']): SupplierSummary | null => {
  const supplier = Array.isArray(relation) ? relation[0] ?? null : relation;
  return supplier ? { id: supplier.id, name: supplier.name } : null;
};

export const payableAccountRepository = {
  /**
   * Lista todas as contas com o nome do fornecedor vinculado, na mesma consulta
   * (embed pela FK payable_accounts.supplier_id -> suppliers.id).
   */
  async findAll(): Promise<PayableAccountListItem[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*, supplier:suppliers(id,name)')
      .order('paid', { ascending: true })
      .order('due_date', { ascending: true });

    if (error) throw mapSupabaseError(error, { entity: 'PayableAccount' });
    return ((data ?? []) as unknown as PayableListRow[]).map((row) => ({
      ...toPayableAccountDomain(row),
      supplier: supplierFromRelation(row.supplier),
    }));
  },

  async findById(id: string): Promise<PayableAccount | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'PayableAccount' });
    return data ? toPayableAccountDomain(data) : null;
  },

  /**
   * Lista contas em aberto (não pagas), ordenadas pela data de vencimento.
   */
  async findUnpaid(): Promise<PayableAccount[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('paid', false)
      .order('due_date', { ascending: true });

    if (error) throw mapSupabaseError(error, { entity: 'PayableAccount' });
    return (data ?? []).map(toPayableAccountDomain);
  },

  /**
   * Lista contas vencidas (não pagas + due_date < hoje).
   */
  async findOverdue(): Promise<PayableAccount[]> {
    const today = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('paid', false)
      .lt('due_date', today)
      .order('due_date', { ascending: true });

    if (error) throw mapSupabaseError(error, { entity: 'PayableAccount' });
    return (data ?? []).map(toPayableAccountDomain);
  },

  /**
   * Marca uma conta como paga, registrando paid_at = agora.
   */
  async markAsPaid(id: string): Promise<PayableAccount> {
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        paid: true,
        paid_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'PayableAccount' });
    if (!data) throw new NotFoundError('PayableAccount', id);

    return toPayableAccountDomain(data);
  },

  async create(account: PayableAccount): Promise<PayableAccount> {
    const payload = toPayableAccountInsert(account);
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) throw mapSupabaseError(error, { entity: 'PayableAccount' });
    return toPayableAccountDomain(data);
  },

  async update(id: string, patch: Partial<PayableAccount>): Promise<PayableAccount> {
    const payload = toPayableAccountUpdate(patch);

    if (Object.keys(payload).length === 0) {
      const current = await this.findById(id);
      if (!current) throw new NotFoundError('PayableAccount', id);
      return current;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'PayableAccount' });
    if (!data) throw new NotFoundError('PayableAccount', id);

    return toPayableAccountDomain(data);
  },

  async delete(id: string): Promise<void> {
    const { error, count } = await supabase
      .from(TABLE)
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) throw mapSupabaseError(error, { entity: 'PayableAccount' });
    if (count === 0) throw new NotFoundError('PayableAccount', id);
  },
};