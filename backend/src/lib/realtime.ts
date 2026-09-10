import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { REALTIME_CHANNELS, STOCK_EVENTS } from '../constants/realtime';

let stockChannel: RealtimeChannel | undefined;

async function publish(event: string, payload: object): Promise<void> {
  try {
    // Reuse the backend singleton and its existing service role credentials.
    // HTTP Broadcast requires no backend WebSocket connection or subscription.
    stockChannel ??= supabase.channel(REALTIME_CHANNELS.stockEvents);
    const result = await stockChannel.httpSend(event, payload, { timeout: 3000 });
    if (!result.success) console.warn(`[Realtime] Could not publish ${event}.`);
  } catch {
    // Never turn a committed mutation into an error because a notification failed.
    console.warn(`[Realtime] Could not publish ${event}.`);
  }
}

export function publishStockUpdated(): Promise<void> {
  return publish(STOCK_EVENTS.updated, {});
}

export function publishStockLow(items: ReadonlyArray<{ id: string }>): Promise<void> {
  // Public channels contain only invalidation hints, never inventory details.
  return publish(STOCK_EVENTS.low, { items: items.map(({ id }) => ({ id })) });
}
