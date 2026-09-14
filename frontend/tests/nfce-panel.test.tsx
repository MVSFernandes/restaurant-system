import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice } from '../src/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../src/services/api', () => ({ default: mocks }));

import { NfceReceiptPanel } from '../src/components/fiscal/NfceReceiptPanel';
import { formatCpf, isValidCpf } from '../src/lib/cpf';
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
    render(<NfceReceiptPanel orderId="order-1" />);

    const input = await screen.findByLabelText(/CPF na nota/);
    fireEvent.change(input, { target: { value: '12345678900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir NFC-e' }));

    expect(await screen.findByText(/Informe um CPF válido/)).toBeTruthy();
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

    render(<NfceReceiptPanel orderId="order-1" />);
    const button = await screen.findByRole('button', { name: 'Emitir NFC-e' });
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

    render(<NfceReceiptPanel orderId="order-1" />);
    expect(await screen.findByText('Rejeição de teste')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/CPF na nota/), {
      target: { value: '52998224725' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Emitir novamente' }));

    expect(mocks.post).toHaveBeenCalledWith('/invoices/nfce', {
      orderId: 'order-1',
      consumerDocument: '52998224725',
    });
    expect(await screen.findByText(/Aguardando retorno/)).toBeTruthy();
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

    render(<NfceReceiptPanel orderId="order-1" phone="(18) 99999-9999" />);

    const preview = await screen.findByTitle('Cupom fiscal do pedido order-1');
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
