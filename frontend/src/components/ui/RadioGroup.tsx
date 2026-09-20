import { useId, type ReactNode } from 'react';
import { clsx } from 'clsx';

export type RadioOption = { value: string; label: ReactNode; description?: ReactNode; disabled?: boolean };
export type RadioGroupProps = {
  name?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: RadioOption[];
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

export function RadioGroup({ name, value, onValueChange, options, disabled, className, 'aria-label': ariaLabel }: RadioGroupProps) {
  const generatedId = useId();
  const groupName = name ?? `radio-${generatedId}`;
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={clsx('space-y-2', className)}>
      {options.map((option) => (
        <label key={option.value} className={clsx('flex items-start gap-2.5 rounded-token-md border border-default p-3 text-body', (disabled || option.disabled) && 'opacity-60')}>
          <input
            type="radio"
            name={groupName}
            value={option.value}
            checked={value === option.value}
            disabled={disabled || option.disabled}
            onChange={() => onValueChange(option.value)}
            className="mt-0.5 h-4 w-4 border-strong text-primary focus:ring-focus-ring"
          />
          <span><span className="block text-default">{option.label}</span>{option.description && <span className="block text-caption text-muted">{option.description}</span>}</span>
        </label>
      ))}
    </div>
  );
}
