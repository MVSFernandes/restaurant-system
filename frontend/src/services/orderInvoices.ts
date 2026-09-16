import api from './api';
import type { Invoice } from '../types';

// Coalesce row mounts (including StrictMode) into bounded, sequential batch reads.
const pending = new Map<string, { promise: Promise<Invoice | null>; resolve: (invoice: Invoice | null) => void; reject: (error: unknown) => void }>();
let running = false;
async function flush() {
  try {
    while (pending.size) {
      const entries = [...pending.entries()].slice(0, 100);
      try {
        const { data } = await api.get<Invoice[]>('/invoices/orders', { params: { ids: entries.map(([id]) => id).join(',') } });
        for (const [id, entry] of entries) entry.resolve(data.find(invoice => invoice.orderId === id) ?? null);
      } catch (error) { for (const [, entry] of entries) entry.reject(error); }
      finally { for (const [id] of entries) pending.delete(id); }
    }
  } finally { running = false; }
}
export function loadOrderInvoice(orderId: string): Promise<Invoice | null> {
  const existing = pending.get(orderId);
  if (existing) return existing.promise;
  let resolve!: (invoice: Invoice | null) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Invoice | null>((yes, no) => { resolve = yes; reject = no; });
  pending.set(orderId, { promise, resolve, reject });
  if (!running) { running = true; queueMicrotask(() => { void flush(); }); }
  return promise;
}
