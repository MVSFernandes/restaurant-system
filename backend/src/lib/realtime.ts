import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ORDER_EVENTS, REALTIME_CHANNELS, STOCK_EVENTS } from '../constants/realtime';

const channels = new Map<string, RealtimeChannel>();

async function publish(topic: string, event: string, payload: object): Promise<void> {
  try {
    // Reuse the backend singleton and its existing service role credentials.
    // HTTP Broadcast requires no backend WebSocket connection or subscription.
    let channel = channels.get(topic);
    if (!channel) {
      channel = supabase.channel(topic);
      channels.set(topic, channel);
    }
    const result = await channel.httpSend(event, payload, { timeout: 3000 });
    if (!result.success) console.warn(`[Realtime] Could not publish ${event}.`);
  } catch {
    // Never turn a committed mutation into an error because a notification failed.
    console.warn(`[Realtime] Could not publish ${event}.`);
  }
}

export function publishStockUpdated(): Promise<void> {
  return publish(REALTIME_CHANNELS.stockEvents, STOCK_EVENTS.updated, {});
}

export function publishStockLow(items: ReadonlyArray<{ id: string }>): Promise<void> {
  // Public channels contain only invalidation hints, never inventory details.
  return publish(
    REALTIME_CHANNELS.stockEvents,
    STOCK_EVENTS.low,
    { items: items.map(({ id }) => ({ id })) }
  );
}

export type OrderBroadcastEvent = typeof ORDER_EVENTS[keyof typeof ORDER_EVENTS];

export function publishOrderChanged(
  event: OrderBroadcastEvent,
  payload: { orderId: string; source?: string }
): Promise<void> {
  // Send identifiers only. The authenticated API remains the source of order data.
  return publish(REALTIME_CHANNELS.orderEvents, event, payload);
}