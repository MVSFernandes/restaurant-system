import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CashSessionSummary } from '../src/components/cash/CashSessionSummary';
import { getOperatorName } from '../src/utils/cashAudit';
import { ToastProvider } from '../src/components/ui';
import HistoryPage from '../src/pages/pdv/HistoryPage';
import api from '../src/services/api';
import type { CashRegisterSession } from '../src/types';

vi.mock('../src/services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../src/components/fiscal/OrderFiscalDocumentPanel', () => ({
  OrderFiscalDocumentPanel: () => null,
}));

const closedSession: CashRegisterSession = {
  id: 'session-1',
  status: 'CLOSED',
  openingAmount: 100,
  closingAmount: 190,
  notes: 'Troco informado incorretamente',
  openedAt: '2026-09-21T12:00:00.000Z',
  closedAt: '2026-09-21T20:00:00.000Z',
  openedBy: { id: 'user-1', name: 'Ana' },
  closedBy: { id: 'user-2', name: 'Bruno' },
  totalEntries: 120,
  totalWithdrawals: 20,
  expectedBalance: 200,
  pixTotal: 40,
  debitTotal: 30,
  creditTotal: 50,
  onAccountTotal: 60,
  totalRevenue: 300,
  orderCount: 1,
  withdrawals: [],
};

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cash register audit', () => {
  it('shows the physical drawer formula and keeps digital methods outside it', () => {
    render(<CashSessionSummary session={closedSession} />);

    expect(screen.getByText('Fundo de troco')).toBeTruthy();
    expect(screen.getByText('+ Vendas em dinheiro')).toBeTruthy();
    expect(screen.getByText('− Sangrias')).toBeTruthy();
    expect(screen.getByText('= Saldo esperado')).toBeTruthy();
    expect(screen.getByText(/Falta de/)).toBeTruthy();
    expect(screen.getByText(/Troco informado incorretamente/)).toBeTruthy();
    expect(screen.getAllByText('Banco')).toHaveLength(3);
    expect(screen.getByText('Contas a receber')).toBeTruthy();
    expect(screen.getByText(/não passam pela gaveta física/)).toBeTruthy();
  });

  it('renders frozen product, delivery fee, table and responsible users in history', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/config') return { data: { nfceEnabled: false } };
      return {
        data: [{
          ...closedSession,
          matchedOrdersCount: 1,
          totalOrdersInSession: 1,
          withdrawals: [{
            id: 'withdrawal-1',
            amount: 20,
            reason: 'Fornecedor',
            createdAt: '2026-09-21T13:00:00.000Z',
            createdBy: { id: 'user-3', name: 'Carla' },
          }],
          orders: [{
            id: 'order-123456',
            type: 'DELIVERY',
            status: 'FINISHED',
            total: 20,
            deliveryFee: 5,
            customerName: 'Empresa Teste',
            deliveryPhone: '',
            createdAt: '2026-09-21T14:00:00.000Z',
            updatedAt: '2026-09-21T14:00:00.000Z',
            userId: 'user-1',
            user: { id: 'user-1', name: 'Ana' },
            waiter: { id: 'user-4', name: 'Diego' },
            table: { id: 'table-1', number: 7, status: 'AVAILABLE' },
            items: [{
              id: 'item-1',
              quantity: 1,
              price: 15,
              productId: 'deleted-product',
              productName: 'Prato executivo',
              orderId: 'order-123456',
            }],
            payment: {
              id: 'payment-1',
              method: 'CASH',
              amount: 20,
              status: 'PAID',
              orderId: 'order-123456',
            },
          }],
        }],
      };
    });

    render(<ToastProvider><HistoryPage /></ToastProvider>);

    await waitFor(() => expect(screen.getByText('Prato executivo')).toBeTruthy());
    expect(screen.getByText('Taxa de entrega')).toBeTruthy();
    expect(screen.getByText(/Mesa:/).parentElement?.textContent).toContain('7');
    expect(screen.getByText(/Responsável:/).parentElement?.textContent).toContain('Diego');
    expect(screen.getAllByText('Carla').length).toBeGreaterThan(0);
    expect(screen.getByText(/Aberto por Ana/)).toBeTruthy();
    expect(screen.getByText(/fechado por Bruno/)).toBeTruthy();
  });

  it('uses the explicit fallback for legacy operators without a resolvable user', () => {
    expect(getOperatorName(null)).toBe('não registrado');
    expect(getOperatorName(undefined)).toBe('não registrado');
  });
});
