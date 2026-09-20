import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { FieldContext } from './fieldContext';

export type FieldProps = Omit<HTMLAttributes<HTMLDivElement>, 'id'> & {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function Field({ id, label, hint, error, required, className, children, ...props }: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ controlId, describedBy, invalid: Boolean(error) }}>
      <div className={clsx('space-y-1.5', className)} {...props}>
        <label htmlFor={controlId} className="block text-label text-default">
          {label}
          {required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
        </label>
        {children}
        {hint && !error && <p id={hintId} className="text-caption text-muted">{hint}</p>}
        {error && <p id={errorId} role="alert" className="text-caption text-danger">{error}</p>}
      </div>
    </FieldContext.Provider>
  );
}
