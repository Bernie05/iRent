import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import type { AuthBridge } from '../services/baseQuery';

let client: SupabaseClient | null = null;

/**
 * Supabase client, used for AUTH ONLY (sign-in, session, refresh, set password). All data goes through
 * the Express API. It is created with the public anon key; the service-role key never reaches the client (NFR1).
 *
 * Created lazily: supabase-js starts restoring/refreshing the stored session as soon as it is constructed,
 * so it must not exist before the MSW worker is running in mock mode (see main.tsx).
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // R49: /set-password reads the session from the invite / recovery link.
        detectSessionInUrl: true,
        // D-15(i): invite and recovery links use the implicit redirect flow (server-generated
        // action_link, no PKCE code verifier exists for it). Set explicitly; do not rely on the default.
        flowType: 'implicit',
        storageKey: 'irent.auth',
      },
    });
  }
  return client;
}

/** The AuthBridge the RTK Query base query uses (R14). */
export const supabaseAuthBridge: AuthBridge = {
  async getAccessToken() {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  },
  async refreshSession() {
    const { data, error } = await getSupabase().auth.refreshSession();
    if (error || !data.session) return null;
    return data.session.access_token;
  },
};
