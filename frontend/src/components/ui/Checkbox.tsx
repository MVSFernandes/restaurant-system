import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: ReactNode;
  description?: ReactNode;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { id, label, description, className, ...props },
  ref
) {
  const generatedId = useId();
  const controlId = id ?? `checkbox-${generatedId}`;
  return (
    <label htmlFor={controlId} className={clsx('inline-flex items-start gap-2.5 text-body text-default', props.disabled && 'opacity-60', className)}>
      <input
        ref={ref}
        id={controlId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-strong text-primary focus:ring-focus-ring disabled:cursor-not-allowed"
        {...props}
      />
      {(label || description) && <span><span className="block">{label}</span>{description && <span className="block text-caption text-muted">{description}</span>}</span>}
    </label>
  );
});
