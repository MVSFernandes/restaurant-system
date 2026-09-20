import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

type IconOnlyProps =
  | { iconOnly: true; 'aria-label': string }
  | { iconOnly?: false; 'aria-label'?: string };

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & IconOnlyProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  solid?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-primary text-primary-fg hover:bg-primary-hover',
  secondary: 'border-default bg-surface text-default hover:bg-surface-hover',
  ghost: 'border-transparent bg-transparent text-default hover:bg-surface-hover',
  danger: 'border-danger bg-transparent text-danger hover:bg-danger-subtle',
  link: 'h-auto border-transparent bg-transparent px-0 text-primary underline-offset-4 hover:underline',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-token-sm px-3 text-caption',
  md: 'h-10 rounded-token-md px-4 text-body',
  lg: 'h-12 rounded-token-md px-5 text-body-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    leftIcon,
    rightIcon,
    loading = false,
    fullWidth = false,
    iconOnly = false,
    solid = false,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref
) {
  const dangerClass = solid
    ? 'border-danger bg-danger text-danger-fg hover:brightness-95'
    : variantClasses.danger;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-2 border font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses[size],
        variant === 'danger' ? dangerClass : variantClasses[variant],
        fullWidth && 'w-full',
        iconOnly && {
          'w-8 px-0': size === 'sm',
          'w-10 px-0': size === 'md',
          'w-12 px-0': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : leftIcon}
      {!iconOnly && children}
      {!loading && rightIcon}
    </button>
  );
});
