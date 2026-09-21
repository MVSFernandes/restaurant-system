import type { Payment } from '../types';
import { formatCurrencyBRL } from '../utils/currency';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'DINHEIRO',
  CREDIT_CARD: 'CARTÃO DE CRÉDITO',
  DEBIT_CARD: 'CARTÃO DE DÉBITO',
  PIX: 'PIX',
  ON_DELIVERY: 'PAGAR NA ENTREGA',
  ON_PICKUP: 'PAGAR NA RETIRADA',
  CREDIT: 'FIADO',
};

export interface OrderPaymentSummary {
  methodLabel: string;
  statusLabel: 'JÁ PAGO' | 'A RECEBER' | 'NÃO INFORMADO';
  receiptText: string;
  isPaid: boolean;
}

export function getOrderPaymentSummary(
  payment: Pick<Payment, 'method' | 'status'> | null | undefined,
  orderTotal: number,
): OrderPaymentSummary {
  const methodLabel = payment?.method ? PAYMENT_METHOD_LABELS[payment.method] : undefined;
  if (!payment || !methodLabel) {
    return {
      methodLabel: 'NÃO INFORMADO',
      statusLabel: 'NÃO INFORMADO',
      receiptText: 'NÃO INFORMADO',
      isPaid: false,
    };
  }

  const isPaid = payment.status === 'PAID';
  const statusLabel = isPaid ? 'JÁ PAGO' : 'A RECEBER';
  const printableTotal = formatCurrencyBRL(orderTotal).replace(/\u00a0/g, ' ');
  const charge = !isPaid && payment.method === 'CASH'
    ? ` — COBRAR ${printableTotal}`
    : '';

  return {
    methodLabel,
    statusLabel,
    receiptText: `${methodLabel} (${statusLabel})${charge}`,
    isPaid,
  };
}
