import React from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// "Pedidos atrasados" no Dashboard: mesma regra e mesma consulta da fila da
// tela de Pedidos, "agora" pelo X-Server-Time de GET /orders.
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  role: 'ADMIN',
  refreshLive: null as null | (() => Promise<void> | void),
}));
vi.mock('../src/services/api', () => ({ default: mocks }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'operator', role: mocks.role } }) }));
vi.mock('../src/hooks/useMenuViewers', () => ({ useMenuViewers: () => ({ available: false, count: null }) }));
vi.mock('../src/hooks/useOrderEvents', () => ({
  useOrderEvents: (refresh: () => Promise<void>) => { mocks.refreshLive = refresh; },
}));
import DashboardPage from '../src/pages/DashboardPage';

// Longe do relógio local: se o Dashboard usasse Date.now, todo prazo estaria vencido.
const SERVER_NOW = Date.parse('2020-01-01T12:00:00.000Z');
const at = (offsetMs: number) => new Date(SERVER_NOW + offsetMs).toISOString();
const min = (n: number) => n * 60_000;
const PAID = { id: 'pay', method: 'PIX', amount: 30, status: 'PAID' };

const order = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: 'DELIVERY',
  status: 'NEW',
  total: 30,
  promisedAt: null,
  deliveredAt: null,
  deliveryTracked: true,
  items: [],
  payment: null,
  ...overrides,
});

const SESSION = { id: 'session', openedAt: at(-min(120)), openedBy: { name: 'Caixa' }, totalRevenue: 90, orderCount: 7 };

let orders: ReturnType<typeof order>[] = [];
let sendServerTime = true;
let ordersFail = false;
let payables: unknown[] = [];

const orderUrls = () => mocks.get.mock.calls.map(([url]) => String(url)).filter((url) => url.startsWith('/orders'));

function mockApi() {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/orders')) {
      if (ordersFail) throw new Error('offline');
      return { data: orders, headers: sendServerTime ? { 'x-server-time': at(0) } : {} };
    }
    if (url === '/cash-register/current') return { data: SESSION };
    if (url === '/finance/payables') return { data: payables };
    if (url.startsWith('/finance/reports')) return { data: { topProducts: [] } };
    return { data: [] };
  });
}

const renderDashboard = () => render(<MemoryRouter><DashboardPage /></MemoryRouter>);
const attentionCard = () => screen.getByRole('heading', { name: 'Precisa de atenção' }).parentElement as HTMLElement;
const overdueRow = () => within(attentionCard()).queryByText('Pedidos atrasados')?.closest('li') ?? null;
const ribbonValue = (label: string) => screen.getByText(label).closest('li')!.textContent!.replace(label, '');

/** Cobre os casos pedidos: atrasado, pago sem entrega, entregue, cancelado, sem prazo, FINISHED histórico. */
const mixedOrders = () => [
  order('late', { status: 'READY', promisedAt: at(-min(5)) }),
  order('paidLate', { status: 'FINISHED', promisedAt: at(-min(15)), payment: PAID }),
  order('delivered', { status: 'FINISHED', promisedAt: at(-min(20)), deliveredAt: at(-min(1)), payment: PAID }),
  order('canceled', { status: 'CANCELED', promisedAt: at(-min(40)) }),
  order('legacyDelivered', { status: 'DELIVERED', promisedAt: at(-min(40)) }),
  order('historic', { status: 'FINISHED', deliveryTracked: false, promisedAt: at(-min(50)), payment: PAID }),
  order('noDeadline'),
  order('onTime', { status: 'IN_PROGRESS', promisedAt: at(min(10)) }),
];

beforeEach(() => {
  mocks.role = 'ADMIN';
  mocks.refreshLive = null;
  mocks.get.mockReset();
  orders = [];
  sendServerTime = true;
  ordersFail = false;
  payables = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockApi();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Overdue orders on the Dashboard', () => {
  it('counts overdue orders, paid FINISHED included, and links to the Orders queue', async () => {
    orders = mixedOrders();
    renderDashboard();

    await waitFor(() => expect(overdueRow()).not.toBeNull());
    const row = overdueRow()!;
    expect(row.textContent).toContain('2');
    expect(within(row).getByRole('link', { name: /Ver fila de pedidos/ }).getAttribute('href')).toBe('/pdv/orders');
    // Uma consulta só, a mesma da tela de Pedidos.
    expect(orderUrls()).toEqual(['/orders?status=NEW,IN_PROGRESS,READY,DELIVERED,FINISHED,CANCELED']);
  });

  it('keeps the "Agora" ribbon on the original set (FINISHED and CANCELED out)', async () => {
    orders = [
      ...mixedOrders(),
      order('ready2', { status: 'READY' }),
      order('finUntracked', { status: 'FINISHED', deliveryTracked: false, payment: PAID }),
    ];
    renderDashboard();
    await waitFor(() => expect(overdueRow()).not.toBeNull());

    expect(ribbonValue('Novos')).toBe('1');
    expect(ribbonValue('Em preparo')).toBe('1');
    expect(ribbonValue('Prontos')).toBe('2');
    expect(ribbonValue('Entregues, aguardando pagamento')).toBe('1');
  });

  it('an order turns overdue with the Dashboard open, without fetching the list again', async () => {
    orders = [order('late', { promisedAt: at(-min(5)) }), order('soon', { promisedAt: at(1_000) })];
    renderDashboard();
    await waitFor(() => expect(overdueRow()?.textContent).toContain('1'));
    const callsBefore = orderUrls().length;

    await waitFor(() => expect(overdueRow()?.textContent).toContain('2'), { timeout: 3_000 });
    expect(orderUrls().length).toBe(callsBefore);
  });

  it('recalculates when the tab comes back, before the reload answers', async () => {
    orders = [order('a', { promisedAt: at(min(3)) })];
    renderDashboard();
    await screen.findByText('Nada pendente agora.');

    // The reload on return never answers: the count comes from the list on screen.
    let release: () => void = () => {};
    mocks.get.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ data: [] }); }));
    const realMonotonic = performance.now.bind(performance);
    vi.spyOn(performance, 'now').mockImplementation(() => realMonotonic() + min(5));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });

    await waitFor(() => expect(overdueRow()?.textContent).toContain('1'));
    release();
  });

  it('delivery confirmation arrives with the existing refresh and drops the count', async () => {
    orders = [
      order('late', { promisedAt: at(-min(5)) }),
      order('paidLate', { status: 'FINISHED', promisedAt: at(-min(15)), payment: PAID }),
    ];
    renderDashboard();
    await waitFor(() => expect(overdueRow()?.textContent).toContain('2'));

    orders = orders.map((o) => (o.id === 'paidLate' ? { ...o, deliveredAt: at(0) } : o));
    await act(async () => { await mocks.refreshLive!(); });
    expect(overdueRow()?.textContent).toContain('1');

    orders = orders.map((o) => (o.id === 'late' ? { ...o, status: 'DELIVERED', deliveredAt: at(0) } : o));
    await act(async () => { await mocks.refreshLive!(); });
    expect(overdueRow()).toBeNull();
    expect(within(attentionCard()).getByText('Nada pendente agora.')).toBeTruthy();
  });

  it('moving Date.now does not change the count', async () => {
    orders = [order('late', { promisedAt: at(-min(5)) }), order('onTime', { promisedAt: at(min(10)) })];
    renderDashboard();
    await waitFor(() => expect(overdueRow()?.textContent).toContain('1'));
    const realNow = Date.now.bind(Date);
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + min(60 * 24 * 365));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await mocks.refreshLive!(); });
    expect(overdueRow()?.textContent).toContain('1');
  });

  it('without a valid server time the item is unavailable and the list never claims "nothing pending"', async () => {
    orders = [order('late', { promisedAt: at(-min(5)) })];
    sendServerTime = false;
    renderDashboard();

    await waitFor(() => expect(overdueRow()?.textContent).toContain('Não disponível'));
    expect(within(attentionCard()).queryByText('Nada pendente agora.')).toBeNull();

    // First valid header: the count appears; a later response without it keeps the reference.
    sendServerTime = true;
    await act(async () => { await mocks.refreshLive!(); });
    expect(overdueRow()?.textContent).toContain('1');
    sendServerTime = false;
    await act(async () => { await mocks.refreshLive!(); });
    expect(overdueRow()?.textContent).toContain('1');
  });

  it('when the orders load fails the item is unavailable', async () => {
    ordersFail = true;
    renderDashboard();
    await waitFor(() => expect(overdueRow()?.textContent).toContain('Não disponível'));
    expect(within(attentionCard()).queryByText('Nada pendente agora.')).toBeNull();
  });

  it('zero overdue with valid data shows no item and lets the list say nothing is pending', async () => {
    orders = [order('onTime', { promisedAt: at(min(10)) }), order('canceled', { status: 'CANCELED', promisedAt: at(-min(5)) })];
    renderDashboard();
    expect(await within(attentionCard()).findByText('Nada pendente agora.')).toBeTruthy();
    expect(overdueRow()).toBeNull();
  });

  it('CASHIER sees the item; FINANCE does not and keeps payables first', async () => {
    orders = mixedOrders();
    mocks.role = 'CASHIER';
    renderDashboard();
    await waitFor(() => expect(overdueRow()?.textContent).toContain('2'));
    cleanup();

    mocks.role = 'FINANCE';
    payables = [{ id: 'p2', description: 'Luz', amount: 200, dueDate: '2019-12-01', paid: false }];
    mocks.get.mockClear();
    renderDashboard();
    await waitFor(() => expect(within(attentionCard()).getByText('Contas vencendo hoje')).toBeTruthy());
    expect(overdueRow()).toBeNull();
    const labels = within(attentionCard()).getAllByRole('listitem').map((li) => li.querySelector('span')?.textContent);
    expect(labels[0]).toBe('Contas vencendo hoje');
  });
});
