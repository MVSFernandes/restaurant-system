import { useEffect, useMemo, useRef } from 'react';
import api from '../services/api';
import type { Customer, Invoice } from '../types';

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 12;
const POLLING_STATUSES = new Set(['pending', 'processing']);

function getPendingInvoiceIds(customers: Customer[]): string[] {
  const ids = new Set<string>();
  for (const customer of customers) {
    const rows = [...(customer.openRows ?? []), ...(customer.paidRows ?? [])];
    for (const row of rows) {
      if (row.invoice && POLLING_STATUSES.has(row.invoice.status)) ids.add(row.invoice.id);
    }
  }
  return [...ids].sort();
}

export function useInvoiceStatusPolling(
  customers: Customer[],
  onInvoiceUpdate: (invoice: Invoice) => void,
) {
  const pendingIds = useMemo(() => getPendingInvoiceIds(customers), [customers]);
  const pendingKey = pendingIds.join(',');
  const attemptsRef = useRef(new Map<string, number>());

  useEffect(() => {
    const ids = pendingKey ? pendingKey.split(',') : [];
    const activeIds = new Set(ids);
    for (const id of attemptsRef.current.keys()) {
      if (!activeIds.has(id)) attemptsRef.current.delete(id);
    }
    for (const id of ids) {
      if (!attemptsRef.current.has(id)) attemptsRef.current.set(id, 0);
    }
    if (ids.length === 0) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const eligibleIds = ids.filter(
        (id) => (attemptsRef.current.get(id) ?? 0) < MAX_POLL_ATTEMPTS,
      );
      if (!active || eligibleIds.length === 0) return;

      await Promise.allSettled(
        eligibleIds.map(async (id) => {
          attemptsRef.current.set(id, (attemptsRef.current.get(id) ?? 0) + 1);
          const { data } = await api.get<Invoice>('/invoices/' + id);
          if (active) onInvoiceUpdate(data);
        }),
      );

      if (
        active &&
        ids.some((id) => (attemptsRef.current.get(id) ?? 0) < MAX_POLL_ATTEMPTS)
      ) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pendingKey, onInvoiceUpdate]);
}
