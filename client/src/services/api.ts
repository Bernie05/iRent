import { createApi } from '@reduxjs/toolkit/query/react';
import { env } from '../config/env';
import { getSupabase, supabaseAuthBridge } from '../lib/supabase';
import { navigateTo, SESSION_EXPIRED_PATH } from '../app/navigation';
import { sessionExpired } from '../features/auth/authSlice';
import { createBaseQueryWithReauth } from './baseQuery';

/** One tag per resource. Screens invalidate these after mutations so no list goes stale. */
export const TAG_TYPES = [
  'Me',
  'AvailableBeds',
  'Beds',
  'Dashboard',
  'Inquiries',
  'Renters',
  'Tenancies',
  'Credit',
  'Charges',
  'RentCharges',
  'Bills',
  'Balance',
  'Payments',
  'PaymentAccounts',
  'Announcements',
  'Settings',
  'Expenses',
  'Promotions',
  'Schedule',
  'Greeting',
  'Maintenance',
] as const;
export type TagType = (typeof TAG_TYPES)[number];

export const baseQuery = createBaseQueryWithReauth({
  baseUrl: env.apiUrl,
  auth: supabaseAuthBridge,
  onSessionExpired: ({ dispatch }) => {
    // R14 / SC-12: log out, clear every cached response, then show the login page with the message.
    void getSupabase().auth.signOut({ scope: 'local' }).catch(() => undefined);
    dispatch(sessionExpired());
    dispatch(api.util.resetApiState());
    navigateTo(SESSION_EXPIRED_PATH, { replace: true });
  },
});

/**
 * The single RTK Query API. Endpoints are injected per area in ./endpoints/*.
 * Import hooks from './endpoints' (or the area module), never call fetch from components.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: TAG_TYPES,
  endpoints: () => ({}),
});
