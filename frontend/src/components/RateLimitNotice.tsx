import { useSyncExternalStore } from 'react';
import { getRateLimitNotice, subscribeRateLimit, RATE_LIMIT_MESSAGE } from '../services/rateLimit';
export function RateLimitNotice() {
  const until = useSyncExternalStore(subscribeRateLimit, getRateLimitNotice);
  return until ? <div role="status" className="fixed inset-x-4 top-3 z-[100] rounded-lg border border-amber-300 bg-amber-50 p-3 text-center text-sm text-amber-900 shadow">{RATE_LIMIT_MESSAGE}. As consultas serão retomadas automaticamente.</div> : null;
}
