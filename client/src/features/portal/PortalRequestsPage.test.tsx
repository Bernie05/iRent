import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalRequestsPage } from './PortalRequestsPage';
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
    tenancy: { id: 'ten-ana', bed: { label: 'Lower Bunk A', room: 'Room 1', bunk_type: 'lower', monthly_rate: 4500 }, move_in: '2026-08-05' },
  },
  sessionExpired: false,
};

async function signIn(email = 'ana@irent.test') {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

const photo = (name: string, type = 'image/jpeg', bytes = 2048) => new File([new Uint8Array(bytes)], name, { type });

describe('PortalRequestsPage (F41, R74, SC-90)', () => {
  let n = 0;
  beforeEach(() => {
    // happy-dom: preview URLs for the chosen photos.
    URL.createObjectURL = vi.fn(() => `blob:preview-${(n += 1)}`);
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('lists own requests newest first with status, the owner note and the decline reason; a row opens the photos', async () => {
    const user = userEvent.setup();
    await signIn();
    renderWithApp(<PortalRequestsPage />, { preloadedState: { auth: anaProfile } });

    const table = await screen.findByRole('table', { name: 'My requests' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].querySelector('span span')!.textContent)).toEqual(['Plumbing', 'Aircon', 'Wi-Fi', 'Electrical']);
    expect(rows[0]).toHaveTextContent('Submitted');
    expect(rows[1]).toHaveTextContent('In progress');
    expect(rows[1]).toHaveTextContent('Note from the owner: The technician is booked. Please leave the room open that morning.');
    // The admin's "Schedule fix" (ev-6, 5 days from today, 9:00 AM) shows its date on the request.
    expect(rows[1]).toHaveTextContent(/Fix scheduled: .*9:00/);
    expect(rows[0]).not.toHaveTextContent('Fix scheduled');
    expect(rows[2]).toHaveTextContent('Declined');
    expect(rows[2]).toHaveTextContent('Reason: The internet provider had an area outage that day; nothing to fix in the unit.');
    expect(rows[3]).toHaveTextContent('Done');

    await user.click(within(rows[0]).getByRole('button', { name: /^View Plumbing request from / }));
    const dialog = await screen.findByRole('dialog', { name: 'Plumbing' });
    expect(dialog).toHaveTextContent('The sink in Room A leaks under the cabinet.');
    expect(await within(dialog).findAllByRole('img', { name: /^Photo \d of 2$/ })).toHaveLength(2);
  });

  it('sends a request with photos (previews, Remove), then lists it as Submitted', async () => {
    const user = userEvent.setup();
    await signIn();
    renderWithApp(<PortalRequestsPage />, { preloadedState: { auth: anaProfile } });

    await user.selectOptions(await screen.findByLabelText(/Category/), 'electrical');
    await user.click(screen.getByRole('radio', { name: 'Urgent' }));
    await user.type(screen.getByLabelText(/Description/), 'No power in the outlet beside the desk.');
    await user.upload(screen.getByLabelText('Photos (optional)'), [photo('outlet.jpg'), photo('desk.png', 'image/png')]);
    expect(screen.getAllByRole('img', { name: /^Photo \d of 2$/ })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Remove desk.png' }));
    expect(screen.getAllByRole('img', { name: 'Photo 1 of 1' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText("Request sent. We'll update you here.")).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'My requests' });
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent(/Electrical.*Urgent.*Submitted/));
    expect(screen.getByLabelText(/Description/)).toHaveValue(''); // the form is cleared after sending
  });

  it('validates on the client (category, 10+ characters, at most 3 photos, type) and keeps the data on a 429', async () => {
    const user = userEvent.setup();
    await signIn();
    renderWithApp(<PortalRequestsPage />, { preloadedState: { auth: anaProfile } });

    await user.type(await screen.findByLabelText(/Description/), 'Leak');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Describe the problem in 10 to 1,000 characters.')).toBeInTheDocument();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0); // errors are announced

    const input = screen.getByLabelText('Photos (optional)');
    await user.upload(input, [photo('1.jpg'), photo('2.jpg'), photo('3.jpg'), photo('4.jpg')]);
    expect(screen.getByText('You can add up to 3 photos.')).toBeInTheDocument();
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    await user.upload(input, [photo('big.jpg', 'image/jpeg', 6 * 1024 * 1024)]);
    expect(screen.getByText('Each photo must be a JPG, PNG or WebP image under 5 MB.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Category/), 'plumbing');
    await user.type(screen.getByLabelText(/Description/), ' under the sink, all day');
    mockControl.failNext('POST', '/me/maintenance-requests', 429, 'RATE_LIMITED');
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText("You've sent several requests today. Please wait or message the owner.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/)).toHaveValue('Leak under the sink, all day');
  });

  it('a moved-out renter sees past requests and no form (OQ-32, E69)', async () => {
    await signIn('gil@irent.test');
    const gil: RootState['auth'] = { ...anaProfile, session: { userId: 'usr-gil', email: 'gil@irent.test' }, profile: { ...anaProfile.profile!, id: 'usr-gil', tenancy: null } };
    renderWithApp(<PortalRequestsPage />, { preloadedState: { auth: gil } });
    expect(await screen.findByText('You can send requests while you rent a bed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
    expect(await screen.findByText('Other')).toBeInTheDocument();
  });

  it('shows the ErrorState with Retry on a load failure', async () => {
    await signIn();
    mockControl.failNext('GET', '/me/maintenance-requests', 500, 'INTERNAL');
    renderWithApp(<PortalRequestsPage />, { preloadedState: { auth: anaProfile } });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
