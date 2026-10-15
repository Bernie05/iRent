import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminBedsPage } from './AdminBedsPage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { renderWithApp } from '../../test/utils';
import { Route, Routes } from 'react-router-dom';
import { db } from '../../mocks/db';

async function signInAsAdmin() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'admin@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

describe('AdminBedsPage (F13, R29, BR-6, E12, SC-27, SC-28)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('shows the occupancy board with beds and their status', async () => {
    await signInAsAdmin();
    renderWithApp(<AdminBedsPage />);
    await waitFor(() => expect(screen.getByText('Room A – Lower Bunk 1')).toBeInTheDocument());
    expect(screen.getAllByText('Occupied').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vacant').length).toBeGreaterThan(0);
  });

  it('groups beds by room with occupancy, links tenants to their details, and offers Assign on vacant beds', async () => {
    await signInAsAdmin();
    renderWithApp(<AdminBedsPage />);
    const roomA = await screen.findByRole('region', { name: 'Room A' });
    const roomB = screen.getByRole('region', { name: 'Room B' });
    expect(roomA).toHaveTextContent('5 of 6 occupied');
    expect(roomB).toHaveTextContent('1 of 2 occupied');
    expect(within(roomA).getAllByRole('listitem')).toHaveLength(6);
    expect(within(roomB).getAllByRole('listitem')).toHaveLength(2);
    expect(within(roomA).getByRole('link', { name: 'Ana Cruz' })).toHaveAttribute('href', '/admin/renters/usr-ana');
    expect(within(roomB).getByRole('button', { name: 'Assign a renter to Room B – Upper Bunk' })).toBeInTheDocument();
  });

  it('asks before deleting a bed; Cancel keeps it', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminBedsPage />);
    const del = await screen.findByRole('button', { name: 'Delete Room B – Upper Bunk' });
    await user.click(del);
    let confirm = screen.getByRole('dialog', { name: 'Are you sure you want to delete this?' });
    expect(confirm).toHaveTextContent('"Room B – Upper Bunk" will be deleted.');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Room B – Upper Bunk')).toBeInTheDocument();
    await user.click(del);
    confirm = screen.getByRole('dialog', { name: 'Are you sure you want to delete this?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('Bed deleted.')).toBeInTheDocument());
  });

  it('disables delete with a tooltip for a bed with rental history, visible on keyboard focus', async () => {
    await signInAsAdmin();
    renderWithApp(<AdminBedsPage />);
    await waitFor(() => expect(screen.getByText('Room A – Lower Bunk 1')).toBeInTheDocument());

    const occupiedCard = screen.getByText('Room A – Lower Bunk 1').closest('li')!;
    const deleteBtn = within(occupiedCard).getByRole('button', { name: "This bed has rental history and can't be deleted." });
    expect(deleteBtn).toHaveAttribute('aria-disabled', 'true');
    expect(deleteBtn).toHaveAttribute('title', "This bed has rental history and can't be deleted.");
    deleteBtn.focus();
    expect(deleteBtn).toHaveFocus();
  });

  it('adds a bed via the modal', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminBedsPage />);
    await waitFor(() => expect(screen.getByText('Room A – Lower Bunk 1')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add bed' }));
    await user.type(await screen.findByLabelText(/Label/), 'Room C – Lower Bunk');
    await user.type(within(screen.getByRole('dialog')).getByLabelText(/Room/), 'Room C');
    await user.selectOptions(screen.getByLabelText(/Bunk type/), 'lower');
    await user.type(screen.getByLabelText(/Monthly rate/), '4500');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText('Bed added.')).toBeInTheDocument());
  });

  it('shows a validation error for an empty label', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderWithApp(<AdminBedsPage />);
    await waitFor(() => expect(screen.getByText('Room A – Lower Bunk 1')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add bed' }));
    await user.type(await within(await screen.findByRole('dialog')).findByLabelText(/Room/), 'Room C');
    await user.selectOptions(screen.getByLabelText(/Bunk type/), 'lower');
    await user.type(screen.getByLabelText(/Monthly rate/), '4500');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter 1 to 60 characters.')).toBeInTheDocument();
  });

  it('shows the ErrorState with Retry on a load failure', async () => {
    await signInAsAdmin();
    mockControl.failNext('GET', '/beds', 500, 'INTERNAL');
    renderWithApp(<AdminBedsPage />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('AdminBedsPage — Assign picker (renters without a bed)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  const renderBeds = () =>
    renderWithApp(
      <Routes>
        <Route path="/admin/beds" element={<AdminBedsPage />} />
        <Route path="/admin/renters" element={<p>Renters route</p>} />
      </Routes>,
      { route: '/admin/beds' },
    );

  async function openPicker(user: ReturnType<typeof userEvent.setup>) {
    await signInAsAdmin();
    renderBeds();
    await user.click(await screen.findByRole('button', { name: 'Assign a renter to Room B – Upper Bunk' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign Room B – Upper Bunk' });
    const combo = within(dialog).getByRole('combobox', { name: /Full name/ });
    await user.click(combo);
    return { dialog, combo };
  }

  it('lists only renters without a bed (status and money shown), then "Add new renter"', async () => {
    const user = userEvent.setup();
    const { dialog, combo } = await openPicker(user);
    expect(dialog).toHaveTextContent('₱4,000 per month');
    expect(combo).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(within(dialog).getAllByRole('option')).toHaveLength(3));
    const options = within(dialog).getAllByRole('option').map((o) => o.textContent);
    expect(options[0]).toContain('Gil Navarro');
    expect(options[0]).toContain('Moved out September 2026');
    expect(options[0]).toContain('Credit ₱400.00');
    expect(options[1]).toContain('Hana Villanueva');
    expect(options[1]).toContain('Owes ₱4,250.00');
    expect(options[2]).toContain('Add new renter');
    expect(options.join(' ')).not.toContain('Ana Cruz'); // has a bed
  });

  it('the list is an overlay in the dialog: opening it does not change the field or push the form', async () => {
    const user = userEvent.setup();
    await signInAsAdmin();
    renderBeds();
    await user.click(await screen.findByRole('button', { name: 'Assign a renter to Room B – Upper Bunk' }));
    const dialog = await screen.findByRole('dialog', { name: 'Assign Room B – Upper Bunk' });
    const combo = within(dialog).getByRole('combobox', { name: /Full name/ });
    const before = { className: combo.className, parent: combo.parentElement };
    await user.click(combo);
    const list = await within(dialog).findByRole('listbox');
    expect(combo.className).toBe(before.className);
    expect(combo.parentElement).toBe(before.parent);
    expect(list.parentElement).toBe(dialog); // portalled to the dialog, outside the scrolling body and the field wrapper
    expect(list.style.position).toBe('fixed');
    expect(before.parent!.contains(list)).toBe(false);
  });

  it('picks with the keyboard, then assigning makes the bed Occupied with the tenant', async () => {
    const user = userEvent.setup();
    const { dialog, combo } = await openPicker(user);
    await waitFor(() => expect(within(dialog).getAllByRole('option')).toHaveLength(3));
    await user.keyboard('{ArrowDown}');
    expect(combo).toHaveAttribute('aria-activedescendant', within(dialog).getAllByRole('option')[1].id);
    await user.keyboard('{Enter}');
    expect(combo).toHaveValue('Hana Villanueva');
    expect(combo).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).getByLabelText(/Move-in date/)).not.toHaveValue(''); // defaults to today
    expect(dialog).toHaveTextContent(/Rent will be due on day/);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Hana Villanueva assigned to Room B – Upper Bunk.')).toBeInTheDocument());
    const roomB = screen.getByRole('region', { name: 'Room B' });
    await waitFor(() => expect(within(roomB).getByRole('link', { name: 'Hana Villanueva' })).toBeInTheDocument());
    expect(roomB).toHaveTextContent('2 of 2 occupied');
  });

  it('Esc closes the list first, then the modal', async () => {
    const user = userEvent.setup();
    const { dialog, combo } = await openPicker(user);
    await user.keyboard('{Escape}');
    expect(combo).toHaveAttribute('aria-expanded', 'false');
    expect(dialog).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Add new renter" falls back to Add renter with the bed chosen', async () => {
    const user = userEvent.setup();
    const { dialog } = await openPicker(user);
    await user.click(await within(dialog).findByRole('option', { name: /Add new renter/ }));
    expect(await screen.findByText('Renters route')).toBeInTheDocument();
  });

  it('empty state: no renters without a bed', async () => {
    const user = userEvent.setup();
    db.profiles = db.profiles.filter((p) => p.id !== 'usr-gil' && p.id !== 'usr-hana');
    const { dialog } = await openPicker(user);
    await waitFor(() => expect(dialog).toHaveTextContent('No renters without a bed. Add a new renter.'));
    expect(within(dialog).getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('Add new renter')]);
  });
});
