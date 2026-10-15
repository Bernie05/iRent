import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PortalHomePage } from './PortalHomePage';
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
    tenancy: {
      id: 'ten-ana',
      bed: { label: 'Lower Bunk A', room: 'Room 1', bunk_type: 'lower', monthly_rate: 450000 },
      move_in: '2026-08-05',
    },
  },
  sessionExpired: false,
};

async function signInAsAna() {
  const { error } = await getSupabase().auth.signInWithPassword({ email: 'ana@irent.test', password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

describe('PortalHomePage (F9, SC-14, SC-15, SC-16)', () => {
  afterEach(async () => {
    await getSupabase().auth.signOut({ scope: 'local' });
    mockControl.reset();
  });

  it('shows the announcements feed, balance card with the credit line, and My Bed', async () => {
    await signInAsAna();
    renderWithApp(<PortalHomePage />, { preloadedState: { auth: anaProfile } });

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Announcements' })).toBeInTheDocument());
    expect(screen.getByText('Water interruption on Saturday')).toBeInTheDocument();
    // Pinned first, then urgent, then newest (R17.1): pinned ann-1, urgent ann-2, the maintenance notice ann-4 (newest),
    // then ann-3 and the schedule-linked notice ann-14, one slide at a time. BR-17: the scheduled ann-5 and the ended ann-6
    // never reach the renter.
    const user = userEvent.setup();
    const slide = () => screen.getByRole('group', { name: /of 5$/ });
    expect(slide()).toHaveAccessibleName('1 of 5');
    expect(slide()).toHaveTextContent('Water interruption on Saturday');
    await user.click(screen.getByRole('button', { name: 'Next announcement' }));
    expect(slide()).toHaveTextContent('New gate code from Monday');
    await user.click(screen.getByRole('button', { name: 'Show announcement 3 of 5' }));
    expect(slide()).toHaveTextContent('Aircon cleaning in all rooms');
    expect(within(slide()).getByText('Maintenance')).toBeInTheDocument(); // R72 badge: wrench icon + text
    expect(slide()).toHaveTextContent(/9:00 AM–5:00 PM/);
    await user.click(screen.getByRole('button', { name: 'Show announcement 4 of 5' }));
    expect(slide()).toHaveTextContent('Welcome to iRent');
    // "Post to renters": the Other schedule item ev-5 shows as a maintenance notice with its time window.
    await user.click(screen.getByRole('button', { name: 'Show announcement 5 of 5' }));
    expect(slide()).toHaveTextContent('Water interruption: tank repair');
    expect(within(slide()).getByText('Maintenance')).toBeInTheDocument();
    expect(slide()).toHaveTextContent(/9:00 AM–12:00 PM/);
    await user.click(screen.getByRole('button', { name: 'Next announcement' })); // wraps
    expect(slide()).toHaveAccessibleName('1 of 5');
    expect(screen.queryByText('Pest control next week')).not.toBeInTheDocument();
    expect(screen.queryByText('Electrical inspection')).not.toBeInTheDocument();

    // Proposed birthday greeting: Ana's fixture birthday is today, {name} filled in, link opens in a new tab.
    expect(screen.getByRole('heading', { name: 'Happy birthday, Ana!' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See your birthday treat/ })).toHaveAttribute('target', '_blank');

    expect(screen.getByText('Credit: ₱500.00, used automatically for your next charge')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Bed' })).toBeInTheDocument();
    expect(screen.getByText('Room 1 – Lower Bunk A')).toBeInTheDocument();
  });

  it('opens the full announcement in a dialog and marks it read once, dropping the unread badge count (R18, D-25)', async () => {
    const user = userEvent.setup();
    await signInAsAna();
    renderWithApp(<PortalHomePage />, { preloadedState: { auth: anaProfile } });

    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument()); // unread badge: ann-1, ann-2, ann-4, ann-14 (ann-3 already read)
    const title = screen.getByRole('button', { name: 'Water interruption on Saturday' });
    await user.click(title);
    const dialog = await screen.findByRole('dialog', { name: 'Water interruption on Saturday' });
    expect(dialog).toHaveTextContent('Please store water the night before.');
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(title).toHaveFocus(); // focus returns to the opener

    // Opening the same one again sends nothing new (no error, count stays).
    await user.click(title);
    await screen.findByRole('dialog');
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('keeps one fixed frame: every slide stays mounted in the same grid cell, only the current one visible (D-25, E67)', async () => {
    const user = userEvent.setup();
    await signInAsAna();
    renderWithApp(<PortalHomePage />, { preloadedState: { auth: anaProfile } });
    await screen.findByRole('group', { name: '1 of 5' });

    const frame = document.getElementById('announcement-slides')!;
    const slides = () => Array.from(frame.children) as HTMLElement[];
    const height = frame.offsetHeight; // happy-dom has no layout: the real-browser check is in QA4; this guards the structure
    expect(slides()).toHaveLength(5);
    expect(slides().filter((el) => el.style.visibility !== 'hidden')).toHaveLength(1);
    expect(slides().filter((el) => el.hasAttribute('inert'))).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Show announcement 3 of 5' })); // the long one with an image
    expect(document.getElementById('announcement-slides')).toBe(frame);
    expect(slides()).toHaveLength(5);
    expect(slides()[2].style.visibility).toBe('');
    expect(slides()[0].style.visibility).toBe('hidden');
    expect(frame.offsetHeight).toBe(height);
  });

  it('shows "Read more" only when the 4-line clamp cuts the body; it opens the dialog (D-25)', async () => {
    // happy-dom has no layout: make every clamped body report overflow.
    const spy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('line-clamp-4') ? 200 : 0;
    });
    const user = userEvent.setup();
    await signInAsAna();
    renderWithApp(<PortalHomePage />, { preloadedState: { auth: anaProfile } });
    const readMore = await within(await screen.findByRole('group', { name: '1 of 5' })).findByRole('button', { name: 'Read more' });
    await user.click(readMore);
    expect(await screen.findByRole('dialog', { name: 'Water interruption on Saturday' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(readMore).toHaveFocus();
    spy.mockRestore();
  });

  it('shows the ErrorState with Retry on a load failure', async () => {
    await signInAsAna();
    mockControl.failNext('GET', '/me/balance', 500, 'INTERNAL');
    renderWithApp(<PortalHomePage />, { preloadedState: { auth: anaProfile } });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('hides My Bed for a moved-out renter (tenancy: null, OQ-22 = A)', async () => {
    await signInAsAna();
    const movedOut: RootState['auth'] = { ...anaProfile, profile: { ...anaProfile.profile!, tenancy: null } };
    renderWithApp(<PortalHomePage />, { preloadedState: { auth: movedOut } });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Announcements' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'My Bed' })).not.toBeInTheDocument();
  });

  it('shows "Owes ₱X" when the credit balance is negative (SC-64)', async () => {
    const { error } = await getSupabase().auth.signInWithPassword({ email: 'hana@irent.test', password: MOCK_PASSWORD });
    expect(error).toBeNull();
    const hanaState: RootState['auth'] = { ...anaProfile, session: { userId: 'usr-hana', email: 'hana@irent.test' }, profile: { ...anaProfile.profile!, id: 'usr-hana', tenancy: null } };
    renderWithApp(<PortalHomePage />, { preloadedState: { auth: hanaState } });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Announcements' })).toBeInTheDocument());
    expect(screen.getByText('Owes ₱250.00')).toBeInTheDocument();
  });
});
