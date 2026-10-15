import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PortalBillsPage } from './PortalBillsPage';
import { PortalPayPage } from './PortalPayPage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { renderWithApp } from '../../test/utils';
import { AppProviders } from '../../app/AppProviders';
import { makeStore } from '../../app/store';
import { createI18n } from '../../i18n';
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
    tenancy: { id: 'ten-ben', bed: { label: 'Bed 2', room: 'Room 2', bunk_type: 'upper', monthly_rate: 400000 }, move_in: '2026-07-20' },
  },
  sessionExpired: false,
};

async function signInAsBen() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'ben@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

describe('PortalBillsPage (F11, R25)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('lists bill shares with status, amount and a Pay button (SC-17)', async () => {
    await signInAsBen();
    renderWithApp(<PortalBillsPage />, { preloadedState: { auth: benProfile } });

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Bills' })).toBeInTheDocument());
    // D-31: a stacked table (bill, period, share, paid, status + remaining/due); Pay only on open shares, named per share.
    const table = screen.getByRole('table', { name: 'Bills' });
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Bill', 'Period', 'Share', 'Paid', 'Status', 'Pay']);
    expect(within(table).getByText('September 2026').closest('td')).toHaveAttribute('data-label', 'Period');
    expect(screen.getByRole('button', { name: 'Pay September 2026 Electricity bill' })).toBeInTheDocument();
  });

  it('Pay navigates to Pay Rent with the share preselected (SC-24)', async () => {
    const user = userEvent.setup();
    await signInAsBen();
    const store = makeStore({ auth: benProfile });
    const i18n = createI18n('en');
    render(
      <AppProviders store={store} i18n={i18n}>
        <MemoryRouter initialEntries={['/portal/bills']}>
          <Routes>
            <Route path="/portal/bills" element={<PortalBillsPage />} />
            <Route path="/portal/pay" element={<PortalPayPage />} />
          </Routes>
        </MemoryRouter>
      </AppProviders>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Pay September 2026 Electricity bill' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Pay September 2026 Electricity bill' }));
    // The electricity share (₱300 remaining) is preselected in Pay Rent's amount field.
    await waitFor(() => expect(screen.getByLabelText(/Amount/)).toHaveValue(300));
  });

  it('shows the empty state when the renter has no bill shares', async () => {
    const { error } = await getSupabase().auth.signInWithPassword({ email: 'hana@irent.test', password: MOCK_PASSWORD });
    expect(error).toBeNull();
    const hanaState: RootState['auth'] = { ...benProfile, session: { userId: 'usr-hana', email: 'hana@irent.test' }, profile: { ...benProfile.profile!, id: 'usr-hana' } };
    renderWithApp(<PortalBillsPage />, { preloadedState: { auth: hanaState } });
    await waitFor(() => expect(screen.getByText('No bills yet.')).toBeInTheDocument());
  });

  it('shows the ErrorState with Retry on a load failure', async () => {
    await signInAsBen();
    mockControl.failNext('GET', '/me/bills', 500, 'INTERNAL');
    renderWithApp(<PortalBillsPage />, { preloadedState: { auth: benProfile } });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
