import { forwardRef, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { formatCurrencyBRL } from '../../utils/currency';
import { Input } from './Input';

export type CurrencyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'max'> & {
  value: number | null;
  onValueChange: (value: number | null) => void;
  max?: number;
};

const DEFAULT_MAX = 999_999_999.99;

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(function CurrencyInput(
  { value, onValueChange, max = DEFAULT_MAX, ...props },
  ref
) {
  const safeMax = Number.isFinite(max) ? Math.max(0, max) : DEFAULT_MAX;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/\D/g, '');
    if (!digits) {
      onValueChange(null);
      return;
    }

    const cents = Number.parseInt(digits, 10);
    const maxCents = Math.round(safeMax * 100);
    onValueChange(Math.min(cents, maxCents) / 100);
  };

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value === null ? '' : formatCurrencyBRL(value)}
      onChange={handleChange}
    />
  );
});