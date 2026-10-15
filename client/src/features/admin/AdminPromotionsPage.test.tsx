import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPromotionsPage } from './AdminPromotionsPage';
import { getSupabase } from '../../lib/supabase';
import { db } from '../../mocks/db';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { renderWithApp } from '../../test/utils';

async function signInAsAdmin() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'admin@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}
const titles = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1].textContent);

describe('AdminPromotionsPage (proposed promotions)', () => {
  beforeEach(async () => {
    db.today = () => '2026-10-14';
    await signInAsAdmin();
  });
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('lists promos in order with their status, and switches the public section off', async () => {
    const user = userEvent.setup();
    renderWithApp(<AdminPromotionsPage />);
    const row = (await screen.findByText('₱500 off your first month')).closest('tr')!;
    expect(row).toHaveTextContent('Visible');
    expect(screen.getByText(/December move-in/).closest('tr')).toHaveTextContent('Scheduled');
    expect(screen.getByText('Summer pool pass').closest('tr')).toHaveTextContent('Hidden');

    const toggle = screen.getByRole('switch', { name: 'Promos section on the public page' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(screen.getByText('The Promos section is hidden from the public page.')).toBeInTheDocument());
    expect(db.promoSection).toBe(false);
  });

  it('adds a promo (validation first), edits it, moves it up and deletes it with a confirm', async () => {
    const user = userEvent.setup();
    renderWithApp(<AdminPromotionsPage />);
    await screen.findByText('₱500 off your first month');

    await user.click(screen.getByRole('button', { name: 'Add promo' }));
    let dialog = await screen.findByRole('dialog', { name: 'Add promo' });
    await user.selectOptions(within(dialog).getByLabelText('Button'), 'section');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Enter a title of 1 to 120 characters.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose an option.')).toBeInTheDocument(); // no section picked
    expect(within(dialog).queryByRole('textbox', { name: /URL/i })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Title/), 'Free locker upgrade');
    await user.type(within(dialog).getByLabelText(/Button label/), 'See details');
    await user.selectOptions(within(dialog).getByLabelText(/Go to section/), 'faq');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Free locker upgrade')).toBeInTheDocument());
    expect(titles().at(-1)).toContain('Free locker upgrade');

    await user.click(screen.getByRole('button', { name: 'Edit Free locker upgrade' }));
    dialog = await screen.findByRole('dialog', { name: 'Edit promo' });
    await user.type(within(dialog).getByLabelText(/Badge/), 'New');
    await user.click(within(dialog).getByRole('switch', { name: 'Visible on the public page' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Free locker upgrade').closest('tr')).toHaveTextContent('Hidden'));
    expect(screen.getByText('Free locker upgrade').closest('tr')).toHaveTextContent('New');

    await user.click(screen.getByRole('button', { name: 'Move Free locker upgrade up' }));
    await waitFor(() => expect(titles()[3]).toContain('Free locker upgrade'));
    expect(screen.getByRole('button', { name: 'Move ₱500 off your first month up' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Delete Free locker upgrade' }));
    let confirm = await screen.findByRole('dialog', { name: 'Are you sure you want to delete this?' });
    await user.keyboard('{Escape}'); // Esc cancels
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Free locker upgrade')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete Free locker upgrade' }));
    confirm = await screen.findByRole('dialog', { name: 'Are you sure you want to delete this?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Free locker upgrade')).not.toBeInTheDocument());
    expect(db.promotions.map((p) => p.position).sort()).toEqual([1, 2, 3, 4]);
  });
});
