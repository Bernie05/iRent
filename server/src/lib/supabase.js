import { createClient } from '@supabase/supabase-js';
import { getConfig } from '../config.js';

/**
 * Options for every server-side Supabase client. Node 24 has a global `WebSocket`, so
 * supabase-js's realtime transport needs no explicit implementation. The server never
 * subscribes to realtime.
 */
export const SERVER_CLIENT_OPTIONS = Object.freeze({
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/**
 * Service-role Supabase client. SERVER ONLY: it bypasses RLS.
 * Never expose this key or this client to the browser (NFR1).
 */
let adminClient;
export function getSupabaseAdmin() {
  if (!adminClient) {
    const cfg = getConfig();
    adminClient = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, SERVER_CLIENT_OPTIONS);
  }
  return adminClient;
}

/** Test helper: replace the client (e.g. with a mock). Pass undefined to reset. */
export function setSupabaseAdmin(client) {
  adminClient = client;
}
