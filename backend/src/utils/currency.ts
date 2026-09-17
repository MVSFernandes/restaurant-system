export type CurrencyValue = number | string | null | undefined;

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const formatBRL = (value: CurrencyValue): string => {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

  return brlFormatter.format(safeValue).replace(/[\u00A0\u202F]/g, ' ');
};
