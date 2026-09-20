import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { clsx } from 'clsx';
import { ToastContext, type ToastOptions, type ToastProps, type ToastVariant } from './toastContext';

const variantStyles: Record<ToastVariant, { icon: typeof CheckCircle2; className: string }> = {
  success: { icon: CheckCircle2, className: 'border-success/30 bg-success-subtle text-success' },
  error: { icon: AlertCircle, className: 'border-danger/30 bg-danger-subtle text-danger' },
  warning: { icon: AlertTriangle, className: 'border-warning/30 bg-warning-subtle text-warning' },
  info: { icon: Info, className: 'border-info/30 bg-info-subtle text-info' },
};

export function Toast({ id, title, description, variant = 'info', duration = 4000, onDismiss }: ToastProps) {
  const remainingRef = useRef(Math.max(0, duration));
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissRef = useRef(onDismiss);
  const style = variantStyles[variant];
  const Icon = style.icon;

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    if (remainingRef.current === 0) return;
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => dismissRef.current(id), remainingRef.current);
  }, [clearTimer, id]);

  useEffect(() => {
    remainingRef.current = Math.max(0, duration);
    startTimer();
    return clearTimer;
  }, [clearTimer, duration, startTimer]);

  const pause = () => {
    if (!timerRef.current) return;
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
    clearTimer();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={pause}
      onMouseLeave={startTimer}
      className={clsx('pointer-events-auto flex w-full items-start gap-3 rounded-token-lg border p-4 shadow-token-md', style.className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={20} />
      <div className="min-w-0 flex-1">
        <p className="text-label font-semibold text-default">{title}</p>
        {description && <p className="mt-1 text-caption text-muted">{description}</p>}
      </div>
      <button
        type="button"
        aria-label="Fechar notificação"
        onClick={() => onDismiss(id)}
        className="shrink-0 rounded-token-sm p-1 text-muted transition-colors hover:bg-black/5 hover:text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring dark:hover:bg-white/10"
      >
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Array<ToastOptions & { id: string }>>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = `toast-${++nextId.current}`;
    setToasts((current) => [...current, { variant: 'info', duration: 4000, ...options, id }]);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3" aria-label="Notificações">
          {toasts.map((item) => <Toast key={item.id} {...item} onDismiss={dismiss} />)}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

