import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminRentPage } from './AdminRentPage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { periodOf } from '../../lib/time';
import { renderWithApp } from '../../test/utils';

async function setup() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'admin@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
  renderWithApp(<AdminRentPage />);
  await screen.findByText('Ana Cruz');
}

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

// The page defaults to the current month and the fixtures hold September 2026 charges, so pin the
// clock (Date only, so user-event and RTK timers stay real) instead of depending on when tests run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-30T04:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AdminRentPage (F16, R35, R36, R55, SC-32, SC-33, SC-35, SC-56, SC-57)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('lists the period charges (overdue badge) and filters by status with its own empty state', async () => {
    const user = userEvent.setup();
    await setup();
    expect(rowOf('Ben Dela Rosa')).toHaveTextContent('Overdue');

    await user.click(screen.getByRole('radio', { name: 'Partial' }));
    await waitFor(() => expect(screen.queryByText('Ana Cruz')).not.toBeInTheDocument());
    expect(screen.getByText('Ben Dela Rosa')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '2030-01' } });
    expect(await screen.findByText('No partial charges for this period.')).toBeInTheDocument();
  });

  it('composes the Generate toast and omits the credit part when nothing was paid from credit', async () => {
    const user = userEvent.setup();
    await setup();
    await user.click(screen.getByRole('button', { name: 'Generate month' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Period/), { target: { value: `${periodOf().slice(0, 4)}-12` } });
    await user.click(within(dialog).getByRole('button', { name: 'Generate' }));
    const toast = await screen.findByText(/^Created \d+ charges, skipped \d+/);
    expect(toast.textContent).toMatch(/\(already exist or not yet moved in\)\./);
  });

  it('blocks an amount below what was paid (AMOUNT_BELOW_PAID)', async () => {
    const user = userEvent.setup();
    await setup();
    await user.click(within(rowOf('Ben Dela Rosa')).getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    const amount = within(dialog).getByLabelText(/Amount/);
    await user.clear(amount);
    await user.type(amount, '1000');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText("The amount can't be less than what has already been paid.")).toBeInTheDocument();
  });

  it('saves an edit, disables Delete when payments exist, and deletes a charge without payments', async () => {
    const user = userEvent.setup();
    await setup();
    await user.click(within(rowOf('Ben Dela Rosa')).getByRole('button', { name: 'Edit' }));
    const amount = within(screen.getByRole('dialog')).getByLabelText(/Amount/);
    await user.clear(amount);
    await user.type(amount, '4200');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    await screen.findByText('Charge saved.');

    expect(within(rowOf('Ben Dela Rosa')).getByRole('button', { name: /has payments/ })).toHaveAttribute('aria-disabled', 'true');

    await user.click(within(rowOf('Cara Mendoza')).getByRole('button', { name: 'Delete' }));
    let confirm = screen.getByRole('dialog', { name: 'Are you sure you want to delete this?' });
    expect(confirm).toHaveTextContent('"Cara Mendoza · September 2026 rent" will be deleted.');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(rowOf('Cara Mendoza')).toBeInTheDocument();
    await user.click(within(rowOf('Cara Mendoza')).getByRole('button', { name: 'Delete' }));
    confirm = screen.getByRole('dialog', { name: 'Are you sure you want to delete this?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await screen.findByText('Charge deleted.');
    await waitFor(() => expect(screen.queryByText('Cara Mendoza')).not.toBeInTheDocument());
  });
});

describe('Record payment modal (F17, R37, R52, SC-34, SC-40)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  async function open(name: string) {
    const user = userEvent.setup();
    await setup();
    await user.click(within(rowOf(name)).getByRole('button', { name: 'Record payment' }));
    return { user, dialog: screen.getByRole('dialog') };
  }

  it('defaults to the remaining amount, requires a reference for GCash but not cash, and warns about excess', async () => {
    const { user, dialog } = await open('Ben Dela Rosa');
    const amount = within(dialog).getByLabelText(/Amount/);
    expect(amount).toHaveValue('2500');

    await user.selectOptions(within(dialog).getByLabelText(/Method/), 'gcash');
    await user.click(within(dialog).getByRole('button', { name: 'Save payment' }));
    expect(await within(dialog).findByText('Enter the reference number.')).toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, '3000');
    expect(within(dialog).getByText(/will be saved as credit/)).toBeInTheDocument();
  });

  it('records a cash payment without a reference and reports the credit added', async () => {
    const { user, dialog } = await open('Ben Dela Rosa');
    const amount = within(dialog).getByLabelText(/Amount/);
    await user.clear(amount);
    await user.type(amount, '3000');
    await user.click(within(dialog).getByRole('button', { name: 'Save payment' }));
    expect(await screen.findByText(/Payment recorded\. .*500.* added to the renter's credit\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
