import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDashboardPage } from './AdminDashboardPage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { renderWithApp } from '../../test/utils';
import { db, generateRent } from '../../mocks/db';
import { addDays, manilaToday } from '../../lib/time';

async function signInAsAdmin() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'admin@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

const region = (name: string) => screen.getByRole('region', { name });

describe('AdminDashboardPage (F12, R28, SC-26; dashboard design pass)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('KPIs for a month: revenue, expenses, net, occupancy and collection rate, with the R28 links', async () => {
    await signInAsAdmin();
    renderWithApp(<AdminDashboardPage />);
    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } });

    // Sep 2026 seed: payments 5,300 + 1,500 + 4,400 + 4,000 + 4,000; expenses 820 + 14,995 + recurring 2,500 + 1,699 + 549; 6 of 8 beds at month end; 18,300 of 30,400 collected.
    await waitFor(() => expect(screen.getAllByText('₱19,200.00').length).toBeGreaterThan(0));
    expect(screen.getAllByText('₱20,563.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-₱1,363.00').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Occupancy 75% 6 of 8 beds/ })).toHaveAttribute('href', '/admin/beds');
    expect(screen.getAllByText('60.2%').length).toBeGreaterThan(0);

    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/admin/beds', '/admin/rent', '/admin/inquiries', '/admin/payments']));
  });

  it('groups not-paid items per renter (total, months), expands, and filters per renter', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    generateRent('2026-10-01', 'usr-admin'); // Cara now owes September and October
    renderWithApp(<AdminDashboardPage />);
    const rowOf = async (name: string) => (await within(await screen.findByRole('region', { name: 'Not paid' })).findByText(name)).closest('tr')!;

    const cara = await rowOf('Cara Mendoza');
    expect(cara).toHaveTextContent('₱9,300.00'); // Sep rent 4,500 + Sep electricity 300 + Oct rent 4,500
    expect(cara).toHaveTextContent('2 months');

    // From xl the table scrolls inside the card: a focusable, labelled region (keyboard-reachable scroll area).
    expect(screen.getByRole('region', { name: 'Not paid list, scrollable' })).toHaveAttribute('tabindex', '0');
    const toggle = within(cara).getByRole('button', { name: 'Show the unpaid items of Cara Mendoza' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(within(panel).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('September 2026 rent'),
      expect.stringContaining('September 2026 electricity bill'),
      expect.stringContaining('October 2026 rent'),
    ]);

    await user.click(within(region('Not paid')).getByRole('radio', { name: 'Partial' }));
    await waitFor(() => expect(within(region('Not paid')).queryByText('Cara Mendoza')).not.toBeInTheDocument());
    expect(within(region('Not paid')).getByText('Ben Dela Rosa')).toBeInTheDocument();
  });

  it('records a payment toward a renter\'s total, oldest month first, with a preview', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    generateRent('2026-10-01', 'usr-admin');
    renderWithApp(<AdminDashboardPage />);
    const cara = (await within(await screen.findByRole('region', { name: 'Not paid' })).findByText('Cara Mendoza')).closest('tr')!;
    await user.click(within(cara).getByRole('button', { name: 'Record payment toward the total of Cara Mendoza' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('₱9,300.00 outstanding in 3 items');

    const amount = within(dialog).getByLabelText(/Amount/);
    await user.clear(amount);
    await user.type(amount, '4800');
    expect(dialog).toHaveTextContent('September 2026 rent (full)');
    expect(dialog).toHaveTextContent('September 2026 electricity bill (full)');
    expect(dialog).toHaveTextContent('Still owed after this: ₱4,500.00');
    await user.click(within(dialog).getByRole('button', { name: 'Save payment' }));

    await waitFor(() => expect(screen.getByText('Payment recorded.')).toBeInTheDocument());
    await waitFor(() => {
      const row = within(region('Not paid')).getByText('Cara Mendoza').closest('tr')!;
      expect(row).toHaveTextContent('₱4,500.00');
      expect(row).toHaveTextContent('1 month');
    });
  });

  it('adds an expense from the modal (validation first)', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminDashboardPage />);
    await user.click(await screen.findByRole('button', { name: 'Add expense' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Use 2 to 120 characters.')).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText(/Category/), 'appliance');
    await user.type(within(dialog).getByLabelText(/Description/), 'Electric kettle');
    await user.type(within(dialog).getByLabelText(/Amount/), '1299.50');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Expense added.')).toBeInTheDocument());
    await waitFor(() => expect(within(region('Expenses')).getByText('Electric kettle')).toBeInTheDocument());
    expect(within(region('Expenses')).getByText('₱1,299.50')).toBeInTheDocument();
    // The period total is a line under the header (like Not paid's outstanding), not a table row.
    const totalLine = within(region('Expenses')).getByText(/total in \d+ expenses?/).closest('p')!;
    expect(totalLine.closest('table')).toBeNull();
    expect(within(region('Expenses')).queryByRole('rowheader', { name: 'Total' })).not.toBeInTheDocument();
  });

  it('deletes an expense only after the confirm (Cancel keeps it)', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminDashboardPage />);
    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } });
    const del = await within(await screen.findByRole('region', { name: 'Expenses' })).findByRole('button', { name: 'Delete Cleaning supplies' });
    await user.click(del);
    let confirm = screen.getByRole('dialog', { name: 'Are you sure you want to delete this?' });
    expect(confirm).toHaveTextContent('"Cleaning supplies" will be deleted.');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Cleaning supplies')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete Cleaning supplies' }));
    confirm = screen.getByRole('dialog', { name: 'Are you sure you want to delete this?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Cleaning supplies')).not.toBeInTheDocument());
  });

  it('marks posted recurring entries with a badge and edits one entry on its own', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminDashboardPage />);
    fireEvent.change(await screen.findByLabelText('Month'), { target: { value: '2026-09' } });
    const card = await screen.findByRole('region', { name: 'Expenses' });
    const row = (await within(card).findByText('Netflix')).closest('tr')!;
    expect(row).toHaveTextContent('Recurring');
    expect(within(card).getByText('Cleaning supplies').closest('tr')).not.toHaveTextContent('Recurring');

    await user.click(within(row).getByRole('button', { name: 'Edit Netflix' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit expense' });
    expect(dialog).toHaveTextContent('Part of: Netflix (recurring). Edit the template in the Recurring tab');
    expect(within(dialog).queryByRole('switch', { name: 'Recurring (monthly)' })).not.toBeInTheDocument();
    const amount = within(dialog).getByLabelText(/Amount/);
    await user.clear(amount);
    await user.type(amount, '649');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(card).getByText('Netflix').closest('tr')).toHaveTextContent('₱649.00'));
  });

  describe('Add expense with "Recurring (monthly)"', () => {
    async function openAdd(user: ReturnType<typeof userEvent.setup>) {
      await signInAsAdmin();
      renderWithApp(<AdminDashboardPage />);
      const card = await screen.findByRole('region', { name: 'Expenses' });
      await user.click(within(card).getByRole('button', { name: 'Add expense' }));
      return screen.findByRole('dialog', { name: 'Add expense' });
    }
    async function fill(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, date: string, name: string) {
      fireEvent.change(within(dialog).getByLabelText(/^Date/), { target: { value: date } });
      await user.selectOptions(within(dialog).getByLabelText(/Category/), 'subscriptions');
      await user.type(within(dialog).getByLabelText(/Description/), name);
      await user.type(within(dialog).getByLabelText(/Amount/), '399');
    }
    const entriesOf = (name: string) => {
      const tpl = db.recurring.find((r) => r.name === name);
      return { tpl, entries: db.expenses.filter((e) => tpl && e.recurring_id === tpl.id) };
    };

    it('derives the due day from the Date (with the day-31 note) and creates one template + one entry for today', async () => {
      const user = userEvent.setup();
      const dialog = await openAdd(user);
      await user.click(within(dialog).getByRole('switch', { name: 'Recurring (monthly)' }));
      fireEvent.change(within(dialog).getByLabelText(/^Date/), { target: { value: '2026-01-31' } });
      expect(dialog).toHaveTextContent('Repeats every 31st of the month');
      expect(dialog).toHaveTextContent('fall on the last day in shorter months');

      await fill(user, dialog, manilaToday(), 'Spotify');
      expect(dialog).toHaveTextContent(`Repeats every `);
      expect(dialog).toHaveTextContent('posted when you save');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(screen.getByText(/Added\. Spotify now repeats every/)).toBeInTheDocument());
      const { tpl, entries } = entriesOf('Spotify');
      expect(tpl).toMatchObject({ due_day: Number(manilaToday().slice(8, 10)), starts_on: `${manilaToday().slice(0, 7)}-01`, active: true, amount: 39900 });
      expect(entries.map((e) => e.spent_on)).toEqual([manilaToday()]);

      // The toast links to the Recurring tab.
      await user.click(screen.getByRole('button', { name: 'View' }));
      expect(screen.getByRole('tab', { name: 'Recurring' })).toHaveAttribute('aria-selected', 'true');
    });

    it('a future date creates the template but no entry yet, and says when it posts', async () => {
      const user = userEvent.setup();
      const dialog = await openAdd(user);
      await user.click(within(dialog).getByRole('switch', { name: 'Recurring (monthly)' }));
      await fill(user, dialog, addDays(manilaToday(), 3), 'YouTube Premium');
      expect(dialog).toHaveTextContent('First entry posts on');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(entriesOf('YouTube Premium').tpl).toBeDefined());
      expect(entriesOf('YouTube Premium').entries).toHaveLength(0);
    });

    it('with the switch off, saving makes a one-off expense and no template', async () => {
      const user = userEvent.setup();
      const dialog = await openAdd(user);
      await fill(user, dialog, manilaToday(), 'HDMI cable');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(screen.getByText('Expense added.')).toBeInTheDocument());
      expect(db.recurring.some((r) => r.name === 'HDMI cable')).toBe(false);
      expect(db.expenses.filter((e) => e.description === 'HDMI cable')).toMatchObject([{ recurring_id: null }]);
    });
  });

  it('recurring tab: monthly total, pause, add, edit (future only) and delete with confirm', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminDashboardPage />);
    const card = await screen.findByRole('region', { name: 'Expenses' });
    await user.click(within(card).getByRole('tab', { name: 'Recurring' }));
    await waitFor(() => expect(card).toHaveTextContent('₱4,748.00 fixed per month from 3 active'));

    await user.click(within(card).getByRole('switch', { name: 'Active: Netflix' }));
    await waitFor(() => expect(card).toHaveTextContent('₱4,199.00 fixed per month from 2 active'));

    await user.click(within(card).getByRole('button', { name: 'Add recurring' }));
    let dialog = await screen.findByRole('dialog', { name: 'Add recurring expense' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Enter a day from 1 to 31.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Name/), 'Water delivery');
    await user.selectOptions(within(dialog).getByLabelText(/Category/), 'supplies');
    await user.type(within(dialog).getByLabelText(/Amount per month/), '300');
    await user.type(within(dialog).getByLabelText(/Due day/), '1');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(card).toHaveTextContent('₱4,499.00 fixed per month from 3 active'));

    await user.click(within(card).getByRole('button', { name: 'Edit Condo dues' }));
    dialog = await screen.findByRole('dialog', { name: 'Edit recurring expense' });
    expect(dialog).toHaveTextContent('Changing it affects future months only.');
    const amount = within(dialog).getByLabelText(/Amount per month/);
    await user.clear(amount);
    await user.type(amount, '2800');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(card).toHaveTextContent('₱4,799.00 fixed per month from 3 active'));

    await user.click(within(card).getByRole('button', { name: 'Delete Water delivery' }));
    let confirm = screen.getByRole('dialog', { name: 'Are you sure you want to delete this?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(within(card).getByText('Water delivery')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Delete Water delivery' }));
    confirm = screen.getByRole('dialog', { name: 'Are you sure you want to delete this?' });
    expect(confirm).toHaveTextContent('Entries already posted stay in your expenses.');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(card).queryByText('Water delivery')).not.toBeInTheDocument());
  });

  it('lists upcoming birthdays with today highlighted, moved-out renters left out', async () => {
    await signInAsAdmin();
    renderWithApp(<AdminDashboardPage />);
    const card = await waitFor(() => {
      const r = region('Upcoming birthdays');
      expect(within(r).getByText('Ana Cruz')).toBeInTheDocument();
      return r;
    });
    const items = within(card).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Ana Cruz');
    expect(items[0]).toHaveTextContent('Today');
    expect(items[1]).toHaveTextContent('In 9 days');
    expect(within(card).queryByText('Gil Navarro')).not.toBeInTheDocument();
  });

  it('shows the ErrorState with Retry on a load failure', async () => {
    await signInAsAdmin();
    mockControl.failNext('GET', '/dashboard/analytics', 500, 'INTERNAL');
    renderWithApp(<AdminDashboardPage />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
