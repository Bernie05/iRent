import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { addDays, manilaToday } from '../../lib/time';
import { db } from '../../mocks/db';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { AdminInquiriesPage } from './AdminInquiriesPage';
import { AdminLayout } from '../../app/shells/AdminLayout';
import { getSupabase } from '../../lib/supabase';
import { mockControl } from '../../mocks/control';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { server } from '../../mocks/node';
import { renderWithApp } from '../../test/utils';

async function signIn() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'admin@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

/** Rendered inside the admin shell so the sidebar badge (R40) is observable. */
async function setup() {
  await signIn();
  renderWithApp(
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="*" element={<AdminInquiriesPage />} />
      </Route>
    </Routes>,
    { route: '/admin/inquiries' },
  );
  await screen.findByText('Maria Santos');
  return userEvent.setup();
}

const card = (name: string) => screen.getByRole('article', { name });
const badge = () => screen.getAllByRole('link', { name: /Inquiries/ })[0];

describe('AdminInquiriesPage (F20, R40, SC-41)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('lists newest first with tel: links and status chip counts', async () => {
    await setup();
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Maria Santos', 'Jose Ramos', 'Liza Garcia', 'Paolo Reyes', 'Grace Tan']);
    expect(within(card('Jose Ramos')).getByRole('link', { name: '+639189876543' })).toHaveAttribute('href', 'tel:+639189876543');
    expect(screen.getByRole('button', { name: 'New (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contacted (1)' })).toBeInTheDocument();
  });

  it('changes a status optimistically and the new badge goes from 2 to 1 (SC-41 step 2)', async () => {
    const user = await setup();
    await waitFor(() => expect(badge()).toHaveTextContent('2'));
    await user.selectOptions(within(card('Maria Santos')).getByLabelText('Status'), 'scheduled');
    expect(within(card('Maria Santos')).getByText('Scheduled', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New (1)' })).toBeInTheDocument();
    expect(await screen.findByText('Status updated.')).toBeInTheDocument();
    await waitFor(() => expect(badge()).toHaveTextContent('1'));
  });

  it('rolls the status back when the save fails', async () => {
    const user = await setup();
    mockControl.failNext('PATCH', '/inquiries/inq-1', 500, 'INTERNAL');
    await user.selectOptions(within(card('Maria Santos')).getByLabelText('Status'), 'closed');
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    await waitFor(() => expect(within(card('Maria Santos')).getByLabelText('Status')).toHaveValue('new'));
  });

  it('filters by chip and shows the filtered empty state (SC-41 step 3)', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Contacted (1)' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Closed (0)' }));
    expect(screen.getByText('No closed inquiries.')).toBeInTheDocument();
  });

  it('wraps long messages instead of overflowing (E19)', async () => {
    const long = 'x'.repeat(600);
    server.use(
      http.get('*/inquiries', () =>
        HttpResponse.json([{ id: 'inq-9', name: 'Long Message', phone: '09170000000', email: null, preferred_date: null, message: long, status: 'new', created_at: '2026-09-30T00:00:00Z', updated_at: '2026-09-30T00:00:00Z' }]),
      ),
    );
    await signIn();
    renderWithApp(<AdminInquiriesPage />);
    expect(await screen.findByText(long)).toHaveClass('break-words');
  });

  it('shows the empty state, and ErrorState with Retry', async () => {
    server.use(http.get('*/inquiries', () => HttpResponse.json([])));
    await signIn();
    const { unmount } = renderWithApp(<AdminInquiriesPage />);
    expect(await screen.findByText(/No inquiries yet/)).toBeInTheDocument();
    unmount();
    server.resetHandlers();

    mockControl.failNext('GET', '/inquiries', 500, 'INTERNAL');
    const user = userEvent.setup();
    renderWithApp(<AdminInquiriesPage />);
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
  });
});

describe('AdminInquiriesPage — viewings (schedule, calendar)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('schedules from a card: no-email hint, clash warning, toast says who was emailed; then reschedule and cancel', async () => {
    const user = await setup();
    // Jose has no email: the modal says to call or text.
    await user.click(within(card('Jose Ramos')).getByRole('button', { name: 'Schedule a viewing for Jose Ramos' }));
    let dialog = await screen.findByRole('dialog', { name: 'Schedule a viewing with Jose Ramos' });
    expect(dialog).toHaveTextContent('No email on file. Call or text +639189876543 to confirm the viewing.');
    expect(within(dialog).getByRole('link', { name: '+639189876543' })).toHaveAttribute('href', 'tel:+639189876543');

    // Same slot as Paolo's seeded viewing (today + 2, 10:00): a warning, not a block.
    const paoloDate = addDays(manilaToday(), 2);
    fireEvent.change(within(dialog).getByLabelText(/^Date/), { target: { value: paoloDate } });
    await user.selectOptions(within(dialog).getByLabelText(/^Time/), '10:00');
    expect(dialog).toHaveTextContent('Another viewing is at this time: Paolo Reyes. You can still save.');
    await user.selectOptions(within(dialog).getByLabelText(/^Time/), '14:30');
    expect(dialog).not.toHaveTextContent('Another viewing is at this time');
    await user.click(within(dialog).getByRole('button', { name: 'Schedule viewing' }));
    expect(await screen.findByText('Viewing scheduled. Email sent: confirmation to admin (visitor has no email).')).toBeInTheDocument();
    await waitFor(() => expect(card('Jose Ramos')).toHaveTextContent(/Viewing: .*2:30/));

    // Reschedule (Paolo has an email: both are emailed).
    await user.click(within(card('Paolo Reyes')).getByRole('button', { name: 'Reschedule the viewing of Paolo Reyes' }));
    dialog = await screen.findByRole('dialog', { name: 'Reschedule the viewing with Paolo Reyes' });
    expect(within(dialog).getByLabelText(/^Time/)).toHaveValue('10:00');
    await user.selectOptions(within(dialog).getByLabelText(/^Time/), '11:30');
    await user.click(within(dialog).getByRole('button', { name: 'Save new time' }));
    expect(await screen.findByText('Viewing moved. Emails sent: confirmation to visitor and admin.')).toBeInTheDocument();

    // Cancel with the shared confirmation; "Keep viewing" keeps it.
    await user.click(within(card('Paolo Reyes')).getByRole('button', { name: 'Cancel the viewing of Paolo Reyes' }));
    let confirm = screen.getByRole('dialog', { name: 'Cancel this viewing?' });
    expect(within(confirm).getByRole('button', { name: 'Keep viewing' })).toHaveFocus();
    await user.click(within(confirm).getByRole('button', { name: 'Keep viewing' }));
    expect(card('Paolo Reyes')).toHaveTextContent('Viewing:');
    await user.click(within(card('Paolo Reyes')).getByRole('button', { name: 'Cancel the viewing of Paolo Reyes' }));
    confirm = screen.getByRole('dialog', { name: 'Cancel this viewing?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel viewing' }));
    expect(await screen.findByText('Viewing cancelled. Emails sent: cancellation to visitor and admin.')).toBeInTheDocument();
    await waitFor(() => expect(within(card('Paolo Reyes')).getByText('Contacted', { selector: 'span' })).toBeInTheDocument());
  });

  it('calendar side panel lists only open, unscheduled inquiries; Schedule works from it; Show highlights the preferred day', async () => {
    const user = await setup();
    await user.click(screen.getByRole('radio', { name: 'Calendar' }));
    const tab = screen.getByRole('tab', { name: 'Inquiries (3)' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    const names = within(panel).getAllByRole('listitem').map((li) => li.querySelector('.type-body-s-strong')!.textContent);
    expect(names).toEqual(['Maria Santos', 'Jose Ramos', 'Liza Garcia']); // newest first; Paolo and Grace are scheduled
    expect(within(panel).getAllByText('Message', { selector: 'summary' })).toHaveLength(2); // Maria and Liza left a message

    await user.click(within(panel).getByRole('button', { name: 'Show the preferred date of Maria Santos on the calendar' }));
    const grid = screen.getByRole('grid');
    expect(within(grid).getByRole('button', { name: /October 5, 2026.*preferred date of the selected inquiry/ })).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Schedule a viewing for Jose Ramos' }));
    const dialog = await screen.findByRole('dialog', { name: 'Schedule a viewing with Jose Ramos' });
    await user.click(within(dialog).getByRole('button', { name: 'Schedule viewing' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Inquiries (2)' })).toBeInTheDocument());
    expect(within(screen.getByRole('tabpanel')).queryByText('Jose Ramos')).not.toBeInTheDocument();

    // Selecting a day switches to "Selected day", with a way back.
    within(grid).getAllByRole('button')[10].focus();
    await user.keyboard('{Enter}'); // keyboard activation only selects the day (a mouse click on an empty day opens Add)
    expect(screen.getByRole('tab', { name: 'Selected day' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: 'Back to inquiries' }));
    expect(screen.getByRole('tab', { name: 'Inquiries (2)' })).toHaveAttribute('aria-selected', 'true');
  });

  it('calendar: marks days, labels them for screen readers, and moves with the arrow keys', async () => {
    const user = await setup();
    await user.click(screen.getByRole('radio', { name: 'Calendar' }));
    const grid = screen.getByRole('grid');
    const today = manilaToday();
    const day = (d: string) => within(grid).getAllByRole('button').find((b) => b.getAttribute('aria-label')!.startsWith(new Intl.DateTimeFormat('en-PH', { dateStyle: 'full', timeZone: 'Asia/Manila' }).format(new Date(`${d}T00:00:00+08:00`))))!;

    expect(day(today)).toHaveAttribute('aria-label', expect.stringContaining('Today'));
    expect(day(today)).toHaveAttribute('tabindex', '0');
    const paolo = addDays(today, 2);
    if (paolo.slice(0, 7) === today.slice(0, 7)) {
      expect(day(paolo)).toHaveAttribute('aria-label', expect.stringContaining('1 viewing'));
      expect(day(paolo)).toHaveTextContent('10:00 AM Paolo');
    }

    day(today).focus();
    await user.keyboard('{ArrowRight}');
    const tomorrow = addDays(today, 1);
    expect(document.activeElement!.getAttribute('aria-label')).toContain(new Intl.DateTimeFormat('en-PH', { dateStyle: 'full', timeZone: 'Asia/Manila' }).format(new Date(`${tomorrow}T00:00:00+08:00`)));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement!.getAttribute('aria-label')).toContain(new Intl.DateTimeFormat('en-PH', { dateStyle: 'full', timeZone: 'Asia/Manila' }).format(new Date(`${addDays(tomorrow, 7)}T00:00:00+08:00`)));
    await user.keyboard('{Enter}');
    expect(document.activeElement!.closest('td')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('AdminInquiriesPage — admin schedule (renter items; maintenance lives on the Maintenance page)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  async function openCalendar() {
    const user = await setup();
    await user.click(screen.getByRole('radio', { name: 'Calendar' }));
    return user;
  }

  /** Selects today's cell with the keyboard (which only selects; a mouse click on an empty day opens Add). */
  async function selectToday(user: ReturnType<typeof userEvent.setup>) {
    const grid = screen.getByRole('grid');
    const todayBtn = within(grid).getAllByRole('button').find((b) => b.getAttribute('aria-label')!.includes('Today'))!;
    todayBtn.focus();
    await user.keyboard('{Enter}');
  }

  it('shows viewings and renter items with a legend and icons; maintenance items are not on Inquiries', async () => {
    const user = await openCalendar();
    const legend = screen.getByRole('list', { name: 'Calendar legend' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Viewing', 'Renter']);
    const grid = screen.getByRole('grid');
    await waitFor(() => expect(grid).toHaveTextContent('Payment follow-up: Jomar Bautista'));
    expect(grid).not.toHaveTextContent('Water interruption'); // ev-5 (maintenance) shows on the Maintenance page only
    // Today's cell is named with its schedule items too.
    const todayBtn = within(grid).getAllByRole('button').find((b) => b.getAttribute('aria-label')!.includes('Today'))!;
    expect(todayBtn.getAttribute('aria-label')).toContain('1 schedule item');

    await selectToday(user);
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText(/5:00 PM · Payment follow-up: Jomar Bautista/)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Edit Payment follow-up: Jomar Bautista' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /Add schedule on/ })).toBeInTheDocument();
  });

  it('a Renter item drafts its title from purpose + renter and emails the renter only when opted in', async () => {
    const user = await openCalendar();
    db.outbox = [];
    await user.click(screen.getByRole('button', { name: 'Add schedule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add schedule' });
    expect(within(dialog).getByRole('radio', { name: 'Renter' })).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Viewing', 'Renter']); // no Maintenance/Other here
    expect(within(dialog).queryByRole('switch', { name: 'Post to renters' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('combobox', { name: /Full name/ }));
    await user.click(await within(dialog).findByRole('option', { name: /Ana Cruz/ }));
    await user.selectOptions(within(dialog).getByLabelText(/^Purpose/), 'inspection');
    expect(within(dialog).getByLabelText(/^Title/)).toHaveValue('Inspection: Ana Cruz');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Email the renter' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Added to the schedule. Email sent to the renter.')).toBeInTheDocument();
    expect(db.outbox).toEqual([expect.objectContaining({ to: 'ana@irent.test', template: 'event_confirmation' })]);
  });

  it('a mouse click on an empty day opens Add schedule with that date', async () => {
    const user = await openCalendar();
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    const grid = screen.getByRole('grid');
    // The 15th of next month has nothing on it in the seed (seeded items are within 8 days of today).
    const target = within(grid).getAllByRole('button').filter((b) => !b.className.includes('opacity-50'))[14];
    await user.click(target);
    const dialog = await screen.findByRole('dialog', { name: 'Add schedule' });
    expect((within(dialog).getByLabelText(/^Date/) as HTMLInputElement).value.slice(8)).toBe('15');
  });
});
