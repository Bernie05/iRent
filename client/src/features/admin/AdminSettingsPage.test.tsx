import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminSettingsPage } from './AdminSettingsPage';
import { PortalPayPage } from '../portal/PortalPayPage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { renderWithApp } from '../../test/utils';

async function signIn(email: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

async function setup() {
  await signIn('admin@irent.test');
  const view = renderWithApp(<AdminSettingsPage />);
  await screen.findByRole('switch', { name: 'Send email reminders' });
  return { user: userEvent.setup(), ...view };
}

const account = (method: string) => screen.getByRole('group', { name: method });

describe('AdminSettingsPage (F22, R42, SC-44, SC-25)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('disables the day toggles while reminders are off', async () => {
    const { user } = await setup();
    const day = screen.getByLabelText('3 days overdue');
    expect(day).toBeEnabled();
    await user.click(screen.getByRole('switch', { name: 'Send email reminders' }));
    expect(day).toBeDisabled();
  });

  it('saves a day toggle, an account name and a new QR, and the values persist after reload (SC-44 step 1)', async () => {
    const { user, unmount } = await setup();
    await user.click(screen.getByLabelText('3 days overdue'));
    const name = within(account('GCash')).getByLabelText('Account name');
    await user.clear(name);
    await user.type(name, 'Bernie Baltazar');
    const qr = new File([new Uint8Array(1024)], 'gcash.png', { type: 'image/png' });
    fireEvent.change(within(account('GCash')).getByLabelText('QR code (optional)', { selector: 'input' }), { target: { files: [qr] } });
    expect(within(account('GCash')).getByRole('img', { name: 'GCash QR code' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();

    unmount();
    renderWithApp(<AdminSettingsPage />);
    await screen.findByRole('switch', { name: 'Send email reminders' });
    expect(screen.getByLabelText('3 days overdue')).not.toBeChecked();
    expect(screen.getByLabelText('7 days overdue')).toBeChecked();
    expect(within(account('GCash')).getByLabelText('Account name')).toHaveValue('Bernie Baltazar');
    expect(within(account('GCash')).getByRole('img', { name: 'GCash QR code' }).getAttribute('src')).toContain(encodeURIComponent('gcash QR (uploaded)'));
  });

  it('turning every account off makes Pay Rent show the not-available message (SC-25)', async () => {
    const { user, unmount } = await setup();
    for (const method of ['GCash', 'Maya', 'BPI']) await user.click(screen.getByRole('switch', { name: `Show ${method} to renters` }));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Settings saved.');
    unmount();

    await getSupabase().auth.signOut({ scope: 'local' });
    await signIn('ana@irent.test');
    renderWithApp(<PortalPayPage />);
    expect(await screen.findByText('Online payment is not available yet. Please contact the owner.')).toBeInTheDocument();
  });

  it('shows a field error for an account name over 80 characters and does not save', async () => {
    const { user } = await setup();
    const name = within(account('Maya')).getByLabelText('Account name');
    // maxLength stops typing past 80, so set the value directly to exercise the schema.
    fireEvent.change(name, { target: { value: 'x'.repeat(81) } });
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await within(account('Maya')).findByText('The account name can be at most 80 characters.')).toBeInTheDocument();
    expect(screen.queryByText('Settings saved.')).not.toBeInTheDocument();
  });

  it('shows ErrorState with Retry when settings fail to load', async () => {
    mockControl.failNext('GET', '/settings', 500, 'INTERNAL');
    await signIn('admin@irent.test');
    const user = userEvent.setup();
    renderWithApp(<AdminSettingsPage />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Send email reminders' })).toBeChecked());
  });
});
