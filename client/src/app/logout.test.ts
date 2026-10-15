import { makeStore } from './store';
import { registerNavigator } from './navigation';
import { getSupabase } from '../lib/supabase';
import { mockControl } from '../mocks/control';
import { MOCK_PASSWORD } from '../mocks/fixtures';
import { renterApi } from '../services/endpoints/renter';
import { logout } from './logout';

describe('logout (F5, R13)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('clears the cache, signs out, and navigates to /login', async () => {
    const { error } = await getSupabase().auth.signInWithPassword({ email: 'ana@irent.test', password: MOCK_PASSWORD });
    expect(error).toBeNull();

    const store = makeStore();
    await store.dispatch(renterApi.endpoints.getMyBalance.initiate());
    expect(Object.keys(store.getState().api.queries)).not.toHaveLength(0);

    const navigate = vi.fn();
    const unregister = registerNavigator(navigate);
    await logout(store.dispatch);

    expect(store.getState().auth).toMatchObject({ status: 'unauthenticated', session: null, profile: null });
    expect(Object.values(store.getState().api.queries).filter((q) => q?.status === 'fulfilled')).toHaveLength(0);
    expect(navigate).toHaveBeenCalledWith('/login', undefined);
    unregister();
  });
});
