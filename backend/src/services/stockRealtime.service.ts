import { publishStockLow, publishStockUpdated } from '../lib/realtime';
import { stockItemRepository } from '../repositories/stockItem.repository';

async function notifyLowStock(): Promise<void> {
  try {
    await publishStockLow(await stockItemRepository.findLowStock());
  } catch {
    console.warn('[Realtime] Could not load low stock notifications.');
  }
}

export async function notifyStockChanged(): Promise<void> {
  // A failed low-stock query must not prevent the general invalidation.
  await Promise.all([publishStockUpdated(), notifyLowStock()]);
}
