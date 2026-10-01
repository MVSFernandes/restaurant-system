import { useEffect, useRef } from 'react';
import { ORDER_EVENTS, REALTIME_CHANNELS, TABLE_TAB_EVENTS } from '../constants/realtime';
import { openRealtimeChannel } from '../lib/realtime';

const DEBOUNCE_MS = 300;
const FALLBACK_REFRESH_MS = 30_000;

/**
 * Recarrega as telas do garçom quando comandas, mesas ou pedidos mudam.
 * Eventos próximos viram uma recarga só; reconectar um canal refaz a consulta.
 */
export function useWaiterTableEvents(onChange: () => void) {
  // Trocar de filtro troca a função de recarga, mas não reabre os canais.
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const refresh = () => latest.current();
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleRefresh = () => {
      if (!active || timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (active) refresh();
      }, DEBOUNCE_MS);
    };

    const onSubscribe = (status: string) => {
      // Recupera o que se perdeu enquanto o canal estava desconectado.
      if (status === 'SUBSCRIBED') scheduleRefresh();
    };

    const closeTabs = openRealtimeChannel(REALTIME_CHANNELS.tableTabEvents, { config: {} }, (channel) => {
      Object.values(TABLE_TAB_EVENTS).forEach((event) => channel.on('broadcast', { event }, scheduleRefresh));
      channel.subscribe(onSubscribe);
    });

    const closeOrders = openRealtimeChannel(REALTIME_CHANNELS.orderEvents, { config: {} }, (channel) => {
      Object.values(ORDER_EVENTS).forEach((event) => channel.on('broadcast', { event }, scheduleRefresh));
      channel.subscribe(onSubscribe);
    });

    // Broadcast é o caminho rápido; a consulta periódica cobre a queda do canal.
    const fallback = setInterval(refresh, FALLBACK_REFRESH_MS);

    // Voltar a rede ou voltar ao app (celular no bolso) também refaz a consulta.
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    window.addEventListener('online', scheduleRefresh);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      window.removeEventListener('online', scheduleRefresh);
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(timer);
      clearInterval(fallback);
      closeTabs();
      closeOrders();
    };
  }, []);
}
