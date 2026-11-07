import { vi } from 'vitest';

// In the application, main.tsx loads the configuration before importing the
// clients. Tests import those modules directly, so they get a fixed value here.
// tests/runtime-config.test.ts unmocks this module to test the real one.
vi.mock('../src/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({
    apiUrl: 'http://localhost:3001/api',
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'public-test-key',
  }),
}));
