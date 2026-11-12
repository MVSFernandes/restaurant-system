import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// "Confirmar entrega" para pedido finalizado antes de ser entregue. O caminho
// normal (READY -> "Marcar Entregue") continua igual.
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

const order = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  type: 'DELIVERY',
  source: 'PDV',
  status: 'FINISHED',
  total: 30,
  deliveryFee: 0,
  customerName: `Cliente ${id}`,
  userId: 'operator',
  createdAt: '2026-11-12T15:00:00.000Z',
  updatedAt: '2026-11-12T15:00:00.000Z',
  promisedAt: null,
  deliveredAt: null,
  deliveryTracked: true,
  items: [],
  payment: { id: `${id}-pay`, orderId: id, method: 'PIX', amount: 30, status: 'PAID' },
  ...overrides,
});

let orders: ReturnType<typeof order>[] = [];

function mockApi() {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/orders')) return { data: orders };
    if (url === '/cash-register/current') return { data: { id: 'session' } };
    if (url === '/config') return { data: null };
    return { data: [] };
  });
}

// O cartão mostra "Cliente: <nome>".
const findOrder = (id: string) => screen.findByText(`Cliente: Cliente ${id}`);
const confirmButton = () => screen.queryAllByRole('button', { name: /Confirmar entrega/ });

beforeEach(() => {
  mocks.role = 'ADMIN';
  mocks.patch.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockApi();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Confirmar entrega on the Orders screen', () => {
  it('shows only for FINISHED orders that are tracked and have no delivery time', async () => {
    orders = [
      order('eligible'),
      order('older', { deliveryTracked: false }),
      order('already', { deliveredAt: '2026-11-12T15:20:00.000Z' }),
      order('ready', { status: 'READY', payment: null }),
      order('delivered', { status: 'DELIVERED' }),
      order('canceled', { status: 'CANCELED' }),
    ];
    render(<OrdersPage />);
    await findOrder('eligible');
    expect(confirmButton()).toHaveLength(1);
    // The normal path is still there for READY.
    expect(screen.getAllByTitle('Marcar Entregue')).toHaveLength(1);
  });

  it('is offered to CASHIER too, and to nobody else', async () => {
    orders = [order('eligible')];
    mocks.role = 'CASHIER';
    render(<OrdersPage />);
    await findOrder('eligible');
    expect(confirmButton()).toHaveLength(1);
    cleanup();

    mocks.role = 'FINANCE';
    render(<OrdersPage />);
    await findOrder('eligible');
    expect(confirmButton()).toHaveLength(0);
  });

  it('a FINISHED order without a confirmed payment is eligible but never labeled as paid', async () => {
    orders = [order('unpaid', { payment: { id: 'p', orderId: 'unpaid', method: 'CASH', amount: 30, status: 'PENDING' } })];
    render(<OrdersPage />);
    await findOrder('unpaid');
    expect(confirmButton()).toHaveLength(1);
    expect(screen.queryByText('JÁ PAGO')).toBeNull();
    expect(screen.getByText('A RECEBER')).toBeTruthy();
  });

  it('sends the existing DELIVERED status change once and reloads; the button leaves with the time', async () => {
    orders = [order('eligible')];
    mocks.patch.mockImplementation(async () => {
      orders = [order('eligible', { deliveredAt: '2026-11-12T15:30:00.000Z' })];
      return { data: orders[0] };
    });
    render(<OrdersPage />);
    await findOrder('eligible');
    fireEvent.click(confirmButton()[0]);
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch).toHaveBeenCalledWith('/orders/eligible/status', { status: 'DELIVERED' });
    expect(await screen.findByText('Entrega confirmada.')).toBeTruthy();
    await waitFor(() => expect(confirmButton()).toHaveLength(0));
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('shows the backend refusal (older order) and keeps the order as it was', async () => {
    orders = [order('eligible')];
    mocks.patch.mockRejectedValue({
      response: { data: { message: 'Este pedido foi finalizado antes do registro de entregas; a entrega não pode ser confirmada.' } },
    });
    render(<OrdersPage />);
    await findOrder('eligible');
    fireEvent.click(confirmButton()[0]);
    expect(await screen.findByText(/antes do registro de entregas/)).toBeTruthy();
    expect(confirmButton()).toHaveLength(1);
  });
});
