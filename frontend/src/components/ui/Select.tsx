import { forwardRef, type SelectHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { useFieldControl } from './fieldContext';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...props },
  ref
) {
  const explicitInvalid = invalid === undefined ? undefined : invalid === true || invalid === 'true';
  const fieldProps = useFieldControl(id, describedBy, explicitInvalid);
  return (
    <select
      ref={ref}
      className={clsx(
        'h-10 w-full rounded-token-md border border-strong bg-surface px-3 text-body text-default shadow-token-xs',
        'focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus-ring/30',
        'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60',
        fieldProps['aria-invalid'] && 'border-danger focus:border-danger focus:ring-danger/20',
        className
      )}
      {...fieldProps}
      {...props}
    />
  );
});
