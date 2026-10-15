import { screen, waitFor } from '@testing-library/react';
import { AppBootstrap } from './AppBootstrap';
import { getSupabase } from '../lib/supabase';
import { startAuthListener } from '../features/auth/authListener';
import { mockControl } from '../mocks/control';
import { MOCK_PASSWORD } from '../mocks/fixtures';
import { renderWithApp } from '../test/utils';

async function signInAsAna() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'ana@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

describe('AppBootstrap (F5)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
  });

  it('loads /me once a session exists and renders children', async () => {
    await signInAsAna();
    const { store } = renderWithApp(
      <AppBootstrap>
        <div>App content</div>
      </AppBootstrap>,
    );
    const unsubscribe = startAuthListener(getSupabase(), store.dispatch);
    await waitFor(() => expect(screen.getByText('App content')).toBeInTheDocument());
    unsubscribe();
  });

  it('renders children immediately when signed out', () => {
    renderWithApp(
      <AppBootstrap>
        <div>App content</div>
      </AppBootstrap>,
      { preloadedState: { auth: { status: 'unauthenticated', session: null, profile: null, sessionExpired: false } } },
    );
    expect(screen.getByText('App content')).toBeInTheDocument();
  });

  it('signs out and shows the disabled-account message on a 403 from GET /me (D-15c)', async () => {
    await signInAsAna();
    mockControl.failNext('GET', '/me', 403, 'FORBIDDEN');
    const { store } = renderWithApp(
      <AppBootstrap>
        <div>App content</div>
      </AppBootstrap>,
    );
    const unsubscribe = startAuthListener(getSupabase(), store.dispatch);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This account is disabled. Please contact the owner.'));
    expect(screen.queryByText('App content')).not.toBeInTheDocument();
    unsubscribe();
  });
});
