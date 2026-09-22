import { describe, expect, it } from 'vitest';
import { getOrderPaymentSummary } from '../src/lib/orderPayment';

describe('order receipt payment summary', () => {
  it('shows a public PIX payment as receivable until receipt is confirmed', () => {
    const summary = getOrderPaymentSummary(
      { method: 'PIX', status: 'PENDING' },
      16,
    );

    expect(summary.receiptText).toBe('PIX (A RECEBER)');
    expect(summary.isPaid).toBe(false);
  });

  it('shows pending cash as receivable with the exact amount to collect', () => {
    const summary = getOrderPaymentSummary(
      { method: 'CASH', status: 'PENDING' },
      16,
    );

    expect(summary.receiptText).toBe('DINHEIRO (A RECEBER) — COBRAR R$ 16,00');
    expect(summary.isPaid).toBe(false);
  });

  it('shows the retained method without treating a canceled payment as receivable', () => {
    const summary = getOrderPaymentSummary(
      { method: 'PIX', status: 'CANCELED' },
      20,
    );

    expect(summary.receiptText).toBe('PIX (CANCELADO)');
    expect(summary.isPaid).toBe(false);
  });

  it('supports the stored credit-card key and only says not informed without a method', () => {
    expect(getOrderPaymentSummary(
      { method: 'CREDIT_CARD', status: 'PENDING' },
      20,
    ).receiptText).toBe('CARTÃO DE CRÉDITO (A RECEBER)');
    expect(getOrderPaymentSummary(undefined, 20).receiptText).toBe('NÃO INFORMADO');
  });
});
