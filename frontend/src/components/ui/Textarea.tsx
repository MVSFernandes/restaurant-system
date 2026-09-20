import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { useFieldControl } from './fieldContext';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...props },
  ref
) {
  const explicitInvalid = invalid === undefined ? undefined : invalid === true || invalid === 'true';
  const fieldProps = useFieldControl(id, describedBy, explicitInvalid);
  return (
    <textarea
      ref={ref}
      className={clsx(
        'min-h-20 w-full resize-y rounded-token-md border border-strong bg-surface px-3 py-2 text-body text-default shadow-token-xs',
        'placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus-ring/30',
        'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60 read-only:bg-surface-sunken',
        fieldProps['aria-invalid'] && 'border-danger focus:border-danger focus:ring-danger/20',
        className
      )}
      {...fieldProps}
      {...props}
    />
  );
});
