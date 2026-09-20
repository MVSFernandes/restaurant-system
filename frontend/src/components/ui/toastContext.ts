import { createContext } from 'react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

export type ToastProps = ToastOptions & {
  id: string;
  onDismiss: (id: string) => void;
};

export type ToastContextValue = {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);