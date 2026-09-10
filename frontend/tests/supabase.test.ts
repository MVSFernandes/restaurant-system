import { afterEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn(() => ({ channel: vi.fn() })));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  createClient.mockClear();
});

describe('optional Realtime configuration', () => {
  it('disables Realtime without frontend credentials', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect((await import('../src/lib/supabase')).supabase).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('uses only the public key and does not create an auth session', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
    expect((await import('../src/lib/supabase')).supabase).not.toBeNull();
    expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'public-test-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });

  it('does not crash the application for an invalid URL', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'invalid');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
    createClient.mockImplementationOnce(() => { throw new Error('Invalid URL'); });
    expect((await import('../src/lib/supabase')).supabase).toBeNull();
  });
});
