import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { renderWithApp } from '../../test/utils';

describe('ForgotPasswordScreen (F8, R50)', () => {
  it('shows the same message for a known email', async () => {
    const user = userEvent.setup();
    renderWithApp(<ForgotPasswordScreen />, { route: '/forgot-password' });
    await user.type(screen.getByLabelText(/Email/), 'ana@irent.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('If an account exists for this email, we sent a reset link. Check your inbox.')).toBeInTheDocument();
  });

  it('shows the identical message for an unknown email (R50)', async () => {
    const user = userEvent.setup();
    renderWithApp(<ForgotPasswordScreen />, { route: '/forgot-password' });
    await user.type(screen.getByLabelText(/Email/), 'nobody@irent.test');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('If an account exists for this email, we sent a reset link. Check your inbox.')).toBeInTheDocument();
  });

  it('validates the email field before submitting', async () => {
    const user = userEvent.setup();
    renderWithApp(<ForgotPasswordScreen />, { route: '/forgot-password' });
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('This field is required.')).toBeInTheDocument();
  });
});
