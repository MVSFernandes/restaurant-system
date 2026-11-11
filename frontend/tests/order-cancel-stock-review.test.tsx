import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: mocks }));
vi.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin', role: 'ADMIN' } }) }));
vi.mock('../src/hooks/useMenuViewers', () => ({ useMenuViewers: () => undefined }));
vi.mock('../src/hooks/useOrderEvents', () => ({ useOrderEvents: () => undefined }));
import OrdersPage from '../src/pages/pdv/OrdersPage';
import WaiterHistoryPage from '../src/pages/waiter/WaiterHistoryPage';
import { STOCK_REVIEW_REQUIRED_MESSAGE } from '../src/constants/orders';

const order = {
  id: 'legacy-order', type: 'TAKE_AWAY', status: 'NEW', total: 20, deliveryFee: 0,
  customerName: 'Ana', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  userId: 'admin', waiterId: 'admin', items: [],
};

beforeEach(() => {
  mocks.get.mockImplementation(async (url: string) => ({
    data: url.startsWith('/orders') ? [order]
      : url === '/cash-register/current' ? { id: 'session' }
      : url === '/config' ? null
      : [],
  }));
  mocks.patch.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function cancelFromPdv() {
  render(<OrdersPage />);
  fireEvent.click(await screen.findByTitle('Cancelar Pedido'));
  // The icon button and the dialog confirmation share the name; confirm in the dialog.
  const confirmations = screen.getAllByRole('button', { name: 'Cancelar Pedido' });
  fireEvent.click(confirmations[confirmations.length - 1]);
  await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/orders/legacy-order/status', { status: 'CANCELED' }));
}

describe('PDV cancel of an order that needs a stock review', () => {
  it('shows the stock review warning instead of the plain success message', async () => {
    mocks.patch.mockResolvedValue({ data: { ...order, status: 'CANCELED', items: [], stockReviewRequired: true } });
    await cancelFromPdv();
    const warning = await screen.findByRole('alert');
    expect(warning.textContent).toContain(STOCK_REVIEW_REQUIRED_MESSAGE);
    expect(STOCK_REVIEW_REQUIRED_MESSAGE).toBe(
      'Pedido cancelado. O estoque deste pedido antigo precisa de conferência; nenhuma devolução automática foi realizada.'
    );
    expect(screen.queryByText('Pedido cancelado com sucesso.')).toBeNull();
  });

  it('keeps the plain success message for orders under the stock ledger', async () => {
    mocks.patch.mockResolvedValue({ data: { ...order, status: 'CANCELED', items: [], stockReviewRequired: false } });
    await cancelFromPdv();
    expect(await screen.findByText('Pedido cancelado com sucesso.')).toBeTruthy();
    expect(screen.queryByText(STOCK_REVIEW_REQUIRED_MESSAGE)).toBeNull();
  });

  it('keeps working with a response that has no stockReviewRequired field', async () => {
    mocks.patch.mockResolvedValue({ data: { ...order, status: 'CANCELED', items: [] } });
    await cancelFromPdv();
    expect(await screen.findByText('Pedido cancelado com sucesso.')).toBeTruthy();
  });
});

describe('waiter cancel of an order that needs a stock review', () => {
  it('warns the waiter after the cancel completes', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mocks.patch.mockResolvedValue({ data: { ...order, status: 'CANCELED', items: [], stockReviewRequired: true } });
    render(<WaiterHistoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Cancelar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar Pedido' }));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(STOCK_REVIEW_REQUIRED_MESSAGE));
  });
});

describe('waiter history item line', () => {
  it('shows item.price as the line total without multiplying by the quantity', async () => {
    const lineOrder = {
      ...order, id: 'line-order', total: 65,
      items: [{ id: 'item-1', productId: 'p1', quantity: 2, price: 65, product: { id: 'p1', name: 'Picanha' } }],
    };
    mocks.get.mockImplementation(async (url: string) => ({ data: url.startsWith('/orders') ? [lineOrder] : [] }));
    render(<WaiterHistoryPage />);
    const line = (await screen.findByText('2x Picanha')).parentElement as HTMLElement;
    expect(line.textContent).toContain('2x Picanha');
    expect(line.textContent?.replace(/\s/g, ' ')).toContain('R$ 65,00');
    expect(line.textContent?.replace(/\s/g, ' ')).not.toContain('R$ 130,00');
    const totalRow = screen.getByText('Total').parentElement as HTMLElement;
    expect(totalRow.textContent?.replace(/\s/g, ' ')).toContain('R$ 65,00');
  });
});
