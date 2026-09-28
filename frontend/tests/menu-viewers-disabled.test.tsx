import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({ supabase: null }));

import { useMenuViewers } from '../src/hooks/useMenuViewers';

describe('menu presence without Realtime configured', () => {
  it('reports the badge as unavailable instead of a zero count', () => {
    const { result } = renderHook(() => useMenuViewers());
    expect(result.current).toEqual({ available: false, count: null });
  });
});
