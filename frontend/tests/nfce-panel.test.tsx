import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice } from '../src/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../src/services/api', () => ({ default: mocks }));

import { OrderFiscalDocumentPanel } from '../src/components/fiscal/OrderFiscalDocumentPanel';
import { formatCpf, isValidCpf, formatConsumerDocument, isValidConsumerDocument } from '../src/lib/cpf';
import SettingsPage from '../src/pages/SettingsPage';

const makeInvoice = (status: Invoice['status'], patch: Partial<Invoice> = {}): Invoice => ({
  id: 'invoice-65',
  customerId: null,
  orderId: 'order-1',
  creditTransactionId: null,
  model: '65',
  consumerDocument: null,
  focusRef: 'nfce_order-1',
  environment: 'homologation',
  status,
  sefazStatus: null,
  sefazMessage: null,
  accessKey: null,
  number: null,
  series: null,
  danfeUrl: null,
  xmlUrl: null,
  qrcodeUrl: null,
  createdAt: '2026-09-11T10:00:00Z',
  updatedAt: '2026-09-11T10:00:00Z',
  ...patch,
});

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.put.mockReset();
  vi.spyOn(window, 'open').mockImplementation(() => null);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fiscal settings', () => {
  it('shows and persists CRT 4 for MEI', async () => {
    mocks.get.mockResolvedValue({
      data: { id: 'config-1', name: 'Restaurante', taxRegime: '4', nfceEnabled: true },
    });
    mocks.put.mockResolvedValue({ data: {} });

    render(<SettingsPage />);
    expect(await screen.findByDisplayValue('4 - Simples Nacional (MEI)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(mocks.put).toHaveBeenCalledWith('/config', expect.objectContaining({ taxRegime: '4' }));
  });
});

describe('NFC-e CPF field', () => {
  it('formats and validates CPF', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });

  it('blocks an invalid CPF before calling the backend', async () => {
    mocks.get.mockResolvedValue({ data: null });
    render(<OrderFiscalDocumentPanel orderId="order-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Emitir cupom fiscal' }));
    const input = screen.getByLabelText(/CPF\/CNPJ na nota/);
    fireEvent.change(input, { target: { value: '12345678900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir NFC-e' }));

    expect(await screen.findByText(/Informe um CPF ou CNPJ válido/)).toBeTruthy();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});

describe('NFC-e issue and delivery actions', () => {
  it('issues without CPF and prevents duplicate clicks while waiting', async () => {
    mocks.get.mockResolvedValue({ data: null });
    let resolvePost!: (value: { data: Invoice }) => void;
    mocks.post.mockReturnValue(new Promise((resolve) => {
      resolvePost = resolve;
    }));

    render(<OrderFiscalDocumentPanel orderId="order-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Emitir cupom fiscal' }));
    const button = screen.getByRole('button', { name: 'Emitir NFC-e' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith('/invoices/nfce', {
      orderId: 'order-1',
      consumerDocument: null,
    });

    await act(async () => {
      resolvePost({
        data: makeInvoice('authorized', {
          danfeUrl: 'https://focus.example/danfe.pdf',
        }),
      });
    });
    expect(await screen.findByText('Autorizada')).toBeTruthy();
  });

  it('shows a rejected message and retries with the informed CPF', async () => {
    mocks.get.mockResolvedValue({
      data: makeInvoice('error', { sefazMessage: 'Rejeição de teste' }),
    });
    mocks.post.mockResolvedValue({ data: makeInvoice('processing', { id: 'invoice-retry' }) });

    render(<OrderFiscalDocumentPanel orderId="order-1" />);
    expect(await screen.findByText('NFC-e rejeitada')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reemitir cupom fiscal' }));
    expect(screen.getByText('Rejeição de teste')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/CPF\/CNPJ na nota/), {
      target: { value: '52998224725' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir novamente' }));

    expect(mocks.post).toHaveBeenCalledWith('/invoices/nfce', {
      orderId: 'order-1',
      consumerDocument: '52998224725',
    });
    expect(await screen.findByText(/O status será atualizado automaticamente/)).toBeTruthy();
  });

  it('keeps QR, print, XML, copy, and WhatsApp actions available for an authorized receipt', async () => {
    const authorized = makeInvoice('authorized', {
      number: '14',
      series: '1',
      danfeUrl: 'https://focus.example/danfe.pdf',
      xmlUrl: 'https://focus.example/nfce.xml',
      qrcodeUrl: 'https://sefaz.example/consulta?p=123',
    });
    mocks.get.mockResolvedValue({ data: authorized });

    render(<OrderFiscalDocumentPanel orderId="order-1" phone="(18) 99999-9999" />);

    expect(await screen.findByText('NFC-e autorizada')).toBeTruthy();
    expect(screen.queryByTitle('Cupom fiscal do pedido order-1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver cupom fiscal' }));
    const preview = screen.getByTitle('Cupom fiscal do pedido order-1');
    expect(preview.getAttribute('src')).toBe(authorized.danfeUrl);
    expect(screen.getByRole('link', { name: 'Baixar XML' }).getAttribute('href')).toBe(authorized.xmlUrl);
    expect(screen.getByRole('link', { name: 'Consultar QR Code' }).getAttribute('href')).toBe(authorized.qrcodeUrl);

    fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(authorized.danfeUrl);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/5518999999999?text='),
      '_blank',
    );
  });
});


describe('NFC-e automatic status refresh', () => {
  it('shows compact progress and polls until authorization without opening the modal', async () => {
    vi.useFakeTimers();
    const processing = makeInvoice('processing');
    const authorized = makeInvoice('authorized', {
      danfeUrl: 'https://focus.example/danfe.pdf',
      xmlUrl: 'https://focus.example/nfce.xml',
    });
    mocks.get
      .mockResolvedValueOnce({ data: processing })
      .mockResolvedValueOnce({ data: authorized });

    render(<OrderFiscalDocumentPanel orderId="order-1" />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'Emitindo cupom...' })).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

    expect(mocks.get).toHaveBeenLastCalledWith('/invoices/invoice-65');
    expect(screen.getByText('NFC-e autorizada')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ver cupom fiscal' })).toBeTruthy();
  });
});

const pjCustomer = {
  id: 'pj-1', name: 'Empresa', legalName: 'Empresa LTDA', personType: 'PJ', document: '11222333000181',
  fiscalStreet: 'Rua A', fiscalNumber: '10', fiscalNeighborhood: 'Centro', fiscalCity: 'Araçatuba',
  fiscalState: 'SP', fiscalZipCode: '16000000', fiscalCityIbgeCode: '3502804',
};

describe('fiscal document options', () => {
  it('detects CPF/CNPJ masks and validates check digits', () => {
    expect(formatConsumerDocument('52998224725')).toBe('529.982.247-25');
    expect(formatConsumerDocument('11222333000181')).toBe('11.222.333/0001-81');
    expect(isValidConsumerDocument('11.222.333/0001-81')).toBe(true);
    expect(isValidConsumerDocument('11.222.333/0001-80')).toBe(false);
  });

  it.each(['52998224725', '11222333000181'])('issues a receipt with consumer document %s', async document => {
    mocks.get.mockResolvedValue({ data: null });
    mocks.post.mockResolvedValue({ data: makeInvoice('processing') });
    render(<OrderFiscalDocumentPanel orderId="order-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Emitir cupom fiscal' }));
    fireEvent.change(screen.getByLabelText(/CPF\/CNPJ na nota/), { target: { value: document } });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir NFC-e' }));
    expect(mocks.post).toHaveBeenCalledWith('/invoices/nfce', { orderId: 'order-1', consumerDocument: document });
    await screen.findByText(/O status será atualizado automaticamente/);
  });

  it('offers NF-e even when NFC-e is disabled and uses the selected PJ recipient', async () => {
    mocks.get.mockImplementation(async (url: string) => ({ data: url === '/customers' ? [pjCustomer, { id: 'pf-1', name: 'Pessoa física', personType: 'PF' }] : null }));
    mocks.post.mockResolvedValue({ data: makeInvoice('authorized', { model: '55', customerId: 'pj-1', danfeUrl: 'https://focus.example/nfe.pdf', xmlUrl: 'https://focus.example/nfe.xml' }) });
    render(<OrderFiscalDocumentPanel orderId="order-1" nfceEnabled={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Emitir NF-e' }));
    await screen.findByRole('option', { name: /Empresa LTDA/ });
    expect(screen.queryByRole('option', { name: /Pessoa física/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Cliente PJ destinatário'), { target: { value: 'pj-1' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Emitir NF-e' }));
    expect(mocks.post).toHaveBeenCalledWith('/invoices/nfe', { orderId: 'order-1', customerId: 'pj-1' });
    expect(await screen.findByText('NF-e autorizada')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Baixar XML' }).getAttribute('href')).toBe('https://focus.example/nfe.xml');
    expect(screen.getByRole('button', { name: 'Imprimir' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar por WhatsApp' })).toBeTruthy();
    expect(screen.queryByLabelText('Documento fiscal')).toBeNull();
  });

  it('shows incomplete fiscal fields and prevents submitting a PJ with no IBGE code', async () => {
    mocks.get.mockImplementation(async (url: string) => ({ data: url === '/customers' ? [{ ...pjCustomer, fiscalCityIbgeCode: '' }] : null }));
    render(<OrderFiscalDocumentPanel orderId="order-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Emitir cupom fiscal' }));
    fireEvent.change(screen.getByLabelText('Documento fiscal'), { target: { value: '55' } });
    await screen.findByRole('option', { name: /Empresa LTDA/ });
    fireEvent.change(screen.getByLabelText('Cliente PJ destinatário'), { target: { value: 'pj-1' } });
    expect(screen.getByText(/Dados fiscais incompletos: Código IBGE/)).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByRole<HTMLButtonElement>('button', { name: 'Emitir NF-e' }).disabled).toBe(true);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each(['55', '65'] as const)('locks the model selector after model %s authorization', async model => {
    mocks.get.mockImplementation(async (url: string) => ({ data: url === '/customers' ? [pjCustomer] : makeInvoice('authorized', { model }) }));
    render(<OrderFiscalDocumentPanel orderId="order-1" />);
    fireEvent.click(await screen.findByRole('button', { name: model === '55' ? 'Ver NF-e' : 'Ver cupom fiscal' }));
    expect(screen.getByText(/Não é possível emitir outro documento fiscal para a mesma venda/)).toBeTruthy();
    expect(screen.queryByLabelText('Documento fiscal')).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
