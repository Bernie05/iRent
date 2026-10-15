import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { AdminBillsPage } from './AdminBillsPage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { server } from '../../mocks/node';
import { renderWithApp } from '../../test/utils';

async function signIn() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'admin@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

async function setup() {
  await signIn();
  renderWithApp(<AdminBillsPage />);
  await screen.findByText('Ana Cruz');
  return userEvent.setup();
}

const bill = (name: RegExp) => screen.getByRole('region', { name });
const rowOf = (scope: HTMLElement, name: string) => within(scope).getByText(name).closest('tr')!;

describe('AdminBillsPage (F19, R39, BR-5, SC-39, SC-40, SC-60)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('lists a bill with its shares and the paid-from-credit breakdown', async () => {
    await setup();
    const sept = bill(/September 2026 Electricity/);
    expect(sept).toHaveTextContent('Total ₱900.00');
    expect(rowOf(sept, 'Ana Cruz')).toHaveTextContent('from credit ₱300.00');
    expect(within(rowOf(sept, 'Ana Cruz')).queryByRole('button', { name: 'Mark share paid' })).not.toBeInTheDocument();
    expect(within(rowOf(sept, 'Ben Dela Rosa')).getByRole('button', { name: 'Mark share paid' })).toBeInTheDocument();
  });

  it('previews ₱1,000 / 6 as 166.67 ×4 and 166.66 ×2 and keeps Save disabled until the shares match (SC-39)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Enter bill' }));
    const dialog = screen.getByRole('dialog', { name: 'Enter bill' });
    await user.type(within(dialog).getByLabelText(/Total amount/), '1000');
    fireEvent.change(within(dialog).getByLabelText(/Due date/), { target: { value: '2026-10-10' } });

    // BR-5 order (move-in date, then id): the first four get the leftover centavos.
    const ben = within(dialog).getByLabelText('Share for Ben Dela Rosa');
    const expected = [['Jomar Bautista', '166.67'], ['Ben Dela Rosa', '166.67'], ['Ana Cruz', '166.67'], ['Cara Mendoza', '166.67'], ['Marifel Garcia', '166.66'], ['Elena Soriano', '166.66']];
    for (const [name, value] of expected) expect(within(dialog).getByLabelText(`Share for ${name}`)).toHaveValue(value);
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();

    await user.clear(ben);
    await user.type(ben, '400');
    expect(save).toBeDisabled();
    expect(within(dialog).getByText(/Shares must add up to ₱1,000\.00/)).toHaveTextContent('Now ₱1,233.33.');

    for (const [name, value] of [['Jomar Bautista', '100'], ['Ana Cruz', '100'], ['Cara Mendoza', '66.68']]) {
      const field = within(dialog).getByLabelText(`Share for ${name}`);
      await user.clear(field);
      await user.type(field, value);
    }
    expect(within(dialog).queryByText(/Shares must add up/)).not.toBeInTheDocument();
    await user.click(save);
    expect(await screen.findByText('Bill saved.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('region', { name: /Electricity/ })).toHaveLength(2));
  });

  it('blocks saving when there are no active renters (SC-40a)', async () => {
    server.use(http.get('*/tenancies', () => HttpResponse.json([])));
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Enter bill' }));
    const dialog = screen.getByRole('dialog', { name: 'Enter bill' });
    expect(await within(dialog).findByText('No active renters to split this bill with.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Total amount/), '1000');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('edits several shares together, blocking a share below what was paid', async () => {
    const user = await setup();
    const sept = bill(/September 2026 Electricity/);
    await user.click(within(sept).getByRole('button', { name: 'Edit shares' }));
    const field = (name: string) => within(sept).getByLabelText(`Share for ${name}`);

    await user.clear(field('Ana Cruz'));
    await user.type(field('Ana Cruz'), '200');
    expect(within(sept).getByRole('button', { name: 'Save shares' })).toBeDisabled();
    await user.clear(field('Ben Dela Rosa'));
    await user.type(field('Ben Dela Rosa'), '400');
    await user.click(within(sept).getByRole('button', { name: 'Save shares' }));
    expect(within(sept).getByText("A share can't be less than what was already paid.")).toBeInTheDocument();

    await user.clear(field('Ana Cruz'));
    await user.type(field('Ana Cruz'), '300');
    await user.clear(field('Ben Dela Rosa'));
    await user.type(field('Ben Dela Rosa'), '250');
    await user.clear(field('Cara Mendoza'));
    await user.type(field('Cara Mendoza'), '350');
    await user.click(within(sept).getByRole('button', { name: 'Save shares' }));
    expect(await screen.findByText('Shares saved.')).toBeInTheDocument();
    await waitFor(() => expect(rowOf(bill(/September 2026 Electricity/), 'Cara Mendoza')).toHaveTextContent('₱350.00'));
  });

  it('opens Record payment prefilled from Mark share paid and marks the share paid (SC-40b)', async () => {
    const user = await setup();
    await user.click(within(rowOf(bill(/September 2026 Electricity/), 'Cara Mendoza')).getByRole('button', { name: 'Mark share paid' }));
    const dialog = screen.getByRole('dialog', { name: 'Record payment' });
    expect(within(dialog).getByLabelText(/Amount/)).toHaveValue('300');
    await user.click(within(dialog).getByRole('button', { name: 'Save payment' }));
    expect(await screen.findByText('Payment recorded.')).toBeInTheDocument();
    await waitFor(() => expect(rowOf(bill(/September 2026 Electricity/), 'Cara Mendoza')).toHaveTextContent('Paid'));
  });

  it('shows ErrorState with Retry when the list fails', async () => {
    mockControl.failNext('GET', '/bills', 500, 'INTERNAL');
    await signIn();
    const user = userEvent.setup();
    renderWithApp(<AdminBillsPage />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
  });

  it('shows the empty state when there are no bills', async () => {
    server.use(http.get('*/bills', () => HttpResponse.json([])));
    await signIn();
    renderWithApp(<AdminBillsPage />);
    expect(await screen.findByText(/No bills yet/)).toBeInTheDocument();
  });
});
