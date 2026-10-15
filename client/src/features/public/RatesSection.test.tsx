import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { RatesSection } from './RatesSection';
import { mockControl } from '../../mocks/control';
import { server } from '../../mocks/node';
import { renderWithApp } from '../../test/utils';

describe('RatesSection (F7, SC-1, SC-2, SC-3, SC-7)', () => {
  afterEach(() => mockControl.reset());

  it('renders one card per (bunk_type, rate), e.g. Lower bunk · ₱4,500 / month', async () => {
    renderWithApp(<RatesSection />);
    expect(await screen.findByText('Lower bunk')).toBeInTheDocument();
    expect(screen.getByText('Upper bunk')).toBeInTheDocument();
    expect(screen.getByText(/₱4,500/)).toBeInTheDocument();
    expect(screen.getByText(/₱4,000/)).toBeInTheDocument();
  });

  it('shows the empty state when every bed is taken (SC-2)', async () => {
    mockControl.emptyBeds();
    renderWithApp(<RatesSection />);
    expect(await screen.findByText(/All beds are taken right now/)).toBeInTheDocument();
  });

  it('shows an inline error with Retry on a load failure, and recovers on retry (SC-3)', async () => {
    const user = userEvent.setup();
    mockControl.failNext('GET', '/beds/available', 500, 'INTERNAL');
    renderWithApp(<RatesSection />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const retry = screen.getByRole('button', { name: 'Try again' });
    await user.click(retry);
    expect(await screen.findByText('Lower bunk')).toBeInTheDocument();
  });

  it('renders two cards for the same bunk type at different rates (SC-7)', async () => {
    server.use(
      http.get('*/beds/available', () =>
        HttpResponse.json([
          { bunk_type: 'upper', monthly_rate: 4000, vacant_count: 1 },
          { bunk_type: 'upper', monthly_rate: 4200, vacant_count: 1 },
        ]),
      ),
    );
    renderWithApp(<RatesSection />);
    expect(await screen.findByText(/₱4,000/)).toBeInTheDocument();
    expect(screen.getByText(/₱4,200/)).toBeInTheDocument();
    expect(screen.getAllByText('Upper bunk')).toHaveLength(2);
  });
});
