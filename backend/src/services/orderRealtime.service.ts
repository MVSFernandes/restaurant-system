import { ORDER_EVENTS } from '../constants/realtime';
import { publishOrderChanged, type OrderBroadcastEvent } from '../lib/realtime';
import type { Order } from '../types/domain';

export function notifyOrderChanged(
  event: OrderBroadcastEvent,
  order: Pick<Order, 'id' | 'source'>
): Promise<void> {
  return publishOrderChanged(event, { orderId: order.id, source: order.source });
}

export function notifyOrderIdChanged(
  event: OrderBroadcastEvent,
  orderId: string
): Promise<void> {
  return publishOrderChanged(event, { orderId });
}

export function orderMutationEvent(status: Order['status']): OrderBroadcastEvent {
  return status === 'CANCELED' ? ORDER_EVENTS.canceled : ORDER_EVENTS.updated;
}
