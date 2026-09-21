export type PublicPaymentMethod = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD';

export interface PublicPaymentOption {
  value: PublicPaymentMethod;
  label: string;
}

const PUBLIC_PAYMENT_OPTIONS: PublicPaymentOption[] = [
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'PIX', label: 'PIX' },
  { value: 'CREDIT_CARD', label: 'Cartão de Crédito' },
  { value: 'DEBIT_CARD', label: 'Cartão de Débito' },
];

export function getPublicPaymentOptions(enabledPayments?: string | null): PublicPaymentOption[] {
  if (!enabledPayments?.trim()) return [...PUBLIC_PAYMENT_OPTIONS];

  const configured = new Set(
    enabledPayments
      .split(',')
      .map((method) => method.trim().toUpperCase())
      .filter(Boolean)
  );

  return PUBLIC_PAYMENT_OPTIONS.filter(({ value }) => configured.has(value));
}
