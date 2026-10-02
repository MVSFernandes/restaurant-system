import { useEffect, useSyncExternalStore, type RefObject } from 'react';

// Espaço que as barras fixas no pé da tela ocupam, para o aviso (toast)
// subir acima delas em vez de tampar a ação que vem logo em seguida.
// Cada barra registra a própria altura enquanto está na tela; o aviso usa
// a maior.

const reserved = new Map<symbol, number>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getReservedBottom = () => (reserved.size ? Math.max(...reserved.values()) : 0);

/** Altura reservada no pé da tela pelas barras fixas, em px. */
export function useReservedBottom() {
  return useSyncExternalStore(subscribe, getReservedBottom, () => 0);
}

/**
 * Reserva no pé da tela a altura do elemento (uma barra fixa embaixo).
 * Mede de verdade e acompanha mudanças, porque a barra cresce (aviso de sem
 * conexão, área segura do aparelho).
 */
export function useReserveBottomSpace(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const key = Symbol('bottom-bar');
    const update = () => {
      reserved.set(key, element.getBoundingClientRect().height);
      notify();
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      reserved.delete(key);
      notify();
    };
  }, [ref]);
}
