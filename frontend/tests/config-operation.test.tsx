import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('../src/services/api', () => ({ default: mocks }));
vi.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'cashier-1', name: 'Operador', role: 'CASHIER' } }),
}));
vi.mock('../src/hooks/useOrderEvents', () => ({ useOrderEvents: () => undefined }));
vi.mock('../src/components/fiscal/OrderFiscalDocumentPanel', () => ({
  OrderFiscalDocumentPanel: ({ nfceEnabled }: { nfceEnabled?: boolean }) => (
    <div data-testid="fiscal-capability">{nfceEnabled ? 'NFC-e disponível' : 'NFC-e indisponível'}</div>
  ),
}));

import OrdersPage from '../src/pages/pdv/OrdersPage';

const operationalConfig = {
  name: 'Restaurante Operacional',
  logoUrl: 'https://example.com/logo.png',
  urbanDeliveryFee: 7,
  ruralDeliveryFee: 12,
  nfceEnabled: true,
};
const product = { id: 'meal', name: 'Prato', price: 20, categoryId: 'meals', isByWeight: false, available: true };
const categories = [{ id: 'meals', name: 'Refeições', products: [product] }];
const finishedOrder = {
  id: 'finished-order',
  type: 'TAKE_AWAY',
  source: 'PDV',
  status: 'FINISHED',
  total: 20,
  customerName: 'Cliente',
  createdAt: '2026-09-30T12:00:00.000Z',
  updatedAt: '2026-09-30T12:00:00.000Z',
  items: [{ id: 'item-1', productId: product.id, productName: product.name, product, quantity: 1, price: 20, orderId: 'finished-order' }],
  payment: { id: 'payment-1', orderId: 'finished-order', method: 'PIX', amount: 20, status: 'PAID' },
};

function responseFor(url: string) {
  if (url === '/config') return operationalConfig;
  if (url.startsWith('/categories')) return categories;
  if (url === '/tables') return [{ id: 'table-1', number: 1, status: 'OCCUPIED' }];
  if (url === '/users') return [{ id: 'cashier-1', name: 'Caixa', role: 'CASHIER' }];
  if (url === '/auth/me') return { id: 'current' };
  if (url === '/cash-register/current') return { id: 'session-1' };
  if (url.startsWith('/marmita-menu')) return [];
  if (url === '/customers') return [];
  if (url.startsWith('/orders?tableId=')) return [{
    ...finishedOrder,
    id: 'waiter-order',
    type: 'DINE_IN',
    status: 'NEW',
    tableId: 'table-1',
    waiterId: 'waiter-1',
    payment: null,
  }];
  if (url.startsWith('/orders?')) return [finishedOrder];
  if (url.startsWith('/invoices/orders')) return [];
  return [];
}

beforeEach(() => {
  mocks.get.mockImplementation(async (url: string) => ({ data: responseFor(url) }));
  mocks.post.mockResolvedValue({ data: {} });
  mocks.patch.mockResolvedValue({ data: {} });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('operational configuration projection', () => {
  it('keeps delivery fees and fiscal issuing visible to CASHIER', async () => {
    render(<OrdersPage />);

    expect((await screen.findByTestId('fiscal-capability')).textContent).toBe('NFC-e disponível');
    fireEvent.click(screen.getByRole('button', { name: 'Novo Pedido' }));
    fireEvent.change(screen.getByDisplayValue('Mesa'), { target: { value: 'DELIVERY' } });

    const urbanOption = screen.getByRole('radio', { name: /Urbana/ });
    const ruralOption = screen.getByRole('radio', { name: /Rural/ });
    expect(urbanOption.closest('label')?.textContent?.replace(/\u00a0/g, ' ')).toContain('R$ 7,00');
    expect(ruralOption.closest('label')?.textContent?.replace(/\u00a0/g, ' ')).toContain('R$ 12,00');
    expect(mocks.get).toHaveBeenCalledWith('/config');
  });
});
