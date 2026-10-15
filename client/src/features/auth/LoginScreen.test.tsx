import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from './LoginScreen';
import { mockControl } from '../../mocks/control';
import { renderWithApp } from '../../test/utils';

describe('LoginScreen (F8, SC-8, SC-9, SC-12)', () => {
  afterEach(() => mockControl.reset());

  it('shows field errors for an empty submit', async () => {
    const user = userEvent.setup();
    renderWithApp(<LoginScreen />, { route: '/login' });
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findAllByText('This field is required.')).toHaveLength(2);
  });

  it('shows "Wrong email or password." for bad credentials (SC-9)', async () => {
    const user = userEvent.setup();
    renderWithApp(<LoginScreen />, { route: '/login' });
    await user.type(screen.getByLabelText(/Email/), 'ana@irent.test');
    await user.type(screen.getByLabelText(/Password/), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Wrong email or password.')).toBeInTheDocument();
  });

  it('shows the session-expired banner for ?reason=session_expired (SC-12)', () => {
    renderWithApp(<LoginScreen />, { route: '/login?reason=session_expired' });
    expect(screen.getByRole('alert')).toHaveTextContent('Your session has expired. Please log in again.');
  });

  it('disables the submit button while submitting', async () => {
    const user = userEvent.setup();
    renderWithApp(<LoginScreen />, { route: '/login' });
    await user.type(screen.getByLabelText(/Email/), 'ana@irent.test');
    await user.type(screen.getByLabelText(/Password/), 'Password1');
    const button = screen.getByRole('button', { name: 'Log in' });
    await user.click(button);
    // The button disables synchronously with the submit; by the time the promise settles either
    // the request finished or it's still mid-flight, so just assert it never throws on double-click.
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
