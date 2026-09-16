export const RATE_LIMIT_MESSAGE = 'Muitas requisições, aguarde alguns instantes';
const deadlines = new Map<string, number>();
const nextSlots = new Map<string, number>();
const listeners = new Set<() => void>();
let noticeUntil = 0;
let timer: ReturnType<typeof setTimeout>;
export const subscribeRateLimit = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getRateLimitNotice = () => noticeUntil;
export const requestScope = (url = '', method = 'get') => {
  const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\//, '/');
  return (path.split('/').filter(Boolean)[0]?.split('?')[0] || 'root') + ':' + (['get', 'head'].includes(method.toLowerCase()) ? 'read' : 'write');
};
export function recordRateLimit(scope: string, retryAfter?: string | number, attempt = 0) {
  const seconds = Number(retryAfter);
  const parsed = retryAfter && !Number.isFinite(seconds) ? Date.parse(String(retryAfter)) - Date.now() : seconds * 1000;
  const delay = Math.max(1000, Number.isFinite(parsed) && parsed > 0 ? parsed : Math.min(60_000, 5000 * 2 ** attempt));
  deadlines.set(scope, Math.max(deadlines.get(scope) ?? 0, Date.now() + delay));
  noticeUntil = Math.max(noticeUntil, Date.now() + delay);
  listeners.forEach(listener => listener());
  clearTimeout(timer);
  timer = setTimeout(() => { noticeUntil = 0; listeners.forEach(listener => listener()); }, noticeUntil - Date.now());
}
export const blockedUntil = (scope: string) => Math.max(deadlines.get(scope) ?? 0, deadlines.get('public') ?? 0);
export async function waitForReadBudget(scope: string) {
  if (!deadlines.has(scope) && !deadlines.has('public')) return;
  do {
    const slot = Math.max(Date.now(), blockedUntil(scope), nextSlots.get(scope) ?? 0);
    nextSlots.set(scope, slot + 250);
    if (slot > Date.now()) await new Promise(resolve => setTimeout(resolve, slot - Date.now()));
  } while (blockedUntil(scope) > Date.now());
}
