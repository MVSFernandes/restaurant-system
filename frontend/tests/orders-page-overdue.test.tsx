import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fila de atrasos da tela de Pedidos: prazo = promisedAt, entrega = deliveredAt,
// "agora" = cabeçalho X-Server-Time de GET /orders.
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  role: 'ADMIN',
}));
vi.mock('../src/services/api', () => ({ default: mocks }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'operator', role: mocks.role } }) }));
vi.mock('../src/hooks/useMenuViewers', () => ({ useMenuViewers: () => undefined }));
vi.mock('../src/hooks/useOrderEvents', () => ({ useOrderEvents: () => undefined }));
import OrdersPage from '../src/pages/pdv/OrdersPage';
import { BrandingContext, DEFAULT_BRANDING_CONTEXT } from '../src/contexts/brandingContext';

// Bem longe do relógio local: se a tela usasse o relógio do computador, todo
// prazo abaixo estaria atrasado há anos.
const SERVER_NOW = Date.parse('2020-01-01T12:00:00.000Z');
const at = (offsetMs: number) => new Date(SERVER_NOW + offsetMs).toISOString();
const min = (n: number) => n * 60_000;

const order = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: 'DELIVERY',
  source: 'PDV',
  status: 'NEW',
  total: 30,
  deliveryFee: 0,
  customerName: `Cliente ${id}`,
  userId: 'operator',
  createdAt: '2020-01-01T11:00:00.000Z',
  updatedAt: '2020-01-01T11:00:00.000Z',
  promisedAt: null,
  deliveredAt: null,
  deliveryTracked: true,
  items: [],
  payment: null,
  ...overrides,
});

let orders: ReturnType<typeof order>[] = [];
let serverTime = SERVER_NOW;
// false = a resposta de GET /orders chega sem X-Server-Time.
let sendServerTime = true;

const ordersCalls = () => mocks.get.mock.calls.filter(([url]) => String(url).startsWith('/orders')).length;

function mockApi() {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/orders')) {
      return {
        data: orders,
        headers: sendServerTime ? { 'x-server-time': new Date(serverTime).toISOString() } : {},
      };
    }
    if (url === '/cash-register/current') return { data: { id: 'session' } };
    if (url === '/config') return { data: null };
    return { data: [] };
  });
}

/** Ids dos pedidos na ordem dos cartões. */
const cardOrder = () =>
  screen.getAllByText(/^Cliente: /).map((node) => node.textContent!.replace('Cliente: Cliente ', ''));
const cardOf = (id: string) => screen.getByText(`Cliente: Cliente ${id}`).closest('[data-deadline]') as HTMLElement;
const deadlineKind = (id: string) => cardOf(id).getAttribute('data-deadline');

beforeEach(() => {
  mocks.role = 'ADMIN';
  mocks.patch.mockReset();
  serverTime = SERVER_NOW;
  sendServerTime = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockApi();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Overdue queue on the Orders screen', () => {
  it('shows two overdue orders first, most late first, and keeps the others in place', async () => {
    orders = [
      order('onTime', { promisedAt: at(min(10)) }),
      order('late5', { status: 'READY', promisedAt: at(-min(5)) }),
      order('plain'),
      order('late40', { status: 'IN_PROGRESS', promisedAt: at(-min(40)) }),
    ];
    render(<OrdersPage />);
    await screen.findByText('Cliente: Cliente onTime');

    expect(cardOrder()).toEqual(['late40', 'late5', 'onTime', 'plain']);
    expect(screen.getByText('Atrasado há 40 min')).toBeTruthy();
    expect(screen.getByText('Atrasado há 5 min')).toBeTruthy();
    expect(screen.getByText('Faltam 10 min')).toBeTruthy();
    expect(deadlineKind('late40')).toBe('overdue');
    expect(deadlineKind('onTime')).toBe('onTime');
    expect(deadlineKind('plain')).toBe('none');
  });

  it('an order turns overdue with the screen open, without fetching the list again', async () => {
    orders = [
      order('first', { promisedAt: at(min(30)) }),
      order('soon', { promisedAt: at(1_000) }),
    ];
    render(<OrdersPage />);
    await screen.findByText('Cliente: Cliente soon');
    expect(screen.getByText('Falta 1 min')).toBeTruthy();
    expect(cardOrder()).toEqual(['first', 'soon']);
    const callsBefore = ordersCalls();

    await waitFor(() => expect(deadlineKind('soon')).toBe('overdue'), { timeout: 3_000 });
    expect(screen.getByText('Atrasado há menos de 1 min')).toBeTruthy();
    expect(cardOrder()).toEqual(['soon', 'first']);
    expect(ordersCalls()).toBe(callsBefore);
  });

  it('recalculates when the tab comes back from the background', async () => {
    orders = [order('a', { promisedAt: at(min(3)) })];
    render(<OrdersPage />);
    await screen.findByText('Faltam 3 min');

    // Background tabs delay timers; on return the screen reads the monotonic
    // clock again (5 min passed there), without fetching the list.
    const callsBefore = ordersCalls();
    const realMonotonic = performance.now.bind(performance);
    vi.spyOn(performance, 'now').mockImplementation(() => realMonotonic() + min(5));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(await screen.findByText('Atrasado há 2 min')).toBeTruthy();
    expect(ordersCalls()).toBe(callsBefore);
  });

  it('moving Date.now forward or back after the sync changes neither labels nor order', async () => {
    orders = [
      order('onTime', { promisedAt: at(min(10)) }),
      order('late5', { promisedAt: at(-min(5)) }),
      order('late30', { promisedAt: at(-min(30)) }),
    ];
    render(<OrdersPage />);
    await screen.findByText('Faltam 10 min');
    const labels = () => screen.getAllByText(/^Atrasado há|^Falta/).map((node) => node.textContent);
    const before = { order: cardOrder(), labels: labels() };
    expect(before.order).toEqual(['late30', 'late5', 'onTime']);

    const realNow = Date.now.bind(Date);
    for (const skew of [min(180), -min(180), min(60 * 24 * 365)]) {
      vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew);
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
      });
      expect(cardOrder()).toEqual(before.order);
      expect(labels()).toEqual(before.labels);
    }
  });

  it('shows the deadline time in the restaurant time zone, not the browser one', async () => {
    // Fuso do restaurante diferente do navegador (o do teste segue o da máquina).
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe('Asia/Tokyo');
    orders = [order('a', { promisedAt: at(min(10)) }), order('b', { promisedAt: at(-min(5)) })];
    const withZone = (timeZone: string | null) => (
      <BrandingContext.Provider value={{ ...DEFAULT_BRANDING_CONTEXT, timeZone }}>
        <OrdersPage />
      </BrandingContext.Provider>
    );

    // 12:10 UTC = 21:10 em Tóquio; a classificação usa o mesmo instante.
    render(withZone('Asia/Tokyo'));
    expect(await screen.findByText('· prazo 21:10')).toBeTruthy();
    expect(screen.getByText('· prazo 20:55')).toBeTruthy();
    expect(cardOrder()).toEqual(['b', 'a']);
    expect(screen.getByText('Faltam 10 min')).toBeTruthy();
    cleanup();

    // Sem fuso, ou com fuso inválido: America/Sao_Paulo, como nas outras telas.
    for (const zone of [null, 'Not/AZone']) {
      render(withZone(zone));
      expect(await screen.findByText('· prazo 09:10')).toBeTruthy();
      cleanup();
    }
  });

  it('without the header keeps the normal list; syncs on the first valid one; later responses without it keep the last reference', async () => {
    const fin = (id: string) => order(id, {
      status: 'FINISHED',
      payment: { id: `${id}-pay`, orderId: id, method: 'PIX', amount: 30, status: 'PAID' },
    });
    orders = [order('onTime', { promisedAt: at(min(10)) }), order('late', { promisedAt: at(-min(5)) }), fin('fin1'), fin('fin2')];
    mocks.patch.mockImplementation(async (url: string) => {
      const id = url.split('/')[2];
      orders = orders.map((o) => (o.id === id ? { ...o, deliveredAt: at(0) } : o));
      return { data: {} };
    });
    sendServerTime = false;
    render(<OrdersPage />);
    await screen.findByText('Cliente: Cliente late');
    expect(cardOrder()).toEqual(['onTime', 'late', 'fin1', 'fin2']);
    expect(screen.queryAllByText(/^Atrasado há|^Falta/)).toHaveLength(0);

    // A confirmação recarrega a lista; desta vez com o cabeçalho.
    sendServerTime = true;
    const confirmOf = (id: string) =>
      within(cardOf(id)).getByRole('button', { name: /Confirmar entrega/ });
    fireEvent.click(confirmOf('fin1'));
    await waitFor(() => expect(cardOrder()).toEqual(['late', 'onTime', 'fin1', 'fin2']));
    expect(screen.getByText('Atrasado há 5 min')).toBeTruthy();

    // Resposta seguinte sem cabeçalho: a referência anterior continua valendo.
    sendServerTime = false;
    fireEvent.click(confirmOf('fin2'));
    await waitFor(() => expect(within(cardOf('fin2')).queryByRole('button', { name: /Confirmar entrega/ })).toBeNull());
    expect(cardOrder()).toEqual(['late', 'onTime', 'fin1', 'fin2']);
    expect(screen.getByText('Atrasado há 5 min')).toBeTruthy();
    expect(screen.getByText('Faltam 10 min')).toBeTruthy();
  });

  it('leaves no-deadline, canceled, legacy DELIVERED and historic FINISHED orders out, still visible', async () => {
    orders = [
      order('noDeadline'),
      order('canceled', { status: 'CANCELED', promisedAt: at(-min(50)) }),
      order('legacyDelivered', { status: 'DELIVERED', promisedAt: at(-min(50)) }),
      order('historic', {
        status: 'FINISHED', deliveryTracked: false, promisedAt: at(-min(50)),
        payment: { id: 'p', orderId: 'historic', method: 'PIX', amount: 30, status: 'PAID' },
      }),
      order('late', { promisedAt: at(-min(1)) }),
    ];
    render(<OrdersPage />);
    await screen.findByText('Cliente: Cliente late');

    expect(cardOrder()).toEqual(['late', 'noDeadline', 'canceled', 'legacyDelivered', 'historic']);
    for (const id of ['noDeadline', 'canceled', 'legacyDelivered', 'historic']) {
      expect(deadlineKind(id)).toBe('none');
    }
    expect(screen.getAllByText(/^Atrasado há|^Falta/)).toHaveLength(1);
  });

  it('a tracked FINISHED order, paid and not delivered, goes to the top; confirming delivery drops the priority and keeps it listed', async () => {
    const paid = { id: 'pay', orderId: 'paidLate', method: 'PIX', amount: 30, status: 'PAID' };
    orders = [
      order('other', { promisedAt: at(min(20)) }),
      order('paidLate', { status: 'FINISHED', promisedAt: at(-min(15)), payment: paid }),
    ];
    mocks.patch.mockImplementation(async () => {
      orders = [
        orders[0],
        order('paidLate', { status: 'FINISHED', promisedAt: at(-min(15)), payment: paid, deliveredAt: at(0) }),
      ];
      return { data: orders[1] };
    });
    render(<OrdersPage />);
    await screen.findByText('Cliente: Cliente paidLate');

    expect(cardOrder()).toEqual(['paidLate', 'other']);
    expect(screen.getByText('Atrasado há 15 min')).toBeTruthy();
    expect(screen.getByText('JÁ PAGO')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Confirmar entrega/ }));
    await waitFor(() => expect(deadlineKind('paidLate')).toBe('none'));
    expect(mocks.patch).toHaveBeenCalledWith('/orders/paidLate/status', { status: 'DELIVERED' });
    expect(cardOrder()).toEqual(['other', 'paidLate']);
    expect(screen.queryByText('Atrasado há 15 min')).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('search keeps the overdue order first among the matches', async () => {
    orders = [
      order('Ana', { promisedAt: at(min(5)) }),
      order('Bruno', { promisedAt: at(-min(2)) }),
      order('Anabela', { promisedAt: at(-min(9)) }),
    ];
    render(<OrdersPage />);
    await screen.findByText('Cliente: Cliente Ana');
    expect(cardOrder()).toEqual(['Anabela', 'Bruno', 'Ana']);

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome do cliente...'), { target: { value: 'ana' } });
    expect(cardOrder()).toEqual(['Anabela', 'Ana']);
  });
});
