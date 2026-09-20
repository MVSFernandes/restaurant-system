import { forwardRef, type HTMLAttributes, type TableHTMLAttributes, type ThHTMLAttributes, type TdHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(function Table(
  { className, ...props },
  ref
) {
  return <div className="w-full overflow-x-auto rounded-token-lg border border-default"><table ref={ref} className={clsx('w-full text-body', className)} {...props} /></div>;
});

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(function TableHeader(
  { className, ...props },
  ref
) {
  return <thead ref={ref} className={clsx('border-b border-default bg-surface-sunken', className)} {...props} />;
});

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(function TableBody(
  { className, ...props },
  ref
) {
  return <tbody ref={ref} className={clsx('divide-y divide-[rgb(var(--color-border-default))]', className)} {...props} />;
});

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(function TableRow(
  { className, ...props },
  ref
) {
  return <tr ref={ref} className={clsx('transition-colors hover:bg-surface-hover', className)} {...props} />;
});

type Align = 'left' | 'center' | 'right';
const alignClasses: Record<Align, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };

export type TableHeadProps = ThHTMLAttributes<HTMLTableCellElement> & { align?: Align; numeric?: boolean };
export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(function TableHead(
  { align = 'left', numeric = false, className, ...props },
  ref
) {
  return <th ref={ref} className={clsx('px-4 py-3 text-label font-semibold text-muted', alignClasses[numeric ? 'right' : align], numeric && 'tabular-nums', className)} {...props} />;
});

export type TableCellProps = TdHTMLAttributes<HTMLTableCellElement> & { align?: Align; numeric?: boolean };
export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { align = 'left', numeric = false, className, ...props },
  ref
) {
  return <td ref={ref} className={clsx('px-4 py-3 text-default', alignClasses[numeric ? 'right' : align], numeric && 'tabular-nums', className)} {...props} />;
});
