import type { ReactNode } from 'react';
import { clsx } from 'clsx';

export type PageHeaderProps = { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string };
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return <header className={clsx('mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}><div><h1 className="text-display text-default">{title}</h1>{description && <p className="mt-1 text-body text-muted">{description}</p>}</div>{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</header>;
}
