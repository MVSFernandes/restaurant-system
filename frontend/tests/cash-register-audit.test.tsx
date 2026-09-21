import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CashSessionSummary } from '../src/components/cash/CashSessionSummary';
import { getOperatorName } from '../src/utils/cashAudit';
import { ToastProvider } from '../src/components/ui';
import HistoryPage from '../src/pages/pdv/HistoryPage';
import CashRegisterPage from '../src/pages/pdv/CashRegisterPage';
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
  fiscalDocuments: {
    authorizedNfceCount: 2,
    authorizedNfceTotal: 125.5,
    authorizedNfeCount: 1,
    authorizedNfeTotal: 80.25,
    pendingOrRejectedCount: 3,
  },
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
    expect(screen.getByText('Documentos fiscais do período')).toBeTruthy();
    expect(screen.getByText('NFC-e autorizadas')).toBeTruthy();
    expect(screen.getByText('NF-e autorizadas')).toBeTruthy();
    expect(screen.getByText('Rejeitados ou em processamento')).toBeTruthy();
    expect(screen.getByText(/125,50/)).toBeTruthy();
    expect(screen.getByText(/80,25/)).toBeTruthy();
  });

  it('shows only the active-turn sections in the requested order while the register is open', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/cash-register/current') {
        return { data: { ...closedSession, status: 'OPEN', closingAmount: null, closedAt: null, closedBy: null } };
      }
      return { data: [closedSession] };
    });

    render(
      <ToastProvider>
        <MemoryRouter>
          <CashRegisterPage />
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => expect(screen.getByText('Turno ativo')).toBeTruthy());
    expect(screen.queryByText('Resumo do fechamento concluído')).toBeNull();
    expect(screen.queryByText('Fechamentos recentes')).toBeNull();

    const pageText = document.body.textContent || '';
    expect(pageText.indexOf('Caixa aberto')).toBeLessThan(pageText.indexOf('Conferência da gaveta'));
    expect(pageText.indexOf('Conferência da gaveta')).toBeLessThan(pageText.indexOf('Registrar sangria'));
    expect(pageText.indexOf('Registrar sangria')).toBeLessThan(pageText.indexOf('Fechar caixa'));
  });

  it('shows opening, last closing summary and compact recent history while the register is closed', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/cash-register/current') return { data: null };
      return { data: [closedSession] };
    });

    render(
      <ToastProvider>
        <MemoryRouter>
          <CashRegisterPage />
        </MemoryRouter>
      </ToastProvider>
    );

    await waitFor(() => expect(screen.getByText('Resumo do fechamento concluído')).toBeTruthy());
    expect(screen.getByRole('heading', { name: 'Abrir caixa' })).toBeTruthy();
    expect(screen.getByText('Fechamentos recentes')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver histórico completo' })).toBeTruthy();

    const pageText = document.body.textContent || '';
    expect(pageText.indexOf('Abrir caixa')).toBeLessThan(pageText.indexOf('Resumo do fechamento concluído'));
    expect(pageText.indexOf('Resumo do fechamento concluído')).toBeLessThan(pageText.indexOf('Fechamentos recentes'));
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
