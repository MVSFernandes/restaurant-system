import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
it('backs off reads, leaves other resources usable and recovers automatically', async () => {
  const { default: api } = await import('../src/services/api');
  const { getRateLimitNotice } = await import('../src/services/rateLimit');
  let invoiceCalls = 0;
  api.defaults.adapter = async config => {
    if (config.url?.startsWith('/invoices') && ++invoiceCalls === 1) {
      throw new AxiosError('limited', undefined, config, undefined, { status: 429, statusText: '', data: '', headers: { 'retry-after': '2', 'x-ratelimit-scope': 'invoices:read' }, config });
    }
    return { status: 200, statusText: 'OK', data: { ok: true }, headers: {}, config };
  };
  const pending = api.get('/invoices/test');
  await tick();
  expect(invoiceCalls).toBe(1);
  expect(getRateLimitNotice()).toBeGreaterThan(Date.now());
  expect((await api.get('/tables')).status).toBe(200);
  await vi.advanceTimersByTimeAsync(1999);
  expect(invoiceCalls).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect((await pending).status).toBe(200);
  expect(invoiceCalls).toBe(2);
  expect(getRateLimitNotice()).toBe(0);
});
it('never replays payments automatically and rejects repeated clicks locally during cooldown', async () => {
  const { default: api } = await import('../src/services/api');
  let calls = 0;
  api.defaults.adapter = async config => {
    calls++;
    throw new AxiosError('limited', undefined, config, undefined, { status: 429, statusText: '', data: {}, headers: { 'retry-after': '2', 'x-ratelimit-scope': 'orders:write' }, config });
  };
  await expect(api.post('/orders/a/payment', { method: 'PIX' })).rejects.toMatchObject({ message: 'Muitas requisições, aguarde alguns instantes' });
  await expect(api.post('/orders/a/payment', { method: 'PIX' })).rejects.toMatchObject({ code: 'LOCAL_RATE_LIMIT' });
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(calls).toBe(1);
});
it('paces queued reads after the cooldown instead of releasing a new burst', async () => {
  const { default: api } = await import('../src/services/api');
  const { recordRateLimit } = await import('../src/services/rateLimit');
  recordRateLimit('invoices:read', '1');
  const adapter = vi.fn(async config => ({ status: 200, statusText: 'OK', data: {}, headers: {}, config }));
  api.defaults.adapter = adapter;
  const requests = [api.get('/invoices/a'), api.get('/invoices/b'), api.get('/invoices/c')];
  await tick();
  expect(adapter).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(adapter).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(500);
  await Promise.all(requests);
  expect(adapter).toHaveBeenCalledTimes(3);
});
