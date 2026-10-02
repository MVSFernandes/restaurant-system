import { productStockItemRepository } from '../repositories/productStockItem.repository';
import { stockItemRepository } from '../repositories/stockItem.repository';
import type { Product } from '../types/domain';

export async function productStockAvailability(product: Pick<Product, 'id' | 'isPaused'>) {
  const stockItems = await productStockItemRepository.findByProduct(product.id);
  if (stockItems.length === 0) {
    return { stockItems, available: !product.isPaused, availableUnits: null };
  }

  const capacities = await Promise.all(stockItems.map(async (link) => {
    if (link.quantity <= 0) return Number.POSITIVE_INFINITY;
    const stock = await stockItemRepository.findById(link.stockItemId);
    if (!stock) return 0;
    return Math.max(0, Math.floor((Number(stock.quantity) + Number.EPSILON) / link.quantity));
  }));
  const availableUnits = Math.min(...capacities);

  return {
    stockItems,
    available: !product.isPaused && availableUnits >= 1,
    availableUnits: Number.isFinite(availableUnits) ? availableUnits : null,
  };
}
