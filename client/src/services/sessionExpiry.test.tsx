import { screen } from '@testing-library/react';
import { makeStore } from '../app/store';
import { registerNavigator, SESSION_EXPIRED_PATH } from '../app/navigation';
import { getSupabase } from '../lib/supabase';
import { mockControl } from '../mocks/control';
import { MOCK_PASSWORD } from '../mocks/fixtures';
import { renterApi } from './endpoints/renter';
import { LoginScreen } from '../features/auth/LoginScreen';
import { renderWithApp } from '../test/utils';

async function signInAsAna() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'ana@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

describe('session expiry through the real API layer (R14, SC-12)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
  });

  it('refreshes an expired access token once and the request succeeds', async () => {
    await signInAsAna();
    const navigate = vi.fn();
    const unregister = registerNavigator(navigate);
    const store = makeStore();

    mockControl.expireSessions(); // the access token is now rejected; the refresh token still works
    const result = await store.dispatch(renterApi.endpoints.getMyBalance.initiate());

    expect(result.data).toMatchObject({ status: 'paid', credit_balance: 500 });
    expect(navigate).not.toHaveBeenCalled();
    unregister();
  });

  it('when the refresh also fails: logs out, clears the cache and goes to /login with the reason', async () => {
    await signInAsAna();
    const navigate = vi.fn();
    const unregister = registerNavigator(navigate);
    const store = makeStore();

    // Something is cached first, so we can see the cache being cleared.
    await store.dispatch(renterApi.endpoints.getMyCredit.initiate());
    expect(Object.keys(store.getState().api.queries)).not.toHaveLength(0);

    mockControl.expireSessions();
    mockControl.revokeRefresh();
    // The in-flight result is dropped by resetApiState; what matters is what the user sees next.
    await store.dispatch(renterApi.endpoints.getMyBalance.initiate(undefined, { forceRefetch: true }));

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(SESSION_EXPIRED_PATH, { replace: true });
    expect(store.getState().auth).toMatchObject({ status: 'unauthenticated', sessionExpired: true, profile: null });
    expect(Object.values(store.getState().api.queries).filter((q) => q?.status === 'fulfilled')).toHaveLength(0);
    unregister();
  });

  it('the login page shows the session-expired message', () => {
    renderWithApp(<LoginScreen />, { route: '/login?reason=session_expired' });
    expect(screen.getByRole('alert')).toHaveTextContent('Your session has expired. Please log in again.');
  });
});
