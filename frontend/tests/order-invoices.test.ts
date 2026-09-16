import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: mocks }));
import { loadOrderInvoice } from '../src/services/orderInvoices';
it('coalesces 250 row reads into three sequential batches and deduplicates repeated mounts', async () => {
  let active = 0;
  let maxActive = 0;
  mocks.get.mockImplementation(async () => { active++; maxActive = Math.max(active, maxActive); await Promise.resolve(); active--; return { data: [] }; });
  const requests = Array.from({ length: 250 }, (_, index) => loadOrderInvoice('order-' + index));
  expect(loadOrderInvoice('order-0')).toBe(requests[0]);
  await Promise.all(requests);
  expect(mocks.get).toHaveBeenCalledTimes(3);
  expect(maxActive).toBe(1);
  expect(mocks.get.mock.calls[0][1].params.ids.split(',')).toHaveLength(100);
});
