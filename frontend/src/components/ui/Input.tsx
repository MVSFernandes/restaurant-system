import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useFieldControl } from './fieldContext';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  leftAdornment?: ReactNode;
  rightAdornment?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leftAdornment, rightAdornment, className, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...props },
  ref
) {
  const fieldProps = useFieldControl(id, describedBy, invalid === true || invalid === 'true');
  return (
    <div className="relative">
      {leftAdornment && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-muted">{leftAdornment}</span>}
      <input
        ref={ref}
        className={clsx(
          'h-10 w-full rounded-token-md border border-strong bg-surface px-3 text-body text-default shadow-token-xs',
          'placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus-ring/30',
          'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60 read-only:bg-surface-sunken',
          fieldProps['aria-invalid'] && 'border-danger focus:border-danger focus:ring-danger/20',
          leftAdornment && 'pl-10',
          rightAdornment && 'pr-10',
          className
        )}
        {...fieldProps}
        {...props}
      />
      {rightAdornment && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-body text-muted">{rightAdornment}</span>}
    </div>
  );
});
