import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function createRealtimeClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;

  try {
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  } catch {
    // Realtime is optional; invalid configuration must not break the app.
    return null;
  }
}

// Realtime only. Application data still comes from the authenticated API.
export const supabase = createRealtimeClient();
