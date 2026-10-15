import { screen } from '@testing-library/react';
import { SetPasswordScreen } from './SetPasswordScreen';
import { renderWithApp } from '../../test/utils';

// The component reads window.location directly (matching Supabase's own detectSessionInUrl), so the
// error_code has to be set on the real URL, not just the MemoryRouter's in-memory route.
function setWindowUrl(hashOrSearch: string) {
  window.history.replaceState(null, '', `/set-password${hashOrSearch}`);
}

describe('SetPasswordScreen (F8, SC-52)', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('shows the invalid-link state and never the form when the URL carries an error_code (fragment)', async () => {
    setWindowUrl('#error=access_denied&error_code=otp_expired&error_description=Link+expired');
    renderWithApp(<SetPasswordScreen />, { route: '/set-password' });
    expect(await screen.findByText('This link has expired or was already used.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('shows the invalid-link state for an error in the query string too', async () => {
    setWindowUrl('?error=access_denied&error_code=otp_expired');
    renderWithApp(<SetPasswordScreen />, { route: '/set-password' });
    expect(await screen.findByText('This link has expired or was already used.')).toBeInTheDocument();
  });
});
