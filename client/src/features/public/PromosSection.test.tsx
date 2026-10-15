import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromosSection } from './PromosSection';
import { ViewingModalProvider } from './ViewingModal';
import { db } from '../../mocks/db';
import { promoStatus } from '../../lib/promotions';
import { renderWithApp } from '../../test/utils';

const renderPromos = () =>
  renderWithApp(
    <ViewingModalProvider>
      <PromosSection />
    </ViewingModalProvider>,
  );

describe('promoStatus', () => {
  const p = (visible: boolean, starts_on: string | null, ends_on: string | null) => promoStatus({ visible, starts_on, ends_on }, '2026-10-14');
  it.each([
    [p(true, null, null), 'visible'],
    [p(true, '2026-10-14', '2026-10-14'), 'visible'], // dates are inclusive
    [p(true, '2026-12-01', null), 'scheduled'],
    [p(true, null, '2026-10-13'), 'expired'],
    [p(false, null, null), 'hidden'],
  ])('%s', (status, expected) => expect(status).toBe(expected));
});

describe('PromosSection (public)', () => {
  beforeEach(() => {
    db.today = () => '2026-10-14';
  });

  it('shows only visible, in-date promos as a keyboard carousel; the button opens the viewing modal', async () => {
    const user = userEvent.setup();
    renderPromos();
    const carousel = await screen.findByRole('region', { name: 'Promotions' });
    const slide = within(carousel).getByRole('group', { name: '1 of 2' });
    expect(slide).toHaveTextContent('₱500 off your first month');
    expect(slide).toHaveTextContent('Limited time');
    expect(screen.queryByText(/December move-in/)).not.toBeInTheDocument(); // scheduled
    expect(screen.queryByText('Summer pool pass')).not.toBeInTheDocument(); // hidden

    await user.click(screen.getByRole('button', { name: 'Next promo' }));
    const second = within(carousel).getByRole('group', { name: '2 of 2' });
    const toRates = within(second).getByRole('link', { name: /See the rates/ });
    expect(toRates).toHaveAttribute('href', '#rates'); // internal section only
    expect(toRates).not.toHaveAttribute('target');

    second.focus();
    await user.keyboard('{ArrowRight}'); // wraps to the first
    expect(within(carousel).getByRole('group', { name: '1 of 2' })).toBeInTheDocument();
    within(carousel).getByRole('group').focus();
    await user.keyboard('{ArrowLeft}');
    expect(within(carousel).getByRole('group', { name: '2 of 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous promo' }));

    await user.click(within(carousel).getByRole('button', { name: /Schedule a Viewing/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('renders nothing when the admin switched the section off', async () => {
    db.promoSection = false;
    const { container } = renderPromos();
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('#promos')).toBeNull();
  });

  it('a single promo has no carousel controls', async () => {
    db.promotions = db.promotions.filter((p) => p.id === 'promo-2');
    renderPromos();
    expect(await screen.findByText('Refer a friend, both get ₱300 credit')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next promo' })).not.toBeInTheDocument();
  });
});
