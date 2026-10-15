import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BootPage } from './BootPage';
import { renderWithApp } from '../../test/utils';
import { mockControl } from '../../mocks/control';

describe('BootPage (F1 smoke)', () => {
  it('boots with the store, i18n and API layer, and reports the API health from the mocks', async () => {
    renderWithApp(<BootPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'iRent is starting up' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'BLDG-Q UDHO Community logo' })).toBeInTheDocument();
    expect(await screen.findByText('OK')).toBeInTheDocument();
  });

  it('shows the API as not reachable on a network error', async () => {
    mockControl.networkError('GET', '/health');
    renderWithApp(<BootPage />);
    expect(await screen.findByText('Not reachable')).toBeInTheDocument();
  });

  it('switches theme from the keyboard-operable radio group (no language switch since 2026-10-14)', async () => {
    const user = userEvent.setup();
    renderWithApp(<BootPage />);
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Filipino' })).not.toBeInTheDocument();
  });
});
