import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer, Invoice } from '../src/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../src/services/api', () => ({ default: mocks }));

import {
  useInvoicePolling,
  useInvoiceStatusPolling,
} from '../src/hooks/useInvoiceStatusPolling';
import CreditPage from '../src/pages/finance/CreditPage';

const makeInvoice = (status: Invoice['status'], patch: Partial<Invoice> = {}): Invoice => ({
  id: 'invoice-1',
  customerId: 'customer-1',
  orderId: 'order-1',
  creditTransactionId: 'charge-1',
  model: '55',
  consumerDocument: null,
  focusRef: 'focus-1',
  environment: 'homologation',
  status,
  sefazStatus: null,
  sefazMessage: null,
  accessKey: null,
  number: null,
  series: null,
  danfeUrl: null,
  xmlUrl: null,
  createdAt: '2026-09-10T10:00:00Z',
  updatedAt: '2026-09-10T10:00:00Z',
  ...patch,
});

const makeCustomer = (currentInvoice: Invoice): Customer => ({
  id: 'customer-1',
  name: 'Cliente Teste',
  phone: '18999999999',
  creditLimit: 500,
  creditUsed: 25,
  personType: 'PJ',
  document: '12345678000199',
  legalName: 'Cliente Teste LTDA',
  stateRegistration: 'ISENTO',
  fiscalZipCode: '16000000',
  fiscalStreet: 'Rua A',
  fiscalNumber: '10',
  fiscalNeighborhood: 'Centro',
  fiscalCity: 'Araçatuba',
  fiscalCityIbgeCode: '3502804',
  fiscalState: 'SP',
  openRows: [{
    id: 'charge-1',
    orderId: 'order-1',
    desc: 'Venda de teste',
    date: '2026-09-10T10:00:00Z',
    amount: 25,
    settledAmount: 0,
    openAmount: 25,
    status: 'OPEN',
    settledAt: null,
    items: [],
    invoice: currentInvoice,
  }],
  paidRows: [],
});

const advancePoll = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3_000);
  });
};

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.put.mockReset();
  mocks.delete.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('invoice status polling', () => {
  it('checks an in-flight invoice after three seconds and emits the update', async () => {
    vi.useFakeTimers();
    const authorized = makeInvoice('authorized');
    mocks.get.mockResolvedValue({ data: authorized });
    const onUpdate = vi.fn();
    let customers = [makeCustomer(makeInvoice('processing'))];
    const { rerender, unmount } = renderHook(() =>
      useInvoiceStatusPolling(customers, onUpdate)
    );

    expect(mocks.get).not.toHaveBeenCalled();
    await advancePoll();
    expect(mocks.get).toHaveBeenCalledWith('/invoices/invoice-1', {
      signal: expect.anything(),
    });
    expect(onUpdate).toHaveBeenCalledWith(authorized);

    customers = [makeCustomer(authorized)];
    rerender();
    await advancePoll();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('stops on a failed request and exposes the failure state', async () => {
    vi.useFakeTimers();
    mocks.get.mockRejectedValue(new Error('offline'));
    const { result, unmount } = renderHook(() =>
      useInvoiceStatusPolling([makeCustomer(makeInvoice('pending'))], vi.fn())
    );

    await advancePoll();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(result.current.failedIds.has('invoice-1')).toBe(true);
    expect(result.current.pollingIds.has('invoice-1')).toBe(false);
    unmount();
    await advancePoll();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it('never overlaps requests for the same invoice', async () => {
    vi.useFakeTimers();
    let resolveRequest!: (value: { data: Invoice }) => void;
    mocks.get.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    const onUpdate = vi.fn();
    renderHook(() =>
      useInvoiceStatusPolling([makeCustomer(makeInvoice('processing'))], onUpdate)
    );

    await advancePoll();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest({ data: makeInvoice('processing') });
      await Promise.resolve();
    });
    await advancePoll();
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it('stops after two minutes and exposes the timeout state', async () => {
    vi.useFakeTimers();
    mocks.get.mockResolvedValue({ data: makeInvoice('processing') });
    const { result } = renderHook(() =>
      useInvoiceStatusPolling([makeCustomer(makeInvoice('processing'))], vi.fn())
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(result.current.timedOutIds.has('invoice-1')).toBe(true);
    expect(result.current.pollingIds.has('invoice-1')).toBe(false);
  });

  it('cleans pending timers when polling is disabled', async () => {
    vi.useFakeTimers();
    let enabled = true;
    const pendingInvoice = makeInvoice('processing');
    const { rerender } = renderHook(() =>
      useInvoicePolling([pendingInvoice], vi.fn(), { enabled })
    );

    enabled = false;
    rerender();
    await advancePoll();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('does not poll final invoices', async () => {
    vi.useFakeTimers();
    renderHook(() =>
      useInvoiceStatusPolling([makeCustomer(makeInvoice('authorized'))], vi.fn())
    );
    await advancePoll();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

describe('credit invoice actions', () => {
  it('manually updates status and reveals DANFE/XML without reloading the page', async () => {
    const processing = makeInvoice('processing');
    const authorized = makeInvoice('authorized', {
      danfeUrl: 'https://focus.example/danfe',
      xmlUrl: 'https://focus.example/xml',
    });
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/customers/credit') return { data: [makeCustomer(processing)] };
      if (url === '/invoices/invoice-1') return { data: authorized };
      throw new Error('Unexpected GET ' + url);
    });

    render(<CreditPage />);
    fireEvent.click(await screen.findByText('Venda de teste'));
    fireEvent.click(await screen.findByRole('button', { name: 'Atualizar status' }));

    const danfe = await screen.findByRole('link', { name: 'Ver DANFE' });
    const xml = screen.getByRole('link', { name: 'Baixar XML' });
    expect(danfe.getAttribute('href')).toBe('https://focus.example/danfe');
    expect(xml.getAttribute('href')).toBe('https://focus.example/xml');
    expect(screen.getByText('Autorizada')).toBeTruthy();
  });

  it.each([
    ['error', 'Rejeição 728'],
    ['canceled', 'Cancelada pela SEFAZ'],
  ] as const)('shows the Focus message and reissues a %s invoice', async (status, message) => {
    let current = makeInvoice(status, { sefazMessage: message });
    const fresh = makeInvoice('processing', { id: 'invoice-2', focusRef: 'fresh-ref' });
    mocks.get.mockImplementation(async (url: string) => {
      if (url === '/customers/credit') return { data: [makeCustomer(current)] };
      throw new Error('Unexpected GET ' + url);
    });
    mocks.post.mockImplementation(async () => {
      current = fresh;
      return { data: fresh };
    });

    render(<CreditPage />);
    fireEvent.click(await screen.findByText('Venda de teste'));
    expect(screen.getByText(message)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Emitir novamente' }));

    await screen.findByRole('button', { name: 'Atualizar status' });
    expect(mocks.post).toHaveBeenCalledWith('/invoices', {
      creditTransactionId: 'charge-1',
    });
    expect(screen.queryByText(message)).toBeNull();
  });
});
