export type CurrencyValue = number | string | null | undefined;

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const formatCurrencyBRL = (value: CurrencyValue): string => {
  const numericValue = Number(value);
  return brlFormatter.format(Number.isFinite(numericValue) ? numericValue : 0);
};
