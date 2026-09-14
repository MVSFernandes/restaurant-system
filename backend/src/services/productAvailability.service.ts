import { productStockItemRepository } from '../repositories/productStockItem.repository';
import { stockItemRepository } from '../repositories/stockItem.repository';

export async function productStockAvailability(productId: string) {
  const stockItems = await productStockItemRepository.findByProduct(productId);
  const available = (await Promise.all(stockItems.map(async (link) => {
    if (link.quantity <= 0) return true;
    const stock = await stockItemRepository.findById(link.stockItemId);
    return stock !== null && stock.quantity >= link.quantity;
  }))).every(Boolean);
  return { stockItems, available };
}
