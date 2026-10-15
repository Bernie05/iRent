import { getSupabase } from '../lib/supabase';
import { api } from '../services/api';
import { loggedOut } from '../features/auth/authSlice';
import { navigateTo } from './navigation';
import type { AppDispatch } from './store';

/** R13: sign out, clear every cached response, go to /login. Used by both shells' Log out action. */
export async function logout(dispatch: AppDispatch): Promise<void> {
  await getSupabase().auth.signOut().catch(() => undefined);
  dispatch(loggedOut());
  dispatch(api.util.resetApiState());
  navigateTo('/login');
}
