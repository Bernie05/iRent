import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicHomePage } from './PublicHomePage';
import { PublicNavbar } from '../../app/shells/PublicNavbar';
import { ViewingModalProvider } from './ViewingModal';
import { server } from '../../mocks/node';
import { renderWithApp } from '../../test/utils';

/** Navbar + page under the modal provider, as PublicLayout renders them. */
const renderPublic = () =>
  renderWithApp(
    <ViewingModalProvider>
      <PublicNavbar />
      <PublicHomePage />
    </ViewingModalProvider>,
  );

describe('PublicHomePage (F6, SC-1)', () => {
  it('renders the hero, amenities, unit, location and footer sections', () => {
    renderPublic();
    expect(screen.getByRole('heading', { level: 1, name: 'Bedspace for rent at DECA Homes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Amenities' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Unit' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Location' })).toBeInTheDocument();
    expect(screen.getByTitle('DECA Homes location map')).toBeInTheDocument();
  });

});

describe('Amenity photos (R3)', () => {
  it('a card shows its photo count and opens the amenity photos in the lightbox, returning focus on close', async () => {
    const user = userEvent.setup();
    renderPublic();
    const pool = screen.getByRole('button', { name: 'Pool, 4 photos' });
    await user.click(pool);
    const dialog = screen.getByRole('dialog', { name: 'Pool' });
    expect(within(dialog).getByText('Photo 1 of 4')).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'Pool with tropical plants under a blue sky' })).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('Photo 2 of 4')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(pool).toHaveFocus();
  });
});

describe('Contact phone appears in every F6 location (R7)', () => {
  it('navbar', () => {
    renderPublic();
    expect(screen.getAllByRole('link', { name: /\+63 917 000 0000/ })[0]).toHaveAttribute('href', 'tel:+639170000000');
  });

  it('navbar, hero and footer', () => {
    renderPublic();
    const links = screen.getAllByRole('link', { name: /Call \+63 917 000 0000/ });
    expect(links).toHaveLength(3); // navbar call icon + hero + footer
    links.forEach((link) => expect(link).toHaveAttribute('href', 'tel:+639170000000'));
  });
});

describe('Schedule a Viewing modal', () => {
  it('opens from the hero button and returns focus to it on close', async () => {
    const user = userEvent.setup();
    renderPublic();
    const [, heroButton] = screen.getAllByRole('button', { name: 'Schedule a Viewing' });
    await user.click(heroButton);
    const dialog = screen.getByRole('dialog', { name: 'Schedule a Viewing' });
    expect(within(dialog).getByLabelText('Bed type')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(heroButton).toHaveFocus();
  });

  it('opens from the navbar and sends bed type, move-in and stay inside the message; closes on success', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    const onRequest = ({ request }: { request: Request }) => {
      if (request.method === 'POST' && request.url.endsWith('/inquiries')) void request.clone().json().then((b) => bodies.push(b));
    };
    server.events.on('request:start', onRequest);
    renderPublic();
    const [navButton] = screen.getAllByRole('button', { name: 'Schedule a Viewing' });
    await user.click(navButton);
    const dialog = screen.getByRole('dialog', { name: 'Schedule a Viewing' });
    await user.type(within(dialog).getByLabelText(/Name/), 'Juan Dela Cruz');
    await user.type(within(dialog).getByLabelText(/Phone/), '0917 123 4567');
    await user.selectOptions(within(dialog).getByLabelText('Bed type'), 'upper');
    await user.type(within(dialog).getByLabelText('Move-in date'), '2026-11-01');
    await user.selectOptions(within(dialog).getByLabelText('Stay length'), '6 months');
    await user.type(within(dialog).getByLabelText(/Message/), 'Weekend visit?');
    await user.click(within(dialog).getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText(/Thanks! We'll contact you within 24 hours/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(navButton).toHaveFocus();
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ message: 'Bed type: Upper bunk. Planned move-in: 2026-11-01. Planned stay: 6 months.\n\nWeekend visit?' });
    server.events.removeListener('request:start', onRequest);
  });
});

describe('FAQ', () => {
  it('the FAQ accordion opens and closes from the keyboard', async () => {
    const user = userEvent.setup();
    renderPublic();
    const question = screen.getByRole('button', { name: 'Is there a minimum stay?' });
    expect(question).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Is there a minimum stay?' })).not.toBeInTheDocument();
    question.focus();
    await user.keyboard('{Enter}');
    expect(question).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Is there a minimum stay?' })).toBeVisible();
    await user.keyboard(' ');
    expect(question).toHaveAttribute('aria-expanded', 'false');
  });

  it('links the visitors answer to the house rules', async () => {
    const user = userEvent.setup();
    renderPublic();
    await user.click(screen.getByRole('button', { name: 'Can I have visitors? Is there a curfew?' }));
    expect(screen.getByRole('link', { name: 'See all house rules' })).toHaveAttribute('href', '#house-rules');
  });

  it('the on-page viewing form section is gone (the modal is the only form)', () => {
    renderPublic();
    expect(screen.queryByRole('textbox', { name: /Name/ })).not.toBeInTheDocument();
    expect(document.getElementById('viewing-form')).toBeNull();
  });
});
