import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  role: 'CASHIER' as 'ADMIN' | 'CASHIER',
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../src/services/api', () => ({ default: mocks }));
vi.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'operator', name: 'Operador', email: 'operator@example.com', role: mocks.role } }),
}));

import { ToastProvider } from '../src/components/ui';
import ProductsPage from '../src/pages/menu/ProductsPage';
import WaiterOrderPage from '../src/pages/waiter/WaiterOrderPage';

const activeProduct = {
  id: 'meal',
  name: 'Marmita',
  description: 'Prato do dia',
  price: 25,
  categoryId: 'meals',
  category: { id: 'meals', name: 'Refeições' },
  isByWeight: false,
  isPaused: false,
  pausedAt: null,
  available: true,
  availableUnits: null,
  stockItems: [],
};

const pausedAt = '2026-10-02T15:30:00.000Z';

beforeEach(() => {
  mocks.role = 'CASHIER';
  mocks.get.mockImplementation(async (url: string) => ({
    data:
      url === '/products' ? [activeProduct] :
      url === '/categories' ? [{ id: 'meals', name: 'Refeições', products: [activeProduct] }] :
      url === '/stock' ? [{ id: 'stock', name: 'Insumo' }] :
      url === '/table-tabs/tab-1' ? {
        id: 'tab-1',
        tableId: 'table-1',
        name: 'Família Silva',
        status: 'OPEN',
        openedAt: pausedAt,
        total: 0,
        balance: 0,
        paidTotal: 0,
        itemCount: 0,
        lastOrderAt: null,
        closedAt: null,
        orders: [],
      } :
      url === '/tables/table-1' ? { id: 'table-1', number: 1, status: 'OCCUPIED' } :
      [],
  }));
  mocks.patch.mockResolvedValue({
    data: { ...activeProduct, isPaused: true, pausedAt, available: false },
  });
  mocks.post.mockResolvedValue({ data: {} });
  mocks.put.mockResolvedValue({ data: {} });
  mocks.delete.mockResolvedValue({ data: {} });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('product pause controls', () => {
  it('lets CASHIER pause from a read-only product list without loading stock administration', async () => {
    render(<ToastProvider><ProductsPage /></ToastProvider>);

    expect(await screen.findByText('Marmita')).toBeTruthy();
    expect(mocks.get).not.toHaveBeenCalledWith('/stock');
    expect(screen.queryByRole('button', { name: 'Novo Produto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar Marmita' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir Marmita' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vincular estoque' })).toBeNull();

    fireEvent.click(screen.getByRole('switch', { name: 'Pausar Marmita' }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/products/meal/pause', { paused: true }));
    expect(await screen.findByText(/Pausado desde/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Despausar Marmita' })).toBeTruthy();
    expect(screen.getAllByText('Produto pausado')).toHaveLength(2);
  });

  it('keeps product administration actions available to ADMIN', async () => {
    mocks.role = 'ADMIN';
    render(<ToastProvider><ProductsPage /></ToastProvider>);

    expect(await screen.findByRole('button', { name: 'Novo Produto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar Marmita' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Excluir Marmita' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vincular estoque' })).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledWith('/stock');
  });
});

describe('waiter order availability refresh', () => {
  it('reloads the menu after returning to the app or recovering the network', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/waiter/tables/table-1/tabs/tab-1/order']}>
          <Routes>
            <Route path="/waiter/tables/:tableId/tabs/:tabId/order" element={<WaiterOrderPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    );

    expect(await screen.findByText('Marmita')).toBeTruthy();
    const categoryCalls = () => mocks.get.mock.calls.filter(([url]) => url === '/categories').length;
    expect(categoryCalls()).toBe(1);

    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(categoryCalls()).toBe(2));

    fireEvent(window, new Event('online'));
    await waitFor(() => expect(categoryCalls()).toBe(3));
  });
});
