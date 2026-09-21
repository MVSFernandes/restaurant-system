import { useEffect } from 'react';
import { ORDER_EVENTS, REALTIME_CHANNELS } from '../constants/realtime';
import { openRealtimeChannel } from '../lib/realtime';
import type { OrderSource } from '../types';

export interface OrderEventPayload {
  orderId: string;
  source?: OrderSource;
}

const FALLBACK_REFRESH_MS = 30_000;

export function useOrderEvents(
  refresh: () => void,
  onCreated?: (payload: OrderEventPayload) => void,
) {
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      if (!active || timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (active) refresh();
      }, 150);
    };

    const handleCreated = (message: { payload?: unknown }) => {
      const payload = (message.payload ?? {}) as OrderEventPayload;
      if (payload.orderId) onCreated?.(payload);
      scheduleRefresh();
    };

    const close = openRealtimeChannel(REALTIME_CHANNELS.orderEvents, { config: {} }, (channel) => {
      channel
        .on('broadcast', { event: ORDER_EVENTS.created }, handleCreated)
        .on('broadcast', { event: ORDER_EVENTS.updated }, scheduleRefresh)
        .on('broadcast', { event: ORDER_EVENTS.canceled }, scheduleRefresh)
        .subscribe((status) => {
          // Recover anything missed while the channel was disconnected.
          if (status === 'SUBSCRIBED') scheduleRefresh();
        });
    });

    // Broadcast is the fast path; polling keeps the list current while offline.
    const fallback = setInterval(refresh, FALLBACK_REFRESH_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(fallback);
      close();
    };
  }, [onCreated, refresh]);
}
