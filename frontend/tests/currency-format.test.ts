import { describe, expect, it } from 'vitest';
import { formatCurrencyBRL } from '../src/utils/currency';

describe('formatCurrencyBRL', () => {
  it('formats decimals, thousands and numeric strings in BRL', () => {
    expect(formatCurrencyBRL(3.5)).toBe('R$\u00a03,50');
    expect(formatCurrencyBRL(1500)).toBe('R$\u00a01.500,00');
    expect(formatCurrencyBRL('42.9')).toBe('R$\u00a042,90');
  });

  it('falls back to zero for absent or invalid values', () => {
    expect(formatCurrencyBRL(null)).toBe('R$\u00a00,00');
    expect(formatCurrencyBRL(undefined)).toBe('R$\u00a00,00');
    expect(formatCurrencyBRL('invalid')).toBe('R$\u00a00,00');
  });
});
