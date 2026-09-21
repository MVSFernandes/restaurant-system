import { describe, expect, it } from 'vitest';
import { getOrderPaymentSummary } from '../src/lib/orderPayment';

describe('order receipt payment summary', () => {
  it('shows a public PIX payment as already paid before order status changes', () => {
    const summary = getOrderPaymentSummary(
      { method: 'PIX', status: 'PAID' },
      16,
    );

    expect(summary.receiptText).toBe('PIX (JÁ PAGO)');
    expect(summary.isPaid).toBe(true);
  });

  it('shows pending cash as receivable with the exact amount to collect', () => {
    const summary = getOrderPaymentSummary(
      { method: 'CASH', status: 'PENDING' },
      16,
    );

    expect(summary.receiptText).toBe('DINHEIRO (A RECEBER) — COBRAR R$ 16,00');
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
