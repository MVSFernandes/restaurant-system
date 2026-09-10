import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: { channel: vi.fn(), removeChannel: vi.fn() },
  get: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => ({ supabase: mocks.client }));
vi.mock('../src/services/api', () => ({ default: { get: mocks.get } }));

import { openRealtimeChannel } from '../src/lib/realtime';
import { useMenuViewers } from '../src/hooks/useMenuViewers';
import { useStockEvents } from '../src/hooks/useStockEvents';
import StockItemsPage from '../src/pages/finance/StockItemsPage';

function makeChannel() {
  const handlers = new Map<string, () => void>();
  let status: (value: string) => void = () => {};
  let state: Record<string, Array<Record<string, string>>> = {};
  const channel = {
    on: vi.fn((type: string, filter: { event: string }, callback: () => void) => {
      handlers.set(type + ':' + filter.event, callback);
      return channel;
    }),
    subscribe: vi.fn((callback: typeof status) => {
      status = callback;
      return channel;
    }),
    track: vi.fn().mockResolvedValue('ok'),
    presenceState: () => state,
    emit: (type: string, event: string) => handlers.get(type + ':' + event)?.(),
    setStatus: (value: string) => status(value),
    setState: (value: typeof state) => { state = value; },
  };
  return channel;
}

let channel: ReturnType<typeof makeChannel>;
const flush = async () => { await act(async () => {}); };

beforeEach(() => {
  channel = makeChannel();
  mocks.client.channel.mockReturnValue(channel);
  mocks.client.removeChannel.mockResolvedValue('ok');
});

afterEach(async () => {
  cleanup();
  await flush();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('menu presence', () => {
  it('counts unique tracked viewers after initial sync, join and leave, without counting the dashboard', async () => {
    const { result } = renderHook(() => useMenuViewers());
    expect(result.current).toBe(0);
    await flush();
    act(() => channel.setStatus('SUBSCRIBED'));
    expect(channel.track).not.toHaveBeenCalled();

    act(() => {
      channel.setState({
        a: [{ viewer_id: 'a' }, { viewer_id: 'a' }],
        b: [{ viewer_id: 'b' }],
        c: [{ viewer_id: 'c' }],
        observer: [{}],
      });
      channel.emit('presence', 'sync');
    });
    expect(result.current).toBe(3);
    act(() => {
      channel.setState({ a: [{ viewer_id: 'a' }] });
      channel.emit('presence', 'leave');
    });
    expect(result.current).toBe(1);
    act(() => {
      channel.setState({ a: [{ viewer_id: 'a' }], b: [{ viewer_id: 'b' }] });
      channel.emit('presence', 'join');
    });
    expect(result.current).toBe(2);
    act(() => channel.setStatus('CHANNEL_ERROR'));
    expect(result.current).toBe(0);
    act(() => { channel.setStatus('SUBSCRIBED'); channel.emit('presence', 'sync'); });
    expect(result.current).toBe(2);
  });

  it('tracks once under StrictMode, retracks on reconnect and sends no personal data', async () => {
    const { unmount } = renderHook(() => useMenuViewers(true), { wrapper: StrictMode });
    await flush();
    expect(mocks.client.channel).toHaveBeenCalledTimes(1);
    act(() => channel.setStatus('SUBSCRIBED'));
    expect(channel.track).toHaveBeenCalledTimes(1);
    const payload = channel.track.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['joined_at', 'viewer_id']);
    expect(payload.viewer_id).toBeTruthy();

    act(() => { channel.setStatus('TIMED_OUT'); channel.setStatus('SUBSCRIBED'); });
    expect(channel.track).toHaveBeenCalledTimes(2);
    expect(channel.track.mock.calls[1][0]).toEqual(payload);
    unmount();
    await flush();
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(channel);
    act(() => channel.setStatus('SUBSCRIBED'));
    expect(channel.track).toHaveBeenCalledTimes(2);
  });

  it('creates a new anonymous identity on a fresh menu mount', async () => {
    const first = renderHook(() => useMenuViewers(true));
    await flush();
    act(() => channel.setStatus('SUBSCRIBED'));
    const firstId = channel.track.mock.calls[0][0].viewer_id;
    first.unmount();
    await flush();
    channel = makeChannel();
    mocks.client.channel.mockReturnValue(channel);
    renderHook(() => useMenuViewers(true));
    await flush();
    act(() => channel.setStatus('SUBSCRIBED'));
    expect(channel.track.mock.calls[0][0].viewer_id).not.toBe(firstId);
  });

  it('waits for asynchronous channel removal before remounting the same topic', async () => {
    let finishRemoval!: () => void;
    mocks.client.removeChannel.mockImplementationOnce(() => new Promise<void>((resolve) => { finishRemoval = resolve; }));
    const first = renderHook(() => useMenuViewers(true));
    await flush();
    first.unmount();
    const second = renderHook(() => useMenuViewers());
    await flush();
    expect(mocks.client.channel).toHaveBeenCalledTimes(1);
    await act(async () => finishRemoval());
    expect(mocks.client.channel).toHaveBeenCalledTimes(2);
    second.unmount();
  });

  it('remains neutral when connecting or tracking fails', async () => {
    mocks.client.channel.mockImplementationOnce(() => { throw new Error('offline'); });
    const first = renderHook(() => useMenuViewers());
    await flush();
    expect(first.result.current).toBe(0);
    first.unmount();
    await flush();
    channel.track.mockRejectedValueOnce(new Error('offline'));
    renderHook(() => useMenuViewers(true));
    await flush();
    await act(async () => channel.setStatus('SUBSCRIBED'));
  });

  it('does not create a channel for an already disposed page', async () => {
    const subscribe = vi.fn();
    const close = openRealtimeChannel('disposed', { config: {} }, subscribe);
    close();
    await flush();
    expect(subscribe).not.toHaveBeenCalled();
  });
});

describe('stock broadcasts', () => {
  it('coalesces both events, recovers missed changes on reconnect and cancels after unmount', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const { unmount } = renderHook(() => useStockEvents(refresh));
    await flush();
    act(() => {
      channel.setStatus('SUBSCRIBED');
      channel.emit('broadcast', 'stock_updated');
      channel.emit('broadcast', 'stock_low');
      vi.advanceTimersByTime(150);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => { channel.setStatus('SUBSCRIBED'); vi.advanceTimersByTime(150); });
    expect(refresh).toHaveBeenCalledTimes(2);
    act(() => channel.emit('broadcast', 'stock_low'));
    unmount();
    await flush();
    act(() => vi.advanceTimersByTime(150));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('refreshes quantities and critical alerts using the authenticated API for either event', async () => {
    vi.useFakeTimers();
    let items = [{ id: 'rice', name: 'Arroz', quantity: 20, minQuantity: 10, unit: 'kg' }];
    mocks.get.mockImplementation(async (path: string) => ({
      data: path === '/stock/low' ? items.filter((item) => item.quantity <= item.minQuantity) : items,
    }));
    render(<StockItemsPage />);
    await flush();
    expect(screen.queryByText('Itens em nível crítico')).toBeNull();

    items = [{ ...items[0], quantity: 2 }];
    await act(async () => { channel.emit('broadcast', 'stock_low'); vi.advanceTimersByTime(150); });
    expect(screen.getByText('Itens em nível crítico')).toBeTruthy();
    expect(screen.getByText('Arroz (2 kg)')).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledWith('/stock/low');

    items = [{ ...items[0], quantity: 30 }];
    await act(async () => { channel.emit('broadcast', 'stock_updated'); vi.advanceTimersByTime(150); });
    expect(screen.queryByText('Itens em nível crítico')).toBeNull();

    // Manual refresh remains usable even if Realtime never connects.
    items = [{ ...items[0], quantity: 1 }];
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await flush();
    expect(screen.getByText('Arroz (1 kg)')).toBeTruthy();
  });
});
