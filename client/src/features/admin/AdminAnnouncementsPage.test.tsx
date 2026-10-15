import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { AdminAnnouncementsPage } from './AdminAnnouncementsPage';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { server } from '../../mocks/node';
import { renderWithApp } from '../../test/utils';
import { addDays, manilaToday } from '../../lib/time';

async function signIn() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'admin@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

async function setup() {
  await signIn();
  renderWithApp(<AdminAnnouncementsPage />);
  await screen.findByText('Water interruption on Saturday');
  return userEvent.setup();
}

// D-31: a stacked table; the first cell starts with the title.
const table = () => screen.getByRole('table', { name: 'Announcements' });
const titles = () => within(table()).getAllByRole('row').slice(1).map((r) => r.querySelector('td span span')!.textContent);
const cardOf = (title: string) => within(table()).getByText(title, { selector: 'span' }).closest('tr')!;

describe('AdminAnnouncementsPage (F21, R41, SC-42, SC-43)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('posts an urgent pinned announcement with email; it comes first with the urgent icon and text (SC-42 step 1)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const dialog = screen.getByRole('dialog', { name: 'New announcement' });
    await user.type(within(dialog).getByLabelText(/Title/), 'Water interruption');
    await user.type(within(dialog).getByLabelText(/Message/), 'No water on Sunday from 8 AM.');
    await user.click(within(dialog).getByRole('radio', { name: 'Urgent' }));
    await user.click(within(dialog).getByLabelText('Pin to the top'));
    await user.click(within(dialog).getByLabelText('Also send by email'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Announcement saved and emailed to renters.')).toBeInTheDocument();
    await waitFor(() => expect(titles()[0]).toBe('Water interruption'));
    const card = cardOf('Water interruption');
    expect(within(card).getByText('Urgent')).toBeInTheDocument();
    expect(within(card).getByText('Pinned')).toBeInTheDocument();
    expect(within(card).getByText(/^Emailed /)).toBeInTheDocument();
  });

  it('edits with "Also send by email" unticked by default and does not email again (SC-42 step 3)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Edit New gate code from Monday' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit announcement' });
    expect(within(dialog).getByLabelText(/Title/)).toHaveValue('New gate code from Monday');
    expect(within(dialog).getByRole('radio', { name: 'Urgent' })).toBeChecked();
    expect(within(dialog).getByLabelText('Also send by email')).not.toBeChecked();
    const body = within(dialog).getByLabelText(/Message/);
    await user.clear(body);
    await user.type(body, 'The code changes on Tuesday instead.');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Announcement saved.')).toBeInTheDocument();
    expect(await screen.findByText('The code changes on Tuesday instead.')).toBeInTheDocument();
  });

  it('deletes after the confirm modal (SC-42 step 4)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Delete Welcome to iRent' }));
    let dialog = screen.getByRole('dialog', { name: 'Are you sure you want to delete this?' });
    expect(dialog).toHaveTextContent('"Welcome to iRent" will be deleted. This can\'t be undone. It will be removed for every renter.');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Welcome to iRent' })).toBeInTheDocument(); // Cancel keeps it

    await user.click(screen.getByRole('button', { name: 'Delete Welcome to iRent' }));
    dialog = screen.getByRole('dialog', { name: 'Are you sure you want to delete this?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Announcement deleted.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete Welcome to iRent' })).not.toBeInTheDocument());
  });

  it('shows inline errors for an empty title and a 7 MB image; nothing is saved (SC-43)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const dialog = screen.getByRole('dialog', { name: 'New announcement' });
    await user.type(within(dialog).getByLabelText(/Message/), 'Body only');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Enter a title of 1 to 120 characters.')).toBeInTheDocument();

    const big = new File([new Uint8Array(7 * 1024 * 1024)], 'notice.png', { type: 'image/png' });
    fireEvent.change(within(dialog).getByLabelText('Image (optional)', { selector: 'input' }), { target: { files: [big] } });
    expect(within(dialog).getByText(/under 5 MB/)).toBeInTheDocument();
    expect(screen.getByText('Showing 1–10 of 14')).toBeInTheDocument();
  });

  it('shows each status as text: Scheduled with the publish time and pending email, Published, Ended (D-25, R41)', async () => {
    await setup();
    expect(cardOf('Pest control next week')).toHaveTextContent(/Scheduled.*Publishes .*8:00/);
    expect(within(cardOf('Pest control next week')).getByText('Email when it publishes')).toBeInTheDocument();
    expect(within(cardOf('Aircon cleaning in all rooms')).getByText('Published')).toBeInTheDocument();
    expect(within(cardOf('Aircon cleaning in all rooms')).getByText('Maintenance notice')).toBeInTheDocument();
    expect(within(cardOf('Electrical inspection')).getByText('Ended')).toBeInTheDocument();
  });

  it('creates a maintenance notice: From/To required, "Whole week" fills To = From + 6, times both or neither (SC-88)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const dialog = screen.getByRole('dialog', { name: 'New announcement' });
    await user.click(within(dialog).getByRole('radio', { name: 'Maintenance notice' }));
    await user.type(within(dialog).getByLabelText(/Title/), 'Water interruption');
    await user.type(within(dialog).getByLabelText(/Message/), 'No water during the day.');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findAllByText('This field is required.')).toHaveLength(2);

    const from = addDays(manilaToday(), 1);
    fireEvent.change(within(dialog).getByLabelText(/^From/), { target: { value: from } });
    await user.click(within(dialog).getByRole('button', { name: 'Whole week' }));
    expect(within(dialog).getByLabelText(/^To/)).toHaveValue(addDays(from, 6));
    fireEvent.change(within(dialog).getByLabelText(/Daily start time/), { target: { value: '09:00' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Enter both times, or neither.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Daily end time/), { target: { value: '17:00' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Announcement saved.')).toBeInTheDocument();
    await waitFor(() => expect(cardOf('Water interruption')).toHaveTextContent(/Maintenance.*9:00 AM–5:00 PM/));
  });

  it('schedules an announcement: the email box says "when it publishes", the card says Scheduled (SC-89)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const dialog = screen.getByRole('dialog', { name: 'New announcement' });
    await user.type(within(dialog).getByLabelText(/Title/), 'Fire drill');
    await user.type(within(dialog).getByLabelText(/Message/), 'Short drill on Friday morning.');
    fireEvent.change(within(dialog).getByLabelText(/Publish at/), { target: { value: `${addDays(manilaToday(), 2)}T08:00` } });
    await user.click(within(dialog).getByLabelText('Email renters when it publishes'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Announcement scheduled.')).toBeInTheDocument();
    await waitFor(() => expect(cardOf('Fire drill')).toHaveTextContent(/Scheduled.*Publishes/));
    expect(within(cardOf('Fire drill')).getByText('Email when it publishes')).toBeInTheDocument();
    expect(within(cardOf('Fire drill')).queryByText(/^Emailed /)).not.toBeInTheDocument();

    // A past Publish at is refused client-side.
    await user.click(screen.getByRole('button', { name: 'New announcement' }));
    const again = screen.getByRole('dialog', { name: 'New announcement' });
    await user.type(within(again).getByLabelText(/Title/), 'Late');
    await user.type(within(again).getByLabelText(/Message/), 'Body');
    fireEvent.change(within(again).getByLabelText(/Publish at/), { target: { value: `${addDays(manilaToday(), -1)}T08:00` } });
    await user.click(within(again).getByRole('button', { name: 'Save' }));
    expect(await within(again).findByText('Choose a time in the future, or leave it empty to publish now.')).toBeInTheDocument();
  });

  it('custom order: Move up/down within the group, saved at once, announced, focus kept (D-30, SC-95 steps 1–2)', async () => {
    const user = await setup();
    expect(screen.getByRole('radio', { name: 'Custom order' })).toBeChecked();
    expect(within(table()).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Title', 'Type', 'Status', 'Publish date', 'Pinned', 'Order', 'Actions']);
    // The only pinned post can't move; the urgent post is the top of the unpinned group (urgent no longer jumps ahead).
    expect(screen.getByRole('button', { name: 'Move Water interruption on Saturday up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Water interruption on Saturday down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move New gate code from Monday up' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move New gate code from Monday down' }));
    await waitFor(() => expect(titles().slice(0, 3)).toEqual(['Water interruption on Saturday', 'Pest control next week', 'New gate code from Monday']));
    expect(screen.getByText('Moved New gate code from Monday to position 3 of 14')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move New gate code from Monday down' })).toHaveFocus());
  });

  it('drags a row within its group; never across the pinned / unpinned line (SC-95 step 3)', async () => {
    await setup();
    fireEvent.dragStart(cardOf('Aircon cleaning in all rooms'));
    fireEvent.dragOver(cardOf('New gate code from Monday'));
    fireEvent.drop(cardOf('New gate code from Monday'));
    await waitFor(() => expect(titles().slice(1, 3)).toEqual(['Aircon cleaning in all rooms', 'New gate code from Monday']));

    fireEvent.dragStart(cardOf('Aircon cleaning in all rooms'));
    fireEvent.drop(cardOf('Water interruption on Saturday')); // pinned group: ignored
    expect(titles()[0]).toBe('Water interruption on Saturday');
  });

  it('rolls back with a toast when the list changed meanwhile (E75)', async () => {
    const user = await setup();
    mockControl.failNext('PUT', '/announcements/order', 400, 'VALIDATION_ERROR');
    await user.click(screen.getByRole('button', { name: 'Move New gate code from Monday down' }));
    expect(await screen.findByText('The list changed, so it was refreshed. Please try again.')).toBeInTheDocument();
    await waitFor(() => expect(titles()[1]).toBe('New gate code from Monday'));
  });

  it('Newest and Priority are admin views without order controls; Custom order comes back unchanged (E77)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('radio', { name: 'Newest' }));
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument();
    expect(titles()[0]).toBe('Pest control next week'); // publishes in 3 days
    await user.click(screen.getByRole('radio', { name: 'Priority' }));
    expect(titles()[0]).toBe('New gate code from Monday'); // urgent first
    await user.click(screen.getByRole('radio', { name: 'Custom order' }));
    expect(titles().slice(0, 2)).toEqual(['Water interruption on Saturday', 'New gate code from Monday']);
  });

  it('renders HTML in the body as plain text (no XSS)', async () => {
    const html = '<img src=x onerror="alert(1)"><b>bold</b>';
    server.use(
      http.get('*/announcements', () =>
        HttpResponse.json([{ id: 'ann-x', title: 'Script test', body: html, image_url: null, priority: 'normal', pinned: false, emailed_at: null, created_at: '2026-09-30T00:00:00Z', updated_at: '2026-09-30T00:00:00Z' }]),
      ),
    );
    await signIn();
    renderWithApp(<AdminAnnouncementsPage />);
    const body = await screen.findByText(html);
    expect(body.querySelector('img, b')).toBeNull();
  });

  it('shows the empty state, and ErrorState with Retry', async () => {
    server.use(http.get('*/announcements', () => HttpResponse.json([])));
    await signIn();
    const { unmount } = renderWithApp(<AdminAnnouncementsPage />);
    expect(await screen.findByText(/No announcements yet/)).toBeInTheDocument();
    unmount();
    server.resetHandlers();

    mockControl.failNext('GET', '/announcements', 500, 'INTERNAL');
    const user = userEvent.setup();
    renderWithApp(<AdminAnnouncementsPage />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Water interruption on Saturday')).toBeInTheDocument();
  });
});
