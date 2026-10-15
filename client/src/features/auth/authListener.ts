import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AppDispatch } from '../../app/store';
import { sessionChanged } from './authSlice';

function toSessionInfo(session: Session | null) {
  return session ? { userId: session.user.id, email: session.user.email ?? null } : null;
}

/**
 * Mirrors the Supabase session into `authSlice`. Loading `/me` and role routing are done by the
 * app shell (F5) and the login screen (F8). Returns an unsubscribe function.
 */
export function startAuthListener(client: SupabaseClient, dispatch: AppDispatch): () => void {
  void client.auth.getSession().then(({ data }) => dispatch(sessionChanged(toSessionInfo(data.session))));
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    dispatch(sessionChanged(toSessionInfo(session)));
  });
  return () => data.subscription.unsubscribe();
}
