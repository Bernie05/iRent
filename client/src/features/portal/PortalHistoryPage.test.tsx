import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalHistoryPage } from './PortalHistoryPage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { renderWithApp } from '../../test/utils';
import type { RootState } from '../../app/store';

const anaProfile: RootState['auth'] = {
  status: 'authenticated',
  session: { userId: 'usr-ana', email: 'ana@irent.test' },
  profile: {
    id: 'usr-ana',
    full_name: 'Ana Cruz',
    email: 'ana@irent.test',
    phone: '09171112222',
    role: 'renter',
    language: 'en',
    tenancy: { id: 'ten-ana', bed: { label: 'Lower Bunk A', room: 'Room 1', bunk_type: 'lower', monthly_rate: 450000 }, move_in: '2026-08-05' },
  },
  sessionExpired: false,
};

async function signInAsAna() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'ana@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

describe('PortalHistoryPage (F11, R24, R54)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('lists payments with verification badges and the split line for an excess (SC-17, SC-21)', async () => {
    await signInAsAna();
    renderWithApp(<PortalHistoryPage />, { preloadedState: { auth: anaProfile } });

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument());
    expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0);
    expect(screen.getByText('Received')).toBeInTheDocument();
    expect(screen.getByText('Paid from credit')).toBeInTheDocument();
    // pay-ana-2: amount ₱5,300, applied ₱4,500, excess ₱800 → split line.
    expect(screen.getByText('₱4,500.00 applied · ₱800.00 to credit')).toBeInTheDocument();
  });

  it('shows the status timeline per non-credit payment: renter upload under review, confirmed, rejected with the reason (R77, SC-93)', async () => {
    const user = userEvent.setup();
    await signInAsAna();
    renderWithApp(<PortalHistoryPage />, { preloadedState: { auth: anaProfile } });

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument());
    // Newest first: pay-ana-3 is a credit application (no Details), then pay-ana-2, pay-ana-1, pay-ana-0.
    const details = screen.getAllByRole('button', { name: /^Details for / });
    expect(screen.queryByRole('button', { name: 'Details for September 2026 Electricity bill' })).not.toBeInTheDocument();
    const timeline = (i: number) => details[i].closest('tr')!.nextElementSibling!.querySelector('ol')!;
    const steps = (i: number) => Array.from(timeline(i).querySelectorAll('li')).map((li) => li.textContent);

    expect(details[0]).toHaveAttribute('aria-expanded', 'false');
    await user.click(details[0]); // pay-ana-2: auto-verified → Under review is the current step, with the explanation
    expect(details[0]).toHaveAttribute('aria-expanded', 'true');
    expect(steps(0)).toEqual([expect.stringMatching(/^Uploaded · Sep 4, 2026/), expect.stringContaining('Under review')]);
    expect(timeline(0).querySelector('[aria-current="step"]')).toHaveTextContent('Already counted toward your balance while the owner checks it.');
    expect(details[0].closest('tr')!.nextElementSibling).toHaveTextContent('Reference: GC 2002 2026');

    await user.click(details[1]);
    expect(steps(1)).toEqual([expect.stringMatching(/^Uploaded/), 'Under review', expect.stringMatching(/^Confirmed · Aug 5, 2026/)]);

    await user.click(details[2]);
    const rejected = timeline(2).querySelector('[aria-current="step"]')!;
    expect(rejected).toHaveTextContent(/^Rejected · Aug 4, 2026/);
    expect(rejected).toHaveTextContent("This reference number isn't in our GCash history. This amount was taken off your payments.");
  });

  it('shows "Recorded by the owner" for a payment the admin recorded (source admin, R77)', async () => {
    const { error } = await getSupabase().auth.signInWithPassword({ email: 'ben@irent.test', password: MOCK_PASSWORD });
    expect(error).toBeNull();
    const benState: RootState['auth'] = { ...anaProfile, session: { userId: 'usr-ben', email: 'ben@irent.test' }, profile: { ...anaProfile.profile!, id: 'usr-ben' } };
    const user = userEvent.setup();
    renderWithApp(<PortalHistoryPage />, { preloadedState: { auth: benState } });
    await user.click(await screen.findByRole('button', { name: 'Details for August 2026 rent' })); // pay-ben-1, cash
    expect(screen.getByText('Recorded by the owner')).toBeInTheDocument();
  });

  it('pages the payments 20 at a time in a stacked table with column labels (D-31, R79, SC-96)', async () => {
    const user = userEvent.setup();
    await signInAsAna();
    renderWithApp(<PortalHistoryPage />, { preloadedState: { auth: anaProfile } });
    const table = await screen.findByRole('table', { name: 'Payments' });
    const rows = () => within(table).getAllByRole('row').slice(1);
    expect(rows()).toHaveLength(20);
    expect(screen.getByText(/^Showing 1–20 of d+$/)).toBeInTheDocument();
    // Stacked mode: each cell carries its column header, so the phone card reads "Amount ₱5,300.00".
    expect(within(table).getByText('₱5,300.00').closest('td')).toHaveAttribute('data-label', 'Amount');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Date', 'Item', 'Method', 'Amount', 'Status', 'Details']);
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(rows().length).toBeGreaterThan(0);
    expect(screen.getByText(/^Showing 21–/)).toBeInTheDocument();
  });

  it('shows the Credit section with a positive balance and the ledger entries (R54)', async () => {
    await signInAsAna();
    renderWithApp(<PortalHistoryPage />, { preloadedState: { auth: anaProfile } });

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Credit' })).toBeInTheDocument());
    expect(screen.getByText(/Credit balance: ₱500.00/)).toBeInTheDocument();
    expect(screen.getByText('Added from overpayment')).toBeInTheDocument();
  });

  it('hides the Credit section for a renter whose ledger is empty', async () => {
    const { error } = await getSupabase().auth.signInWithPassword({ email: 'ben@irent.test', password: MOCK_PASSWORD });
    expect(error).toBeNull();
    const benState: RootState['auth'] = { ...anaProfile, session: { userId: 'usr-ben', email: 'ben@irent.test' }, profile: { ...anaProfile.profile!, id: 'usr-ben' } };
    renderWithApp(<PortalHistoryPage />, { preloadedState: { auth: benState } });

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Credit' })).not.toBeInTheDocument();
  });

  it('opens the screenshot in a new tab from a signed URL', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    await signInAsAna();
    renderWithApp(<PortalHistoryPage />, { preloadedState: { auth: anaProfile } });

    await user.click((await screen.findAllByRole('button', { name: /^Details for / }))[0]);
    await user.click(screen.getByRole('button', { name: 'View screenshot' }));
    await waitFor(() => expect(openSpy).toHaveBeenCalled());
    openSpy.mockRestore();
  });

  it('shows the ErrorState with Retry on a load failure', async () => {
    await signInAsAna();
    mockControl.failNext('GET', '/me/payments', 500, 'INTERNAL');
    renderWithApp(<PortalHistoryPage />, { preloadedState: { auth: anaProfile } });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
