import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: ReactNode };

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { id, label, className, ...props },
  ref
) {
  const generatedId = useId();
  const controlId = id ?? `switch-${generatedId}`;
  return (
    <label htmlFor={controlId} className={clsx('inline-flex items-center gap-3 text-body text-default', props.disabled && 'opacity-60', className)}>
      <span className="relative inline-flex h-6 w-11 shrink-0">
        <input ref={ref} id={controlId} type="checkbox" role="switch" className="peer sr-only" {...props} />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-focus-ring peer-focus-visible:ring-offset-2" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
      {label}
    </label>
  );
});
