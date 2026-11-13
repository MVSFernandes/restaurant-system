import type { Order } from '../types';

/**
 * Fila de atrasos da tela de Pedidos.
 *
 * O prazo é promisedAt (gravado pelo banco na criação do pedido) e a entrega
 * confirmada é deliveredAt. O "agora" vem do servidor: a resposta de
 * GET /orders traz o cabeçalho X-Server-Time, e a tela guarda esse horário com
 * o performance.now() da chegada (serverClockSample / estimateServerNow).
 */

export const SERVER_TIME_HEADER = 'x-server-time';

/**
 * Pedidos da sessão de caixa aberta em todas as situações. Sem o filtro,
 * GET /orders omite FINISHED e CANCELED, e um FINISHED rastreado pago sem
 * entrega confirmada ainda pode estar atrasado. Tela de Pedidos e Dashboard
 * usam a mesma consulta para as contagens coincidirem.
 */
export const OPERATIONAL_ORDERS_URL = '/orders?status=NEW,IN_PROGRESS,READY,DELIVERED,FINISHED,CANCELED';

const MINUTE_MS = 60_000;

type DeadlineOrder = Pick<Order, 'status' | 'promisedAt' | 'deliveredAt' | 'deliveryTracked'>;

/**
 * Pedido que ainda deve ser entregue:
 * - NEW, IN_PROGRESS ou READY sem deliveredAt;
 * - FINISHED rastreado (deliveryTracked) sem deliveredAt, pago ou não.
 *
 * Ficam de fora: CANCELED, DELIVERED (inclusive o legado sem horário),
 * FINISHED anterior ao registro de entregas e qualquer pedido com deliveredAt.
 */
export const isAwaitingDelivery = (order: DeadlineOrder) => {
  if (order.deliveredAt) return false;
  if (order.status === 'NEW' || order.status === 'IN_PROGRESS' || order.status === 'READY') return true;
  return order.status === 'FINISHED' && order.deliveryTracked === true;
};

export type OrderDeadlineState =
  | { kind: 'none' }
  | { kind: 'onTime'; promisedAtMs: number; remainingMs: number }
  | { kind: 'overdue'; promisedAtMs: number; overdueMs: number };

/** Pedido sem prazo, com prazo inválido ou que não aguarda entrega: 'none'. */
export const orderDeadlineState = (order: DeadlineOrder, nowMs: number): OrderDeadlineState => {
  if (!order.promisedAt || !isAwaitingDelivery(order)) return { kind: 'none' };
  const promisedAtMs = Date.parse(order.promisedAt);
  if (!Number.isFinite(promisedAtMs)) return { kind: 'none' };
  // No instante exato do prazo o pedido já conta como atrasado.
  return nowMs >= promisedAtMs
    ? { kind: 'overdue', promisedAtMs, overdueMs: nowMs - promisedAtMs }
    : { kind: 'onTime', promisedAtMs, remainingMs: promisedAtMs - nowMs };
};

/** Quantos pedidos estão atrasados agora, pela mesma regra da fila. */
export const countOverdueOrders = (orders: readonly DeadlineOrder[], nowMs: number) =>
  orders.reduce((total, order) => total + (orderDeadlineState(order, nowMs).kind === 'overdue' ? 1 : 0), 0);

/**
 * Próximo instante (no relógio do servidor) em que um pedido no prazo passa a
 * atrasado: o menor promisedAt ainda por vir. null quando não há nenhum.
 */
export const nextOverdueAt = (orders: readonly DeadlineOrder[], nowMs: number): number | null => {
  let next: number | null = null;
  for (const order of orders) {
    const state = orderDeadlineState(order, nowMs);
    if (state.kind === 'onTime' && (next === null || state.promisedAtMs < next)) next = state.promisedAtMs;
  }
  return next;
};

/**
 * Atrasados primeiro, do maior para o menor atraso. Os demais e os empates
 * mantêm a ordem recebida (o sort do JavaScript é estável).
 */
export const sortOrdersByOverdue = <T extends DeadlineOrder>(orders: readonly T[], nowMs: number): T[] => {
  const overdueMs = new Map<T, number>();
  for (const order of orders) {
    const state = orderDeadlineState(order, nowMs);
    if (state.kind === 'overdue') overdueMs.set(order, state.overdueMs);
  }
  if (overdueMs.size === 0) return [...orders];
  return [...orders].sort((a, b) => {
    const lateA = overdueMs.get(a);
    const lateB = overdueMs.get(b);
    if (lateA === undefined && lateB === undefined) return 0;
    if (lateA === undefined) return 1;
    if (lateB === undefined) return -1;
    return lateB - lateA;
  });
};

const formatMinutes = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')} min`;
};

/**
 * Texto do cartão. O que falta é arredondado para cima ("Falta 1 min" até o
 * prazo); o atraso, para baixo. Assim os dois textos só mudam nos instantes
 * promisedAt + k minutos.
 */
export const deadlineLabel = (state: OrderDeadlineState): string | null => {
  if (state.kind === 'none') return null;
  if (state.kind === 'onTime') {
    const minutes = Math.ceil(state.remainingMs / MINUTE_MS);
    return `${minutes === 1 ? 'Falta' : 'Faltam'} ${formatMinutes(minutes)}`;
  }
  const minutes = Math.floor(state.overdueMs / MINUTE_MS);
  return minutes === 0 ? 'Atrasado há menos de 1 min' : `Atrasado há ${formatMinutes(minutes)}`;
};

/**
 * Próximo instante (no relógio do servidor) em que algum texto ou a ordem
 * muda: o primeiro promisedAt + k minutos depois de agora. null quando nenhum
 * pedido pendente tem prazo.
 */
export const nextDeadlineChangeAt = (orders: readonly DeadlineOrder[], nowMs: number): number | null => {
  let next: number | null = null;
  for (const order of orders) {
    const state = orderDeadlineState(order, nowMs);
    if (state.kind === 'none') continue;
    const elapsed = nowMs - state.promisedAtMs;
    const candidate = state.promisedAtMs + (Math.floor(elapsed / MINUTE_MS) + 1) * MINUTE_MS;
    if (next === null || candidate < next) next = candidate;
  }
  return next;
};

/**
 * Referência de horário: o X-Server-Time de uma resposta e o performance.now()
 * do momento em que ela chegou. Entre respostas, o horário do servidor é
 * estimado pelo tempo decorrido nesse relógio monotônico, que não anda para
 * trás nem pula quando alguém ajusta o relógio do computador (Date.now pula).
 */
export interface ServerClockSample {
  serverMs: number;
  monotonicMs: number;
}

/** null se o cabeçalho faltar ou for inválido: a tela mantém a última referência. */
export const serverClockSample = (header: unknown, monotonicMs: number): ServerClockSample | null => {
  if (typeof header !== 'string') return null;
  const serverMs = Date.parse(header);
  return Number.isFinite(serverMs) ? { serverMs, monotonicMs } : null;
};

export const estimateServerNow = (sample: ServerClockSample, monotonicNowMs: number) =>
  sample.serverMs + (monotonicNowMs - sample.monotonicMs);

const deadlineClockFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Hora do prazo (HH:MM) no fuso do restaurante, já resolvido pelo chamador
 * (resolveRestaurantTimeZone). Só a exibição usa o fuso; classificar e ordenar
 * comparam os instantes.
 */
export const formatDeadlineClock = (promisedAtMs: number, timeZone: string) => {
  let formatter = deadlineClockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone });
    deadlineClockFormatters.set(timeZone, formatter);
  }
  return formatter.format(promisedAtMs);
};
