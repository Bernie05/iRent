import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './PreferenceControls';
import { renderWithApp } from '../../test/utils';

describe('ThemeToggle (R45, round sun/moon button)', () => {
  it('is one button whose name says what it will do; the wheel turns 180° to hide the sun and show the moon', async () => {
    const user = userEvent.setup();
    renderWithApp(<ThemeToggle />);
    const toDark = screen.getByRole('button', { name: 'Switch to dark mode' });
    expect(toDark).toHaveClass('h-control-md', 'w-control-md'); // 44px target
    expect(screen.getByTestId('theme-wheel')).toHaveStyle({ transform: 'rotate(0deg)' });

    await user.click(toDark);
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toHaveFocus();
    expect(screen.getByTestId('theme-wheel')).toHaveStyle({ transform: 'rotate(180deg)' });

    await user.keyboard('{Enter}');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument();
  });
});
