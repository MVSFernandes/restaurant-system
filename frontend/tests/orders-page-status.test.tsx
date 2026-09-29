import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: mocks }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin', role: 'ADMIN' } }) }));
vi.mock('../src/hooks/useMenuViewers', () => ({ useMenuViewers: () => undefined }));
vi.mock('../src/hooks/useOrderEvents', () => ({ useOrderEvents: () => undefined }));
import OrdersPage from '../src/pages/pdv/OrdersPage';

type Responses = Partial<Record<'orders' | 'cash', unknown>>;

function mockApi({ orders = [], cash = { id: 'session' } }: Responses = {}) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/orders')) {
      if (orders instanceof Error) throw orders;
      return { data: orders };
    }
    if (url === '/cash-register/current') {
      if (cash instanceof Error) throw cash;
      return { data: cash };
    }
    if (url === '/config') return { data: null };
    return { data: [] };
  });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('orders list empty state', () => {
  it('says there are no orders when the list loaded empty', async () => {
    mockApi({ orders: [] });
    render(<OrdersPage />);
    expect(await screen.findByText('Nenhum pedido encontrado.')).toBeTruthy();
  });

  it('does not claim there are no orders when loading them failed', async () => {
    mockApi({ orders: new Error('Network Error') });
    render(<OrdersPage />);
    expect(await screen.findByText('Não foi possível carregar os pedidos.')).toBeTruthy();
    expect(screen.queryByText('Nenhum pedido encontrado.')).toBeNull();
  });
});

describe('cash register banner', () => {
  const newOrderButton = () =>
    screen.getByRole('button', { name: 'Novo Pedido' }) as HTMLButtonElement;

  it('allows new orders when the register is open', async () => {
    mockApi({ cash: { id: 'session' } });
    render(<OrdersPage />);
    await screen.findByText('Nenhum pedido encontrado.');
    expect(newOrderButton().disabled).toBe(false);
    expect(screen.queryByText(/caixa/i)).toBeNull();
  });

  it('says the register is closed when the backend reports no session', async () => {
    mockApi({ cash: null });
    render(<OrdersPage />);
    expect(await screen.findByText(/O caixa está fechado/)).toBeTruthy();
    expect(newOrderButton().disabled).toBe(true);
  });

  it('keeps blocking new orders without claiming closed when the check fails', async () => {
    mockApi({ cash: new Error('Network Error') });
    render(<OrdersPage />);
    expect(await screen.findByText(/Não foi possível confirmar a situação do caixa/)).toBeTruthy();
    expect(screen.queryByText(/O caixa está fechado/)).toBeNull();
    expect(newOrderButton().disabled).toBe(true);
  });

  it('does not claim closed when the whole load fails', async () => {
    mockApi({ orders: new Error('Network Error'), cash: new Error('Network Error') });
    render(<OrdersPage />);
    expect(await screen.findByText(/Não foi possível confirmar a situação do caixa/)).toBeTruthy();
    expect(screen.queryByText(/O caixa está fechado/)).toBeNull();
    expect(newOrderButton().disabled).toBe(true);
  });
});
