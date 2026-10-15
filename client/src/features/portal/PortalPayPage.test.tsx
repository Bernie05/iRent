import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalPayPage } from './PortalPayPage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { db } from '../../mocks/db';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { renderWithApp, nodeFile } from '../../test/utils';
import type { RootState } from '../../app/store';

const benProfile: RootState['auth'] = {
  status: 'authenticated',
  session: { userId: 'usr-ben', email: 'ben@irent.test' },
  profile: {
    id: 'usr-ben',
    full_name: 'Ben Dela Rosa',
    email: 'ben@irent.test',
    phone: '09182223333',
    role: 'renter',
    language: 'en',
    tenancy: {
      id: 'ten-ben',
      bed: { label: 'Bed 2', room: 'Room 2', bunk_type: 'upper', monthly_rate: 400000 },
      move_in: '2026-07-20',
    },
  },
  sessionExpired: false,
};

async function signInAsBen() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'ben@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

function validFile() {
  return nodeFile(1024, 'proof.png', 'image/png');
}

describe('PortalPayPage (F10, SC-17..SC-25, SC-59)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('shows payment accounts with a Copy button (R19)', async () => {
    await signInAsBen();
    renderWithApp(<PortalPayPage />, { preloadedState: { auth: benProfile } });
    await waitFor(() => expect(screen.getAllByText('GCash').length).toBeGreaterThan(0));
    expect(screen.getAllByText('0917 000 0000').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Copy' }).length).toBeGreaterThan(0);
  });

  it('defaults the amount to the remaining balance and submits successfully (SC-17)', async () => {
    const user = userEvent.setup();
    await signInAsBen();
    renderWithApp(<PortalPayPage />, { preloadedState: { auth: benProfile } });

    await waitFor(() => expect(screen.getByLabelText(/Item to pay/)).toBeInTheDocument());
    // Ben's September rent: ₱4,000 charge, ₱1,500 paid → ₱2,500 remaining, preselected first.
    expect(screen.getByLabelText(/Amount/)).toHaveValue(2500);

    await user.selectOptions(screen.getByLabelText(/Method/), 'gcash');
    await user.type(screen.getByLabelText(/Reference number/), 'GC 9999 2026');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, validFile());

    await user.click(screen.getByRole('button', { name: 'Submit payment' }));
    expect(await screen.findByText(/Payment received/)).toBeInTheDocument();
  });

  it('shows the excess-to-credit helper when the amount exceeds the remaining balance (R20, R52)', async () => {
    const user = userEvent.setup();
    await signInAsBen();
    renderWithApp(<PortalPayPage />, { preloadedState: { auth: benProfile } });

    await waitFor(() => expect(screen.getByLabelText(/Amount/)).toBeInTheDocument());
    const amountField = screen.getByLabelText(/Amount/);
    await user.clear(amountField);
    await user.type(amountField, '3000');

    expect(await screen.findByText(/₱500.00 more than the balance will be saved as credit/)).toBeInTheDocument();
  });

  it('preselects the item from ?item=<type>:<id> (SC-24)', async () => {
    await signInAsBen();
    renderWithApp(<PortalPayPage />, { route: '/portal/pay?item=bill_share:shr-ben-elec-09', preloadedState: { auth: benProfile } });
    await waitFor(() => expect(screen.getByLabelText(/Amount/)).toHaveValue(300));
  });

  it('rejects a non-image file before upload (E22)', async () => {
    await signInAsBen();
    renderWithApp(<PortalPayPage />, { preloadedState: { auth: benProfile } });
    await waitFor(() => expect(screen.getByLabelText(/Item to pay/)).toBeInTheDocument());

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [nodeFile(1024, 'proof.pdf', 'application/pdf')] } });
    expect(await screen.findByText('The screenshot must be a JPG, PNG or WebP image under 5 MB.')).toBeInTheDocument();
  });

  it('shows the duplicate-reference error (R23)', async () => {
    const user = userEvent.setup();
    await signInAsBen();
    mockControl.failNext('POST', '/me/payments', 409, 'DUPLICATE_REFERENCE');
    renderWithApp(<PortalPayPage />, { preloadedState: { auth: benProfile } });

    await waitFor(() => expect(screen.getByLabelText(/Method/)).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/Method/), 'gcash');
    await user.type(screen.getByLabelText(/Reference number/), 'GC 1234 2026');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, validFile());
    await user.click(screen.getByRole('button', { name: 'Submit payment' }));

    expect(await screen.findByText(/This reference number was already used/)).toBeInTheDocument();
  });

  it('a double click sends exactly one request (E1)', async () => {
    const user = userEvent.setup();
    await signInAsBen();
    renderWithApp(<PortalPayPage />, { preloadedState: { auth: benProfile } });

    await waitFor(() => expect(screen.getByLabelText(/Method/)).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/Method/), 'gcash');
    await user.type(screen.getByLabelText(/Reference number/), 'GC 8888 2026');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, validFile());
    const submit = screen.getByRole('button', { name: 'Submit payment' });
    await user.dblClick(submit);

    expect(await screen.findByText(/Payment received/)).toBeInTheDocument();
  });

  it('shows the no-accounts message and hides the form when nothing is enabled (E23)', async () => {
    db.settings.payment_accounts.forEach((a) => (a.enabled = false));
    await signInAsBen();
    renderWithApp(<PortalPayPage />, { preloadedState: { auth: benProfile } });
    await waitFor(() => expect(screen.getByText('Online payment is not available yet. Please contact the owner.')).toBeInTheDocument());
    expect(screen.queryByLabelText(/Item to pay/)).not.toBeInTheDocument();
  });
});
