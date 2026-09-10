import { useEffect } from 'react';
import { REALTIME_CHANNELS, STOCK_EVENTS } from '../constants/realtime';
import { openRealtimeChannel } from '../lib/realtime';

export function useStockEvents(refresh: () => void) {
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (!active || timer !== undefined) return;
      // Both events accompany each mutation. Coalesce them into one fetch.
      timer = setTimeout(() => {
        timer = undefined;
        if (active) refresh();
      }, 150);
    };

    const close = openRealtimeChannel(REALTIME_CHANNELS.stockEvents, { config: {} }, (channel) => {
      channel
        .on('broadcast', { event: STOCK_EVENTS.updated }, scheduleRefresh)
        .on('broadcast', { event: STOCK_EVENTS.low }, scheduleRefresh)
        .subscribe((status) => {
          // Recover changes missed while offline on every connection.
          if (status === 'SUBSCRIBED') scheduleRefresh();
        });
    });

    return () => {
      active = false;
      clearTimeout(timer);
      close();
    };
  }, [refresh]);
}
