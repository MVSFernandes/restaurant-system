import type { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={clsx('animate-pulse rounded-token-md bg-fill-neutral', className)} {...props} />;
}

export type SkeletonTextProps = HTMLAttributes<HTMLDivElement> & { lines?: number };
export function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps) {
  return <div className={clsx('space-y-2', className)} {...props}>{Array.from({ length: lines }, (_, index) => <Skeleton key={index} className={clsx('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />)}</div>;
}

export function SkeletonCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('rounded-token-lg border border-default bg-surface p-card shadow-token-xs', className)} {...props}><Skeleton className="h-24 w-full" /><Skeleton className="mt-4 h-5 w-2/3" /><Skeleton className="mt-2 h-3 w-full" /><Skeleton className="mt-2 h-3 w-1/2" /></div>;
}
