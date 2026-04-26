import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Fail loudly at startup rather than 404'ing on the first request.
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (local) or Netlify (deployed).'
  );
}

/**
 * Typed Supabase client. The single instance for the entire app — this is the
 * only place `createClient` should be called.
 *
 * - `auth.persistSession` keeps the user signed in across reloads (M1 acceptance).
 * - `auth.detectSessionInUrl` handles email-link callbacks once we wire those up
 *   in M7 (invitation acceptance).
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'waymarks-auth',
  },
});
