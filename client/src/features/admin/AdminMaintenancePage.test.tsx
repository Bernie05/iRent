import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminMaintenancePage } from './AdminMaintenancePage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { db } from '../../mocks/db';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { renderWithApp } from '../../test/utils';

/** Opens on the Requests tab (`?tab=requests`, the dashboard link); `calendar` opens the default Calendar tab. */
async function setup(tab: 'requests' | 'calendar' = 'requests') {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'admin@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
  renderWithApp(<AdminMaintenancePage />, { route: tab === 'requests' ? '/admin/maintenance?tab=requests' : '/admin/maintenance' });
  if (tab === 'requests') await screen.findByRole('table', { name: 'Maintenance' });
  else await screen.findByRole('grid');
  return userEvent.setup();
}

const table = () => screen.getByRole('table', { name: 'Maintenance' });
const names = () => within(table()).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].querySelector('span span')!.textContent);

describe('AdminMaintenancePage (F42, R75, BR-19, SC-91)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('lists open requests in R75 order (urgent first) and filters by status and category', async () => {
    const user = await setup();
    expect(screen.getByLabelText('Status')).toHaveValue('open');
    expect(names()).toEqual(['Ana Cruz', 'Ben Dela Rosa', 'Ana Cruz']); // urgent plumbing, Wi-Fi (submitted), then the aircon in progress
    expect(within(table()).getAllByRole('row')[1]).toHaveTextContent(/Plumbing.*Urgent.*Submitted/);

    await user.selectOptions(screen.getByLabelText('Status'), 'declined');
    await waitFor(() => expect(names()).toEqual(['Ana Cruz']));
    await user.selectOptions(screen.getByLabelText('Status'), 'all');
    await user.selectOptions(screen.getByLabelText('Category'), 'other');
    await waitFor(() => expect(names()).toEqual(['Gil Navarro']));
  });

  it('opens a request: renter link, photos, only the allowed actions; Start with a note, then Mark done (no more actions)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Open Plumbing request from Ana Cruz' }));
    const dialog = await screen.findByRole('dialog', { name: 'Plumbing request from Ana Cruz' });
    expect(within(dialog).getByRole('link', { name: 'Ana Cruz' })).toHaveAttribute('href', '/admin/renters/usr-ana');
    expect(await within(dialog).findAllByRole('img', { name: /^Photo \d of 2$/ })).toHaveLength(2);
    expect(within(dialog).getAllByRole('button', { name: /^(Start|Mark done|Decline)$/ }).map((b) => b.textContent)).toEqual(['Start', 'Mark done', 'Decline']);

    await user.type(within(dialog).getByLabelText('Note to renter'), 'Plumber on Thursday');
    await user.click(within(dialog).getByRole('button', { name: 'Start' }));
    expect(await screen.findByText('Status changed to In progress.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Mark done' }));
    expect(await screen.findByText('Status changed to Done.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^(Start|Mark done|Decline)$/ })).not.toBeInTheDocument();
  });

  it('Decline asks for a reason in a stacked dialog (E70)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Open Wi-Fi request from Ben Dela Rosa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Wi-Fi request from Ben Dela Rosa' });
    await user.click(within(dialog).getByRole('button', { name: 'Decline' }));
    const reasonDialog = await screen.findByRole('dialog', { name: 'Decline this request?' });
    await user.click(within(reasonDialog).getByRole('button', { name: 'Decline' }));
    expect(await within(reasonDialog).findByText('Enter a reason of 1 to 500 characters.')).toBeInTheDocument();
    await user.type(within(reasonDialog).getByLabelText(/Reason/), 'Wi-Fi provider outage');
    await user.click(within(reasonDialog).getByRole('button', { name: 'Decline' }));
    expect(await screen.findByText('Status changed to Declined.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Decline this request?' })).not.toBeInTheDocument();
  });

  it('a 409 closes the request with a toast and the list refetches', async () => {
    const user = await setup();
    mockControl.failNext('PATCH', '/maintenance-requests/mr-2', 409, 'INVALID_STATUS_CHANGE');
    await user.click(screen.getByRole('button', { name: 'Open Aircon request from Ana Cruz' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Mark done' }));
    expect(await screen.findByText('This request changed meanwhile, so the list was refreshed.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('AdminMaintenancePage — Calendar tab and "Schedule fix"', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('opens on the Calendar with maintenance items only (no legend, no renter items) and a Requests tab with the open count', async () => {
    const user = await setup('calendar');
    expect(screen.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tab', { name: 'Requests (3 open)' })).toBeInTheDocument();
    const grid = screen.getByRole('grid');
    await waitFor(() => expect(grid).toHaveTextContent('Water interruption: tank repair'));
    expect(grid).toHaveTextContent('Aircon repair: Ana Cruz');
    expect(grid).not.toHaveTextContent('Payment follow-up'); // renter items stay on Inquiries
    expect(screen.queryByRole('list', { name: 'Calendar legend' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Fix for a renter request').length).toBeGreaterThan(0); // ev-6 is linked to mr-2

    await user.click(screen.getByRole('tab', { name: 'Requests (3 open)' }));
    expect(await screen.findByRole('table', { name: 'Maintenance' })).toBeInTheDocument();
  });

  it('adds a maintenance item with "Post to renters" on by default (note + end time needed, email off), then deletes it with its notice', async () => {
    const user = await setup('calendar');
    await user.click(screen.getByRole('button', { name: 'Add schedule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add maintenance' });
    expect(within(dialog).queryByRole('radio')).not.toBeInTheDocument(); // one type: no type switch
    expect(within(dialog).getByRole('switch', { name: 'Post to renters' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Also email renters' })).not.toBeChecked();
    await user.type(within(dialog).getByLabelText(/^Title/), 'Water tank cleaning');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Add a note. Renters see it as the message.')).toBeInTheDocument();
    expect(within(dialog).getByText('Pick an end time. Renters see the time window.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Note/), 'No water from 10 to 11.');
    await user.selectOptions(within(dialog).getByLabelText(/^End time/), '11:00');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Added to the schedule. Renters see it on their Home.')).toBeInTheDocument();
    const event = db.scheduleEvents.find((e) => e.title === 'Water tank cleaning')!;
    expect(event.type).toBe('other');
    expect(db.announcements.find((a) => a.id === event.announcement_id)).toMatchObject({ kind: 'maintenance', start_time: '10:00', end_time: '11:00', emailed_at: null });

    // Today is selected, so the side panel (and the agenda) list it with Edit and Delete.
    await user.click((await screen.findAllByRole('button', { name: 'Edit Water tank cleaning' }))[0]);
    const edit = await screen.findByRole('dialog', { name: 'Edit maintenance' });
    await user.click(within(edit).getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getAllByRole('button', { name: 'Delete Water tank cleaning' })[0]);
    const confirm = screen.getByRole('dialog', { name: 'Are you sure you want to delete this?' });
    expect(confirm).toHaveTextContent('This also removes the renter notice.');
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(db.scheduleEvents.some((e) => e.id === event.id)).toBe(false));
    expect(db.announcements.some((a) => a.schedule_event_id === event.id)).toBe(false);
  });

  it('"Schedule fix" from a request: prefilled (posting off), saves a linked item, the request moves to In progress and shows the date', async () => {
    const user = await setup();
    // mr-2 already has a fix (ev-6): its date shows and there is no Schedule fix.
    await user.click(screen.getByRole('button', { name: 'Open Aircon request from Ana Cruz' }));
    let detail = await screen.findByRole('dialog', { name: 'Aircon request from Ana Cruz' });
    expect(detail).toHaveTextContent(/Fix scheduled: .*9:00/);
    expect(within(detail).queryByRole('button', { name: 'Schedule fix' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Open Plumbing request from Ana Cruz' }));
    detail = await screen.findByRole('dialog', { name: 'Plumbing request from Ana Cruz' });
    await user.click(within(detail).getByRole('button', { name: 'Schedule fix' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add maintenance' });
    expect(screen.queryByRole('dialog', { name: 'Plumbing request from Ana Cruz' })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Title/)).toHaveValue('Plumbing fix: Ana Cruz');
    expect(within(dialog).getByLabelText(/^Note/)).toHaveValue(db.maintenance.find((m) => m.id === 'mr-1')!.description);
    expect(within(dialog).getByRole('switch', { name: 'Post to renters' })).not.toBeChecked(); // the note is the renter's own text
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Added to the schedule.')).toBeInTheDocument();
    await waitFor(() => expect(db.maintenance.find((m) => m.id === 'mr-1')!.status).toBe('in_progress'));
    expect(db.scheduleEvents.find((e) => e.maintenance_request_id === 'mr-1')).toMatchObject({ type: 'other', announcement_id: null });

    await user.click(await screen.findByRole('button', { name: 'Open Plumbing request from Ana Cruz' }));
    detail = await screen.findByRole('dialog', { name: 'Plumbing request from Ana Cruz' });
    await waitFor(() => expect(detail).toHaveTextContent('Fix scheduled:'));
    expect(within(detail).queryByRole('button', { name: 'Schedule fix' })).not.toBeInTheDocument();
  });
});
