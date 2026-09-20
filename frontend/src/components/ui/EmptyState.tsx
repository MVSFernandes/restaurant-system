import type { ReactNode } from 'react';
import { clsx } from 'clsx';

export type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center rounded-token-lg border border-dashed border-default bg-surface px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 text-subtle" aria-hidden="true">{icon}</div>}
      <h3 className="text-heading text-default">{title}</h3>
      {description && <p className="mt-1 max-w-md text-body text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
