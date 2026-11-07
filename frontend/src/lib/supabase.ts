import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getRuntimeConfig } from '../config/runtimeConfig';

const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();

// Realtime only. Application data still comes from the authenticated API.
export const supabase: SupabaseClient | null = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
