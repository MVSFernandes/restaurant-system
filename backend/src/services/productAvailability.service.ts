import { productStockItemRepository } from '../repositories/productStockItem.repository';
import { stockItemRepository } from '../repositories/stockItem.repository';

export async function productStockAvailability(productId: string) {
  const stockItems = await productStockItemRepository.findByProduct(productId);
  if (stockItems.length === 0) {
    return { stockItems, available: true, availableUnits: null };
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
    available: availableUnits >= 1,
    availableUnits: Number.isFinite(availableUnits) ? availableUnits : null,
  };
}
