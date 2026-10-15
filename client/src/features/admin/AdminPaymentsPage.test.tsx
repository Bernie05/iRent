import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPaymentsPage } from './AdminPaymentsPage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { renderWithApp } from '../../test/utils';

async function setup() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'admin@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
  renderWithApp(<AdminPaymentsPage />);
  await screen.findByText('Ana Cruz');
}

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

async function openReview(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(rowOf(name)).getByRole('button', { name: 'Review' }));
  return screen.getByRole('dialog', { name: 'Review payment' });
}

describe('AdminPaymentsPage (F18, R38, R55, R56, SC-36, SC-37, SC-38, SC-61, SC-62)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('lists uploads oldest first with the excess to credit', async () => {
    await setup();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['Ana Cruz', 'Ben Dela Rosa']);
    expect(rowOf('Ana Cruz')).toHaveTextContent('₱800.00');
    expect(rowOf('Ben Dela Rosa')).toHaveTextContent('—');
  });

  it('shows the screenshot with a keyboard zoom toggle, and the already-used warning only when Y > 0', async () => {
    const user = userEvent.setup();
    await setup();
    let dialog = await openReview(user, 'Ana Cruz');
    expect(await within(dialog).findByRole('img', { name: /Payment screenshot for reference GC 2002 2026/ })).toBeInTheDocument();
    expect(within(dialog).getByText('₱300.00 of this credit was already used. Rejecting will reopen those items.')).toBeInTheDocument();
    expect(within(dialog).getByText('Excess to credit')).toBeInTheDocument();

    const zoom = within(dialog).getByRole('button', { name: 'Zoom in' });
    zoom.focus();
    await user.keyboard('{Enter}');
    expect(within(dialog).getByRole('button', { name: 'Zoom out' })).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{Escape}');
    dialog = await openReview(user, 'Ben Dela Rosa');
    await within(dialog).findByRole('img');
    expect(within(dialog).queryByText(/of this credit was already used/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Excess to credit')).not.toBeInTheDocument();
  });

  it('confirms a payment and removes the row (SC-36)', async () => {
    const user = userEvent.setup();
    await setup();
    const dialog = await openReview(user, 'Ben Dela Rosa');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Payment confirmed.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Ben Dela Rosa')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('requires a reason, then rejects and lists the credit removed (SC-37, SC-62)', async () => {
    const user = userEvent.setup();
    await setup();
    const review = await openReview(user, 'Ana Cruz');
    await user.click(within(review).getByRole('button', { name: 'Reject' }));
    const reject = screen.getByRole('dialog', { name: 'Reject this payment?' });
    const submit = within(reject).getByRole('button', { name: 'Reject and notify renter' });
    expect(submit).toBeDisabled();
    await user.type(within(reject).getByLabelText(/Reason/), '   ');
    expect(submit).toBeDisabled();

    await user.type(within(reject).getByLabelText(/Reason/), 'Reference not found in GCash history.');
    await user.click(submit);
    expect(await screen.findByText(/^Payment rejected\. The renter was notified\. Credit removed: ₱800\.00\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('handles ALREADY_REVIEWED: message, modals closed, list refreshed (SC-38, E6)', async () => {
    const user = userEvent.setup();
    await setup();
    mockControl.failNext('PATCH', '/payments/pay-ben-2/review', 409, 'ALREADY_REVIEWED');
    const dialog = await openReview(user, 'Ben Dela Rosa');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('This payment was already reviewed.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing is waiting', async () => {
    const user = userEvent.setup();
    await setup();
    for (const name of ['Ana Cruz', 'Ben Dela Rosa']) {
      const dialog = await openReview(user, name);
      await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(screen.queryByText(name)).not.toBeInTheDocument());
    }
    expect(await screen.findByText('All caught up. No payments waiting for review.')).toBeInTheDocument();
  });

  it('shows ErrorState with Retry when the list fails', async () => {
    mockControl.failNext('GET', '/payments', 500, 'INTERNAL');
    const { error } = await getSupabase().auth.signInWithPassword({ email: 'admin@irent.test', password: MOCK_PASSWORD });
    expect(error).toBeNull();
    const user = userEvent.setup();
    renderWithApp(<AdminPaymentsPage />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
  });
});
