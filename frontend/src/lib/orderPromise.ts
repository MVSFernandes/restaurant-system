import type { OrderType } from '../types';

/** Tipos de pedido na ordem em que aparecem na configuração. */
export const ORDER_PROMISE_TYPES: readonly OrderType[] = ['DINE_IN', 'TAKE_AWAY', 'DELIVERY'];

export type OrderPromiseMinutes = Record<OrderType, number | null>;

export const EMPTY_ORDER_PROMISE_MINUTES: OrderPromiseMinutes = {
  DINE_IN: null,
  TAKE_AWAY: null,
  DELIVERY: null,
};

/** Campo vazio = sem prazo. Qualquer outro texto vira número para validar. */
export const parsePromiseMinutesInput = (text: string): number | null =>
  text.trim() === '' ? null : Number(text);

/** Mesma regra do backend: null ou inteiro maior que zero. */
export const promiseMinutesError = (value: number | null | undefined): string | undefined =>
  value === null || value === undefined || (Number.isInteger(value) && value > 0)
    ? undefined
    : 'Use minutos inteiros maiores que zero, ou deixe vazio para ficar sem prazo.';
