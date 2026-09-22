import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../src/components/ui';
import OrderHistoryPage from '../src/pages/pdv/OrderHistoryPage';
import CashClosuresPage from '../src/pages/pdv/CashClosuresPage';
import api from '../src/services/api';

vi.mock('../src/services/api', () => ({ default: { get: vi.fn() } }));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const canceledOrder = {
  id: 'order-ABC123', type: 'DELIVERY', source: 'PUBLIC_MENU', status: 'CANCELED', total: 17.75,
  deliveryFee: 4.5, customerName: 'Maria', createdAt: '2026-09-22T12:00:00.000Z',
  updatedAt: '2026-09-22T12:05:00.000Z', userId: 'cashier', table: null,
  user: { id: 'cashier', name: 'Ana' }, waiter: null,
  items: [{ id: 'item-1', orderId: 'order-ABC123', productId: 'old-product', productName: 'Nome gravado na venda', quantity: 1, price: 13.25, saleType: 'UNIT' }],
  payment: { id: 'payment-1', orderId: 'order-ABC123', method: 'PIX', amount: 17.75, status: 'CANCELED' },
  invoice: null,
};

const session = {
  id: 'session-ABC123', status: 'CLOSED', openingAmount: 100, closingAmount: 120, notes: null,
  openedAt: '2026-09-21T12:00:00.000Z', closedAt: '2026-09-21T20:00:00.000Z',
  openedBy: { id: 'user-1', name: 'Ana' }, closedBy: { id: 'user-2', name: 'Bruno' },
  totalEntries: 20, totalWithdrawals: 0, expectedBalance: 120, pixTotal: 0, debitTotal: 0,
  creditTotal: 0, onAccountTotal: 0, totalRevenue: 20, orderCount: 1, withdrawals: [],
  fiscalDocuments: { authorizedNfceCount: 0, authorizedNfceTotal: 0, authorizedNfeCount: 0, authorizedNfeTotal: 0, pendingOrRejectedCount: 0 },
};

const renderWithProviders = (element: React.ReactNode, initialEntry = '/') => render(
  <ToastProvider><MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter></ToastProvider>
);

describe('split histories', () => {
  it('shows canceled orders in a flat paginated result and preserves the sold product name', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [canceledOrder], total: 1, page: 1, pageSize: 20, totalPages: 1 } });
    renderWithProviders(<OrderHistoryPage />);

    await waitFor(() => expect(screen.getByText('Pedido cancelado')).toBeTruthy());
    expect(screen.getByText('Cardápio digital')).toBeTruthy();
    expect(screen.getAllByText('Cancelado').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Expandir pedido/ }));
    expect(screen.getByText('Nome gravado na venda')).toBeTruthy();
    expect(screen.getByText(/Taxa de entrega:/).parentElement?.textContent).toContain('4,50');
  });

  it('sends combined filters and pagination inputs to the server', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } });
    renderWithProviders(<OrderHistoryPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Nome do cliente'), { target: { value: 'Maria' } });
    fireEvent.change(screen.getByLabelText('Código do pedido'), { target: { value: '#ABC123' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'DELIVERY' } });
    fireEvent.change(screen.getByLabelText('Forma de pagamento'), { target: { value: 'PIX' } });
    fireEvent.change(screen.getByLabelText('Situação do pagamento'), { target: { value: 'CANCELED' } });
    fireEvent.change(screen.getByLabelText('Situação do pedido'), { target: { value: 'CANCELED' } });
    fireEvent.change(screen.getByLabelText('Origem'), { target: { value: 'PUBLIC_MENU' } });
    fireEvent.change(screen.getByLabelText('Situação fiscal'), { target: { value: 'WITHOUT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));

    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/orders/history', expect.objectContaining({
      params: expect.objectContaining({ customerName: 'Maria', code: '#ABC123', type: 'DELIVERY', paymentMethod: 'PIX', paymentStatus: 'CANCELED', orderStatus: 'CANCELED', source: 'PUBLIC_MENU', fiscalStatus: 'WITHOUT', page: 1 }),
    })));
  });

  it('reuses the cash session summary and links to orders filtered by session', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [session], total: 1, page: 1, pageSize: 10, totalPages: 1 } });
    renderWithProviders(<CashClosuresPage />);

    await waitFor(() => expect(screen.getByText('R$ 20,00 faturados')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Expandir turno/ }));
    expect(screen.getByText('Conferência da gaveta')).toBeTruthy();
    expect(screen.getByText('Movimentação do período')).toBeTruthy();
    expect(screen.getByText('Documentos fiscais do período')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ver pedidos deste turno/ }).getAttribute('href')).toContain('sessionId=session-ABC123');
  });
});
