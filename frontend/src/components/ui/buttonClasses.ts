import { clsx } from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-primary text-primary-fg hover:bg-primary-hover',
  secondary: 'border-default bg-surface text-default hover:bg-surface-hover',
  ghost: 'border-transparent bg-transparent text-default hover:bg-surface-hover',
  danger: 'border-danger bg-transparent text-danger hover:bg-danger-subtle',
  link: 'h-auto border-transparent bg-transparent px-0 text-primary underline-offset-4 hover:underline',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-token-sm text-caption',
  md: 'h-10 rounded-token-md text-body',
  lg: 'h-12 rounded-token-md text-body-lg',
};

const paddingClasses: Record<ButtonSize, string> = {
  sm: 'px-3',
  md: 'px-4',
  lg: 'px-5',
};

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: '[&_svg]:!h-4 [&_svg]:!w-4 [&_svg]:shrink-0',
  md: '[&_svg]:!h-5 [&_svg]:!w-5 [&_svg]:shrink-0',
  lg: '[&_svg]:!h-6 [&_svg]:!w-6 [&_svg]:shrink-0',
};

const iconOnlyWidthClasses: Record<ButtonSize, string> = {
  sm: 'w-8',
  md: 'w-10',
  lg: 'w-12',
};

export type ButtonClassOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  fullWidth?: boolean;
  solid?: boolean;
  className?: string;
};

// Classes do Button, também para elementos que não podem ser <button>, como <Link>.
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  iconOnly = false,
  fullWidth = false,
  solid = false,
  className,
}: ButtonClassOptions = {}) {
  const dangerClass = solid
    ? 'border-danger bg-danger text-danger-fg hover:brightness-95'
    : variantClasses.danger;

  return clsx(
    'inline-flex items-center justify-center gap-2 border font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    sizeClasses[size],
    iconSizeClasses[size],
    variant === 'danger' ? dangerClass : variantClasses[variant],
    fullWidth && 'w-full',
    iconOnly ? iconOnlyWidthClasses[size] : paddingClasses[size],
    className
  );
}
