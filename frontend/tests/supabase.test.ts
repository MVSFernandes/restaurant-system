import { afterEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn(() => ({ channel: vi.fn() })));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

afterEach(() => {
  vi.resetModules();
  createClient.mockClear();
});

describe('Realtime client', () => {
  it('uses only the public key and does not create an auth session', async () => {
    expect((await import('../src/lib/supabase')).supabase).not.toBeNull();
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'public-test-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });
});
