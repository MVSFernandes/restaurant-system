import type { ReactNode } from 'react';
import { clsx } from 'clsx';

export type PageHeaderProps = { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string };
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={clsx('mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-title tracking-tight text-default">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-body text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
