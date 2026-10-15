import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { AdminRentersPage } from './AdminRentersPage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { manilaToday } from '../../lib/time';
import { renderWithApp } from '../../test/utils';
import { db } from '../../mocks/db';

async function signInAsAdmin() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'admin@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

describe('AdminRentersPage (F14, R30-R32, R51, SC-29, SC-30, SC-51, SC-52, SC-64)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('shows the renters table with an Invite pending badge', async () => {
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());
    expect(screen.getByText('Cara Mendoza')).toBeInTheDocument();
    const cararow = screen.getByText('Cara Mendoza').closest('tr')!;
    expect(cararow).toHaveTextContent('Invite pending');
  });

  it('pages the renters table (10 per page, client-side); a new search goes back to page 1', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    for (let i = 1; i <= 12; i++) {
      db.profiles.push({ ...db.profiles[1], id: `usr-extra-${i}`, full_name: `Zed Extra ${String(i).padStart(2, '0')}`, email: `extra${i}@irent.test` });
    }
    renderWithApp(<AdminRentersPage />);
    const nav = await screen.findByRole('navigation', { name: 'Renters pages' });
    expect(nav).toHaveTextContent('Showing 1–10 of 20');
    expect(screen.getAllByRole('row')).toHaveLength(11);

    await user.click(within(nav).getByRole('button', { name: 'Next page' }));
    expect(nav).toHaveTextContent('Showing 11–20 of 20');
    expect(screen.getByText('Zed Extra 12')).toBeInTheDocument();
    expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Search renters/), 'Zed');
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Renters pages' })).toHaveTextContent('Showing 1–10 of 12'), { timeout: 2000 });
    expect(screen.getByRole('button', { name: 'Page 1 of 2' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the summary strip and filters by status and room', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());
    const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!;
    expect(stat('Active renters')).toHaveTextContent('6');
    expect(stat('Invite pending')).toHaveTextContent('1');
    expect(stat('Moved out')).toHaveTextContent('2');

    await user.selectOptions(screen.getByLabelText('Status'), 'moved_out');
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      expect.stringContaining('Gil Navarro'),
      expect.stringContaining('Hana Villanueva'),
    ]);
    await user.selectOptions(screen.getByLabelText('Status'), 'all');
    await user.selectOptions(screen.getByLabelText('Room'), 'Room B');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Jomar Bautista' })).toHaveAttribute('href', '/admin/renters/usr-jomar');
    expect(screen.getByText('3 months unpaid')).toBeInTheDocument();
  });

  it('opens Add renter with the bed chosen from the Beds page (?add=1&bed=…)', async () => {
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />, { route: '/admin/renters?add=1&bed=bed-8' });
    const dialog = await screen.findByRole('dialog', { name: 'Add renter' });
    await waitFor(() => expect(within(dialog).getByLabelText(/Bed/)).toHaveValue('bed-8'));
  });

  it('renter details: profile, balance with oldest-first pay toward the total, history and credit', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(
      <Routes>
        <Route path="/admin/renters/:id" element={<AdminRentersPage />} />
      </Routes>,
      { route: '/admin/renters/usr-jomar' },
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Jomar Bautista' })).toBeInTheDocument();
    expect(screen.getByText('Room B – Lower Bunk')).toBeInTheDocument();
    const balance = await screen.findByRole('region', { name: 'Balance' });
    await waitFor(() => expect(balance).toHaveTextContent('₱13,500.00 outstanding, 3 months unpaid'));
    expect(within(balance).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('July 2026 rent'),
      expect.stringContaining('August 2026 rent'),
      expect.stringContaining('September 2026 rent'),
    ]);
    const history = screen.getByRole('region', { name: 'Payment history' });
    await waitFor(() => expect(within(history).getByText('June 2026 rent')).toBeInTheDocument());

    await user.click(within(balance).getByRole('button', { name: 'Record payment' }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText(/Amount/);
    await user.clear(amount);
    await user.type(amount, '4500');
    expect(dialog).toHaveTextContent('July 2026 rent (full)');
    expect(dialog).toHaveTextContent('Still owed after this: ₱9,000.00');
    await user.click(within(dialog).getByRole('button', { name: 'Save payment' }));
    await waitFor(() => expect(balance).toHaveTextContent('₱9,000.00 outstanding, 2 months unpaid'));

    await user.click(screen.getByRole('button', { name: 'Move out' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('filters by name search', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());

    await user.type(screen.getByLabelText(/Search renters/), 'Ana');
    await waitFor(() => expect(screen.queryByText('Ben Dela Rosa')).not.toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Ana Cruz')).toBeInTheDocument();
  });

  it('adds a renter and shows the due-day helper that updates with move-in date', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add renter' }));
    await user.type(await screen.findByLabelText(/Full name/), 'New Renter');
    await user.type(screen.getByLabelText(/Email/), 'new.renter@example.com');
    await user.type(screen.getByLabelText(/Phone/), '09171234567');
    const bedSelect = screen.getByLabelText(/Bed/);
    const options = Array.from((bedSelect as HTMLSelectElement).options).filter((o) => o.value);
    await user.selectOptions(bedSelect, options[0].value);
    const moveInField = screen.getByLabelText(/Move-in date/);
    await user.type(moveInField, '2026-10-15');
    expect(await screen.findByText(/Rent will be due on day/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Renter added.')).toBeInTheDocument());
  });

  it('shows the EMAIL_EXISTS error and keeps the modal open with data', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add renter' }));
    await user.type(await screen.findByLabelText(/Full name/), 'Dup Renter');
    await user.type(screen.getByLabelText(/Email/), 'ana@irent.test');
    await user.type(screen.getByLabelText(/Phone/), '09171234567');
    const bedSelect = screen.getByLabelText(/Bed/);
    const options = Array.from((bedSelect as HTMLSelectElement).options).filter((o) => o.value);
    await user.selectOptions(bedSelect, options[0].value);
    await user.type(screen.getByLabelText(/Move-in date/), '2026-10-15');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Full name/)).toHaveValue('Dup Renter');
  });

  it('edits a renter', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());

    const row = screen.getByText('Ana Cruz').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    const nameField = await screen.findByLabelText(/Full name/);
    await user.clear(nameField);
    await user.type(nameField, 'Ana Cruz-Santos');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Renter saved.')).toBeInTheDocument());
  });

  it('edits the optional Birthday (prefilled, future date rejected, then saved)', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ben Dela Rosa')).toBeInTheDocument());

    await user.click(within(screen.getByText('Ben Dela Rosa').closest('tr')!).getByRole('button', { name: 'Edit' }));
    const birthday = (await screen.findByLabelText('Birthday')) as HTMLInputElement;
    expect(birthday.value).toMatch(/^2000-/);

    fireEvent.change(birthday, { target: { value: '2999-01-01' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a real birthday, not a future date.')).toBeInTheDocument();

    fireEvent.change(birthday, { target: { value: '2000-03-15' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Renter saved.')).toBeInTheDocument());
  });

  it('resends an invite and shows the confirmation toast', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Cara Mendoza')).toBeInTheDocument());

    const row = screen.getByText('Cara Mendoza').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Resend invite' }));
    expect(await screen.findByText('Invite sent to cara@irent.test.')).toBeInTheDocument();
  });

  it('shows ALREADY_ACTIVATED when resending to an activated renter', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    mockControl.failNext('POST', '/renters/usr-cara/resend-invite', 409, 'ALREADY_ACTIVATED');
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Cara Mendoza')).toBeInTheDocument());

    const row = screen.getByText('Cara Mendoza').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Resend invite' }));
    expect(await screen.findByText('This renter has already set a password.')).toBeInTheDocument();
  });

  it('shows the ErrorState with Retry on a load failure', async () => {
    await signInAsAdmin();
    mockControl.failNext('GET', '/renters', 500, 'INTERNAL');
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('AdminRentersPage — F15 assign bed, move-out, credit ledger, refund (R33, R34, R55, R57, SC-31, SC-65, SC-66)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('assigns a bed to a renter with no active tenancy', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    // Hana moved out and has no active tenancy in the fixtures.
    await waitFor(() => expect(screen.getByText('Hana Villanueva')).toBeInTheDocument());

    const row = screen.getByText('Hana Villanueva').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Assign bed' }));
    const bedSelect = await screen.findByLabelText(/Bed/);
    const options = Array.from((bedSelect as HTMLSelectElement).options).filter((o) => o.value);
    await user.selectOptions(bedSelect, options[0].value);
    await user.type(screen.getByLabelText(/Move-in date/), '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Bed assigned.')).toBeInTheDocument());
  });

  it('shows the move-out preview and confirms move-out (SC-65)', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());

    const row = screen.getByText('Ana Cruz').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Move out' }));
    expect(await screen.findByText(/will pay/)).toBeInTheDocument();

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move out' }));
    await waitFor(() => expect(screen.getByText('Ana Cruz moved out.')).toBeInTheDocument());
  });

  it('rejects a move-out date before move-in', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());

    const row = screen.getByText('Ana Cruz').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Move out' }));
    const dateField = await screen.findByLabelText(/Move-out date/);
    await user.clear(dateField);
    await user.type(dateField, '2020-01-01');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move out' }));

    expect(await screen.findByText("The move-out date can't be before the move-in date.")).toBeInTheDocument();
  });

  it('caps the move-out date at today and blocks a future date (R34)', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());

    const row = screen.getByText('Ana Cruz').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Move out' }));
    const dateField = await screen.findByLabelText(/Move-out date/);
    expect(dateField).toHaveAttribute('max', manilaToday());
    await user.clear(dateField);
    await user.type(dateField, '2999-01-01');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move out' }));

    expect(await screen.findByText("Move-out date can't be in the future.")).toBeInTheDocument();
  });

  it('Esc closes only the refund modal stacked over the ledger and focus returns into the ledger (Q&A (n))', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());

    const row = screen.getByText('Ana Cruz').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /500/ }));
    await screen.findByText('Credit ledger — Ana Cruz');
    await user.click(screen.getByRole('button', { name: 'Record refund' }));
    expect(await screen.findAllByRole('dialog')).toHaveLength(2);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1));
    const ledger = screen.getByRole('dialog');
    expect(ledger).toHaveAccessibleName('Credit ledger — Ana Cruz');
    expect(ledger).toContainElement(document.activeElement as HTMLElement);
  });

  it('opens the credit ledger panel from the Credit column (shared with F11)', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());

    const row = screen.getByText('Ana Cruz').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /500/ }));
    expect(await screen.findByText('Credit ledger — Ana Cruz')).toBeInTheDocument();
    expect(screen.getByText('Added from overpayment')).toBeInTheDocument();
  });

  it('shows the refund-exceeds-credit message when the amount is above the balance (E37, SC-66)', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());

    const row = screen.getByText('Ana Cruz').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /500/ }));
    await screen.findByText('Credit ledger — Ana Cruz');
    await user.click(screen.getByRole('button', { name: 'Record refund' }));

    await user.type(await screen.findByLabelText(/Amount/), '600');
    await user.type(screen.getByLabelText(/^Date/), '2026-09-30');
    await user.click(screen.getByRole('button', { name: 'Save refund' }));

    expect(await screen.findByText(/Refund can't be more than the credit balance/)).toBeInTheDocument();
  });

  it('records a valid refund', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminRentersPage />);
    await waitFor(() => expect(screen.getByText('Ana Cruz')).toBeInTheDocument());

    const row = screen.getByText('Ana Cruz').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: /500/ }));
    await screen.findByText('Credit ledger — Ana Cruz');
    await user.click(screen.getByRole('button', { name: 'Record refund' }));

    await user.type(await screen.findByLabelText(/Amount/), '200');
    await user.clear(screen.getByLabelText(/^Date/));
    await user.type(screen.getByLabelText(/^Date/), '2026-09-30');
    await user.click(screen.getByRole('button', { name: 'Save refund' }));

    await waitFor(() => expect(screen.getByText('Refund recorded.')).toBeInTheDocument());
  });
});
