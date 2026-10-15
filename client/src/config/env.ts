/**
 * Typed access to the public build-time config (NFR10). Every value here ends up in the browser bundle,
 * so only public values belong here: the API URL, the Supabase URL and ANON key, and the contact phone.
 */
const raw = import.meta.env;

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export const env = {
  /** Express API base, e.g. `http://localhost:4000/api` or `/api` behind a proxy. */
  apiUrl: stripTrailingSlash(raw.VITE_API_URL || '/api'),
  supabaseUrl: stripTrailingSlash(raw.VITE_SUPABASE_URL || 'http://localhost:54321'),
  /** Public anon key. The service-role key must never be used in the client (NFR1). */
  supabaseAnonKey: raw.VITE_SUPABASE_ANON_KEY || 'missing-anon-key',
  /** R7: placeholder until Bernie supplies the real number. */
  contactPhone: raw.VITE_CONTACT_PHONE || '+63 917 000 0000',
  useMocks: raw.VITE_USE_MOCKS === 'true',
  isTest: raw.MODE === 'test',
} as const;

/** `tel:` href for a display phone number ("+63 917 000 0000" → "tel:+639170000000"). */
export function telHref(phone: string = env.contactPhone): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
