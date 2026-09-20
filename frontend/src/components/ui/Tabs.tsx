import { createContext, useContext, useId, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { clsx } from 'clsx';

type TabsContextValue = { value: string; onValueChange: (value: string) => void; baseId: string };
const TabsContext = createContext<TabsContextValue | null>(null);

export type TabsProps = { value: string; onValueChange: (value: string) => void; children: ReactNode; className?: string };
export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  const baseId = useId();
  return <TabsContext.Provider value={{ value, onValueChange, baseId }}><div className={className}>{children}</div></TabsContext.Provider>;
}

export function TabsList({ className, onKeyDown, ...props }: HTMLAttributes<HTMLDivElement>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
    if (!tabs.length) return;
    const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (currentIndex + 1) % tabs.length : (currentIndex - 1 + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[targetIndex].focus();
    tabs[targetIndex].click();
  };
  return <div role="tablist" className={clsx('inline-flex rounded-token-md border border-default bg-surface-sunken p-1', className)} onKeyDown={handleKeyDown} {...props} />;
}

export type TabsTriggerProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> & { value: string };
export function TabsTrigger({ value, className, children, ...props }: TabsTriggerProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used inside Tabs.');
  const active = context.value === value;
  return <button type="button" role="tab" id={`${context.baseId}-tab-${value}`} aria-controls={`${context.baseId}-panel-${value}`} aria-selected={active} tabIndex={active ? 0 : -1} className={clsx('rounded-token-sm px-3 py-2 text-label transition focus-visible:ring-2 focus-visible:ring-focus-ring', active ? 'bg-surface text-default shadow-token-xs' : 'text-muted hover:text-default', className)} onClick={() => context.onValueChange(value)} {...props}>{children}</button>;
}

export type TabsContentProps = HTMLAttributes<HTMLDivElement> & { value: string };
export function TabsContent({ value, className, ...props }: TabsContentProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used inside Tabs.');
  if (context.value !== value) return null;
  return <div role="tabpanel" id={`${context.baseId}-panel-${value}`} aria-labelledby={`${context.baseId}-tab-${value}`} tabIndex={0} className={clsx('mt-4 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring', className)} {...props} />;
}
