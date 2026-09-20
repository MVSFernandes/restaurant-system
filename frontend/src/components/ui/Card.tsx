import { forwardRef, type HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export type CardProps = HTMLAttributes<HTMLDivElement> & { interactive?: boolean };

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={clsx(
        'rounded-token-lg border border-default bg-surface p-card shadow-token-xs',
        interactive && 'transition hover:border-strong hover:shadow-token-sm',
        className
      )}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardHeader(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={clsx('mb-4 space-y-1', className)} {...props} />;
});

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(function CardTitle(
  { className, ...props },
  ref
) {
  return <h3 ref={ref} className={clsx('text-heading text-default', className)} {...props} />;
});

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(function CardDescription(
  { className, ...props },
  ref
) {
  return <p ref={ref} className={clsx('text-body text-muted', className)} {...props} />;
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardContent(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={className} {...props} />;
});

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardFooter(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={clsx('mt-5 flex items-center gap-3', className)} {...props} />;
});
