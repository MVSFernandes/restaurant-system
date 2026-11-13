import { describe, expect, it } from 'vitest';
import {
  countOverdueOrders,
  deadlineLabel,
  estimateServerNow,
  formatDeadlineClock,
  isAwaitingDelivery,
  nextDeadlineChangeAt,
  nextOverdueAt,
  orderDeadlineState,
  serverClockSample,
  sortOrdersByOverdue,
} from '../src/lib/orderDeadline';

const NOW = Date.parse('2026-11-12T15:30:00.000Z');
const min = (n: number) => n * 60_000;
const at = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();

type Status = 'NEW' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'FINISHED' | 'CANCELED';
const order = (id: string, status: Status, promisedAt: string | null, extra: Partial<{ deliveredAt: string | null; deliveryTracked: boolean }> = {}) => ({
  id,
  status,
  promisedAt,
  deliveredAt: null,
  deliveryTracked: true,
  ...extra,
});

describe('isAwaitingDelivery', () => {
  it('NEW, IN_PROGRESS and READY without a delivery time wait for delivery', () => {
    for (const status of ['NEW', 'IN_PROGRESS', 'READY'] as const) {
      expect(isAwaitingDelivery(order('a', status, null))).toBe(true);
      expect(isAwaitingDelivery(order('a', status, null, { deliveredAt: at(0) }))).toBe(false);
    }
  });

  it('FINISHED waits only when tracked and not delivered', () => {
    expect(isAwaitingDelivery(order('a', 'FINISHED', null))).toBe(true);
    expect(isAwaitingDelivery(order('a', 'FINISHED', null, { deliveryTracked: false }))).toBe(false);
    expect(isAwaitingDelivery(order('a', 'FINISHED', null, { deliveredAt: at(0) }))).toBe(false);
  });

  it('CANCELED and DELIVERED (legacy, without a time) never wait', () => {
    expect(isAwaitingDelivery(order('a', 'CANCELED', null))).toBe(false);
    expect(isAwaitingDelivery(order('a', 'DELIVERED', null))).toBe(false);
  });
});

describe('orderDeadlineState and deadlineLabel', () => {
  it('without a deadline, or not waiting, there is no classification', () => {
    expect(orderDeadlineState(order('a', 'NEW', null), NOW)).toEqual({ kind: 'none' });
    expect(orderDeadlineState(order('a', 'NEW', 'not a date'), NOW)).toEqual({ kind: 'none' });
    expect(orderDeadlineState(order('a', 'CANCELED', at(-30)), NOW)).toEqual({ kind: 'none' });
    expect(orderDeadlineState(order('a', 'FINISHED', at(-30), { deliveryTracked: false }), NOW)).toEqual({ kind: 'none' });
  });

  it('counts the remaining time up and the delay down, in minutes', () => {
    const label = (offsetMs: number) =>
      deadlineLabel(orderDeadlineState(order('a', 'NEW', new Date(NOW + offsetMs).toISOString()), NOW));
    expect(label(12 * 60_000)).toBe('Faltam 12 min');
    expect(label(11 * 60_000 + 1)).toBe('Faltam 12 min');
    expect(label(1)).toBe('Falta 1 min');
    expect(label(0)).toBe('Atrasado há menos de 1 min');
    expect(label(-59_999)).toBe('Atrasado há menos de 1 min');
    expect(label(-60_000)).toBe('Atrasado há 1 min');
    expect(label(-65 * 60_000)).toBe('Atrasado há 1 h 05 min');
    expect(label(120 * 60_000)).toBe('Faltam 2 h');
  });
});

describe('sortOrdersByOverdue', () => {
  it('puts overdue orders first, most late first, and keeps the rest and the ties in place', () => {
    const list = [
      order('onTime', 'NEW', at(10)),
      order('late5', 'READY', at(-5)),
      order('noDeadline', 'NEW', null),
      order('late20', 'IN_PROGRESS', at(-20)),
      order('canceled', 'CANCELED', at(-60)),
      order('tieA', 'NEW', at(-5)),
      order('history', 'FINISHED', at(-90), { deliveryTracked: false }),
    ];
    expect(sortOrdersByOverdue(list, NOW).map((o) => o.id)).toEqual([
      'late20', 'late5', 'tieA', 'onTime', 'noDeadline', 'canceled', 'history',
    ]);
  });

  it('returns a copy and does not change the input', () => {
    const list = [order('a', 'NEW', at(5)), order('b', 'NEW', at(-5))];
    const sorted = sortOrdersByOverdue(list, NOW);
    expect(sorted).not.toBe(list);
    expect(list.map((o) => o.id)).toEqual(['a', 'b']);
  });
});

describe('nextDeadlineChangeAt', () => {
  it('is the first promisedAt + k minutes after now', () => {
    const list = [
      order('a', 'NEW', new Date(NOW + 90_000).toISOString()), // changes at NOW + 30 s
      order('b', 'NEW', new Date(NOW - 10_000).toISOString()), // changes at NOW + 50 s
    ];
    expect(nextDeadlineChangeAt(list, NOW)).toBe(NOW + 30_000);
    // At the exact turn the next change is a full minute later.
    expect(nextDeadlineChangeAt([order('c', 'NEW', at(0))], NOW)).toBe(NOW + 60_000);
  });

  it('is null when no waiting order has a deadline', () => {
    expect(nextDeadlineChangeAt([order('a', 'NEW', null), order('b', 'CANCELED', at(5))], NOW)).toBeNull();
  });
});

describe('countOverdueOrders and nextOverdueAt', () => {
  const list = [
    order('late', 'READY', at(-5)),
    order('paidLate', 'FINISHED', at(-15)),
    order('delivered', 'FINISHED', at(-20), { deliveredAt: at(-1) }),
    order('historic', 'FINISHED', at(-30), { deliveryTracked: false }),
    order('canceled', 'CANCELED', at(-40)),
    order('legacy', 'DELIVERED', at(-40)),
    order('noDeadline', 'NEW', null),
    order('soon', 'NEW', at(2)),
    order('later', 'IN_PROGRESS', at(10)),
  ];

  it('counts the overdue orders by the queue rule', () => {
    expect(countOverdueOrders(list, NOW)).toBe(2);
    // At the exact deadline the order already counts as overdue.
    expect(countOverdueOrders(list, NOW + min(2))).toBe(3);
    expect(countOverdueOrders([], NOW)).toBe(0);
  });

  it('next turn is the earliest deadline still ahead, null when none', () => {
    expect(nextOverdueAt(list, NOW)).toBe(NOW + min(2));
    expect(nextOverdueAt(list, NOW + min(2))).toBe(NOW + min(10));
    expect(nextOverdueAt(list, NOW + min(10))).toBeNull();
  });
});

describe('server clock reference', () => {
  it('keeps the header time with the monotonic time it arrived, and is null without a usable header', () => {
    expect(serverClockSample('2026-11-12T15:30:05.000Z', 1_234.5)).toEqual({ serverMs: NOW + 5_000, monotonicMs: 1_234.5 });
    expect(serverClockSample(undefined, 1)).toBeNull();
    expect(serverClockSample('nope', 1)).toBeNull();
  });

  it('estimates the server time by the monotonic time elapsed since the response', () => {
    const sample = { serverMs: NOW, monotonicMs: 10_000 };
    expect(estimateServerNow(sample, 10_000)).toBe(NOW);
    expect(estimateServerNow(sample, 10_000 + min(3))).toBe(NOW + min(3));
  });
});

describe('formatDeadlineClock', () => {
  it('shows the deadline in the restaurant time zone, from the same instant', () => {
    expect(formatDeadlineClock(NOW, 'America/Sao_Paulo')).toBe('12:30');
    expect(formatDeadlineClock(NOW, 'Asia/Tokyo')).toBe('00:30');
    expect(formatDeadlineClock(NOW, 'UTC')).toBe('15:30');
  });
});
