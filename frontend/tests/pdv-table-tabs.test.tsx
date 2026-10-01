import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: mocks }));
vi.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'admin', role: 'ADMIN' } }),
}));
vi.mock('../src/hooks/useOrderEvents', () => ({ useOrderEvents: () => undefined }));

import OrdersPage from '../src/pages/pdv/OrdersPage';
import TablesPage from '../src/pages/pdv/TablesPage';
import { ToastProvider } from '../src/components/ui';

const product = {
  id: 'water',
  name: 'Água',
  price: 5,
  categoryId: 'drinks',
  isByWeight: false,
  available: true,
};

const tables = [
  { id: 'free-table', number: 1, status: 'AVAILABLE' },
  { id: 'occupied-table', number: 2, status: 'OCCUPIED' },
];

const existingTab = {
  id: 'existing-tab',
  tableId: 'occupied-table',
  name: 'Ana',
  status: 'OPEN',
  openedAt: '2026-10-01T10:00:00.000Z',
  total: 10,
  balance: 4,
  itemCount: 1,
  lastOrderAt: '2026-10-01T10:05:00.000Z',
};

const createdTab = {
  ...existingTab,
  id: 'created-tab',
  tableId: 'free-table',
  name: 'Nova conta',
  total: 0,
  balance: 0,
  itemCount: 0,
  lastOrderAt: null,
};

function setupGetMocks() {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/orders')) return { data: [] };
    if (url.startsWith('/categories')) {
      return { data: [{ id: 'drinks', name: 'Bebidas', products: [product] }] };
    }
    if (url === '/tables') return { data: tables };
    if (url === '/tables/occupied-table/tabs?status=OPEN') {
      return { data: { tabs: [existingTab], total: 10, balance: 4 } };
    }
    if (url === '/cash-register/current') return { data: { id: 'session', status: 'OPEN' } };
    if (url === '/auth/me') return { data: { id: 'admin' } };
    if (url === '/users') {
      return { data: [{ id: 'admin', name: 'Operador', role: 'ADMIN' }] };
    }
    if (url === '/config') return { data: null };
    return { data: [] };
  });
}

async function openOrderModal() {
  render(<OrdersPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Novo Pedido' }));
  fireEvent.click(await screen.findByRole('button', { name: /Água/ }));
  fireEvent.change(screen.getByDisplayValue('Responsável pelo Pedido'), {
    target: { value: 'admin' },
  });
}

beforeEach(() => {
  setupGetMocks();
  mocks.post.mockImplementation(async (url: string) => {
    if (url === '/tables/free-table/tabs') return { data: createdTab };
    if (url === '/orders') {
      return {
        data: {
          id: 'order',
          type: 'DINE_IN',
          status: 'NEW',
          total: 5,
          items: [],
          createdAt: '2026-10-01T10:10:00.000Z',
          updatedAt: '2026-10-01T10:10:00.000Z',
        },
      };
    }
    return { data: {} };
  });
  mocks.patch.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('PDV table tabs', () => {
  it('lists free and occupied tables and sends an existing tab with the order', async () => {
    await openOrderModal();

    const tableSelect = screen.getByDisplayValue('Selecione a mesa');
    expect(screen.getByRole('option', { name: 'Mesa 1 — Livre' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Mesa 2 — Ocupada' })).toBeTruthy();

    fireEvent.change(tableSelect, { target: { value: 'occupied-table' } });
    const tabSelect = await screen.findByDisplayValue('Selecione a comanda');
    expect(screen.getByRole('option', { name: /Ana.*saldo.*4,00/ })).toBeTruthy();
    fireEvent.change(tabSelect, { target: { value: 'existing-tab' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pedido' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(
      '/orders',
      expect.objectContaining({
        type: 'DINE_IN',
        tableId: 'occupied-table',
        tableTabId: 'existing-tab',
        customerName: undefined,
      }),
      expect.any(Object)
    ));
    expect(mocks.post.mock.calls.some(([url]) => url.includes('/tabs'))).toBe(false);
  });

  it('opens the first tab for a free table before creating its order', async () => {
    await openOrderModal();

    fireEvent.change(screen.getByDisplayValue('Selecione a mesa'), {
      target: { value: 'free-table' },
    });
    const nameInput = await screen.findByPlaceholderText('Ex.: Ana');
    fireEvent.change(nameInput, { target: { value: '  Nova conta  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pedido' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[0]).toEqual([
      '/tables/free-table/tabs',
      { name: 'Nova conta' },
    ]);
    expect(mocks.post.mock.calls[1][0]).toBe('/orders');
    expect(mocks.post.mock.calls[1][1]).toMatchObject({
      type: 'DINE_IN',
      tableId: 'free-table',
      tableTabId: 'created-tab',
    });
  });

  it('shows the duplicate tab message and does not create an order', async () => {
    mocks.post.mockImplementation(async (url: string) => {
      if (url === '/tables/free-table/tabs') {
        throw {
          response: {
            status: 400,
            data: { message: 'Já existe uma comanda aberta com esse nome nesta mesa' },
          },
        };
      }
      throw new Error('Order endpoint must not be called');
    });

    await openOrderModal();
    fireEvent.change(screen.getByDisplayValue('Selecione a mesa'), {
      target: { value: 'free-table' },
    });
    fireEvent.change(await screen.findByPlaceholderText('Ex.: Ana'), {
      target: { value: 'Ana' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Pedido' }));

    expect(await screen.findByText('Já existe uma comanda aberta com esse nome nesta mesa')).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post.mock.calls[0][0]).toBe('/tables/free-table/tabs');
  });
});

describe('OrdersPage table query', () => {
  it('preselects the requested table and opens the order modal', async () => {
    window.history.replaceState({}, '', '/pdv/orders?tableId=occupied-table');
    render(<OrdersPage />);

    expect(await screen.findByRole('heading', { name: 'Novo Pedido' })).toBeTruthy();
    expect((screen.getByDisplayValue('Mesa 2 — Ocupada') as HTMLSelectElement).value)
      .toBe('occupied-table');
    expect(await screen.findByDisplayValue('Selecione a comanda')).toBeTruthy();
  });
});

describe('PDV tables page', () => {
  const renderTablesPage = () => render(
    <MemoryRouter>
      <ToastProvider>
        <TablesPage />
      </ToastProvider>
    </MemoryRouter>
  );

  it('opens a free table by creating its first named tab', async () => {
    renderTablesPage();

    fireEvent.click(await screen.findByRole('button', { name: /Mesa 1/ }));
    fireEvent.change(screen.getByLabelText('Nome da comanda'), {
      target: { value: '  Ana  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Mesa' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(
      '/tables/free-table/tabs',
      { name: 'Ana' }
    ));
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(await screen.findByText('Mesa aberta')).toBeTruthy();
  });

  it('shows the backend message when opening the tab is refused', async () => {
    mocks.post.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { message: 'Já existe uma comanda aberta com esse nome nesta mesa' },
      },
    });
    renderTablesPage();

    fireEvent.click(await screen.findByRole('button', { name: /Mesa 1/ }));
    fireEvent.change(screen.getByLabelText('Nome da comanda'), {
      target: { value: 'Ana' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Mesa' }));

    expect(await screen.findByText('Já existe uma comanda aberta com esse nome nesta mesa')).toBeTruthy();
    expect(mocks.patch).not.toHaveBeenCalled();
  });
});
