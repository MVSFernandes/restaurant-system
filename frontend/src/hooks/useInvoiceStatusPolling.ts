import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';
import type { Customer, Invoice } from '../types';

const MAX_POLL_DURATION_MS = 120_000;
const POLLING_STATUSES = new Set(['pending', 'processing']);

const pollDelay = (completedAttempts: number) => {
  if (completedAttempts < 4) return 3_000;
  if (completedAttempts < 8) return 5_000;
  return 10_000;
};

export interface InvoicePollingState {
  pollingIds: ReadonlySet<string>;
  timedOutIds: ReadonlySet<string>;
  failedIds: ReadonlySet<string>;
}

interface InvoicePollingOptions {
  enabled?: boolean;
}

const withoutId = (current: Set<string>, id: string) => {
  if (!current.has(id)) return current;
  const next = new Set(current);
  next.delete(id);
  return next;
};

export function useInvoicePolling(
  invoices: Array<Invoice | null | undefined>,
  onInvoiceUpdate: (invoice: Invoice) => void,
  options: InvoicePollingOptions = {},
): InvoicePollingState {
  const enabled = options.enabled ?? true;
  const pendingKey = useMemo(() => {
    const ids = new Set<string>();
    for (const invoice of invoices) {
      if (invoice && POLLING_STATUSES.has(invoice.status)) ids.add(invoice.id);
    }
    return [...ids].sort().join(',');
  }, [invoices]);
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
  const [timedOutIds, setTimedOutIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const onInvoiceUpdateRef = useRef(onInvoiceUpdate);

  useEffect(() => {
    onInvoiceUpdateRef.current = onInvoiceUpdate;
  }, [onInvoiceUpdate]);

  useEffect(() => {
    const ids = enabled && pendingKey ? pendingKey.split(',') : [];
    if (ids.length === 0) {
      setPollingIds(new Set());
      setTimedOutIds(new Set());
      setFailedIds(new Set());
      return;
    }

    let active = true;
    const startedAt = Date.now();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const controllers = new Map<string, AbortController>();
    let requestQueue = Promise.resolve();

    setPollingIds(new Set(ids));
    setTimedOutIds(new Set());
    setFailedIds(new Set());

    const finish = (id: string, result: 'complete' | 'timeout' | 'failed') => {
      setPollingIds((current) => withoutId(current, id));
      if (result === 'timeout') setTimedOutIds((current) => new Set(current).add(id));
      if (result === 'failed') setFailedIds((current) => new Set(current).add(id));
    };

    const schedule = (id: string, completedAttempts: number) => {
      const elapsed = Date.now() - startedAt;
      const remaining = MAX_POLL_DURATION_MS - elapsed;
      if (!active || remaining <= 0) {
        if (active) finish(id, 'timeout');
        return;
      }

      const delay = pollDelay(completedAttempts);
      if (delay >= remaining) {
        timers.set(id, setTimeout(() => {
          if (active) finish(id, 'timeout');
        }, remaining));
        return;
      }

      timers.set(id, setTimeout(() => {
        requestQueue = requestQueue.then(async () => {
          if (!active) return;
          const controller = new AbortController();
          controllers.set(id, controller);
          try {
            const { data } = await api.get<Invoice>('/invoices/' + id, {
              signal: controller.signal,
            });
            if (!active) return;
            onInvoiceUpdateRef.current(data);
            if (POLLING_STATUSES.has(data.status)) schedule(id, completedAttempts + 1);
            else finish(id, 'complete');
          } catch {
            if (active && !controller.signal.aborted) finish(id, 'failed');
          } finally {
            controllers.delete(id);
          }
        });
      }, delay));
    };

    for (const id of ids) schedule(id, 0);

    return () => {
      active = false;
      for (const timer of timers.values()) clearTimeout(timer);
      for (const controller of controllers.values()) controller.abort();
    };
  }, [enabled, pendingKey]);

  return { pollingIds, timedOutIds, failedIds };
}

export function useInvoiceStatusPolling(
  customers: Customer[],
  onInvoiceUpdate: (invoice: Invoice) => void,
  options: InvoicePollingOptions = {},
): InvoicePollingState {
  const invoices = useMemo(() => {
    const result: Invoice[] = [];
    for (const customer of customers) {
      const rows = [...(customer.openRows ?? []), ...(customer.paidRows ?? [])];
      for (const row of rows) {
        if (row.invoice) result.push(row.invoice);
      }
    }
    return result;
  }, [customers]);

  return useInvoicePolling(invoices, onInvoiceUpdate, options);
}
