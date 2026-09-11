import { supabase } from '../lib/supabase';
import { Invoice, InvoiceModel } from '../types/domain';
import { mapSupabaseError } from '../middlewares/errorHandler.middleware';
import { NotFoundError } from '../types/errors';
import { toInvoiceDomain, toInvoiceInsert, toInvoiceUpdate } from '../mappers/invoice.mapper';

const TABLE = 'invoices';

export const invoiceRepository = {
  async findById(id: string): Promise<Invoice | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'Invoice' });
    return data ? toInvoiceDomain(data as any) : null;
  },

  async findByFocusRef(focusRef: string): Promise<Invoice | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('focus_ref', focusRef)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'Invoice' });
    return data ? toInvoiceDomain(data as any) : null;
  },

  async findByOrderId(orderId: string, model?: InvoiceModel): Promise<Invoice | null> {
    let query = supabase
      .from(TABLE)
      .select('*')
      .eq('order_id', orderId);

    if (model) query = query.eq('model', model);

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'Invoice' });
    return data ? toInvoiceDomain(data as any) : null;
  },

  async findByCreditTransactionId(creditTransactionId: string): Promise<Invoice | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('credit_transaction_id', creditTransactionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'Invoice' });
    return data ? toInvoiceDomain(data as any) : null;
  },

  async findByCreditTransactionIds(creditTransactionIds: string[]): Promise<Invoice[]> {
    if (creditTransactionIds.length === 0) return [];

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .in('credit_transaction_id', creditTransactionIds)
      .order('created_at', { ascending: true });

    if (error) throw mapSupabaseError(error, { entity: 'Invoice' });
    return (data ?? []).map((row) => toInvoiceDomain(row as any));
  },

  async create(invoice: Invoice): Promise<Invoice> {
    const payload = toInvoiceInsert(invoice);
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload as any)
      .select()
      .single();

    if (error) throw mapSupabaseError(error, { entity: 'Invoice' });
    return toInvoiceDomain(data as any);
  },

  async update(id: string, patch: Partial<Invoice>): Promise<Invoice> {
    const payload = toInvoiceUpdate(patch);

    if (Object.keys(payload).length === 0) {
      const current = await this.findById(id);
      if (!current) throw new NotFoundError('Invoice', id);
      return current;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(payload as any)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'Invoice' });
    if (!data) throw new NotFoundError('Invoice', id);
    return toInvoiceDomain(data as any);
  },
};
