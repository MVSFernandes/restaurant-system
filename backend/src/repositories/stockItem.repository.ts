import { supabase } from '../lib/supabase';
import { StockItem } from '../types/domain';
import { mapSupabaseError } from '../middlewares/errorHandler.middleware';
import {
  toStockItemDomain,
  toStockItemInsert,
  toStockItemUpdate,
} from '../mappers/stockItem.mapper';
import { DomainError, NotFoundError } from '../types/errors';

const TABLE = 'stock_items';

export const STOCK_ITEM_HAS_ORDER_HISTORY_MESSAGE =
  'Este insumo já tem movimentações de pedidos registradas e não pode ser excluído, para preservar o histórico. Mantenha o cadastro e ajuste a quantidade, se necessário.';

export const stockItemRepository = {
  async findAll(): Promise<StockItem[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('name', { ascending: true });

    if (error) throw mapSupabaseError(error, { entity: 'StockItem' });
    return (data ?? []).map(toStockItemDomain);
  },

  async findById(id: string): Promise<StockItem | null> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'StockItem' });
    return data ? toStockItemDomain(data) : null;
  },

/**
 * Lista insumos com quantidade <= min_quantity (estoque baixo).
 *
 * Nota: PostgREST/Supabase não suporta comparação coluna-vs-coluna
 * no client. Buscamos todos e filtramos em memória.
 *
 * Para volumes grandes, considere uma view ou RPC dedicada.
 */
async findLowStock(): Promise<StockItem[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('name', { ascending: true });

  if (error) throw mapSupabaseError(error, { entity: 'StockItem' });

  return (data ?? [])
    .map(toStockItemDomain)
    .filter((item) => item.quantity <= item.minQuantity);
},

  async create(stockItem: StockItem): Promise<StockItem> {
    const payload = toStockItemInsert(stockItem);
    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) throw mapSupabaseError(error, { entity: 'StockItem', field: 'name' });
    return toStockItemDomain(data);
  },

  async update(id: string, patch: Partial<StockItem>): Promise<StockItem> {
    const payload = toStockItemUpdate(patch);

    if (Object.keys(payload).length === 0) {
      const current = await this.findById(id);
      if (!current) throw new NotFoundError('StockItem', id);
      return current;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw mapSupabaseError(error, { entity: 'StockItem' });
    if (!data) throw new NotFoundError('StockItem', id);

    return toStockItemDomain(data);
  },

  async delete(id: string): Promise<void> {
    const { error, count } = await supabase
      .from(TABLE)
      .delete({ count: 'exact' })
      .eq('id', id);

    // order_stock_movements.stock_item_id is ON DELETE RESTRICT: the database
    // refuses deleting a stock item that already has order history
    // (PostgreSQL answers 23001 restrict_violation; 23503 is kept for safety).
    if (
      (error?.code === '23001' || error?.code === '23503')
      && `${error.message} ${error.details ?? ''}`.includes('order_stock_movements')
    ) {
      throw new DomainError(STOCK_ITEM_HAS_ORDER_HISTORY_MESSAGE, {
        code: 'STOCK_ITEM_HAS_ORDER_HISTORY',
        status: 409,
        details: { stockItemId: id },
      });
    }
    if (error) throw mapSupabaseError(error, { entity: 'StockItem' });
    if (count === 0) throw new NotFoundError('StockItem', id);
  },
};