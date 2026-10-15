import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../hooks';
import { selectThemePreference, themeChanged } from '../../features/ui/uiSlice';
import { Moon, Sun } from '../../ui/icons';

/**
 * R45: Light / Dark as one round button (Bernie, 2026-10-14), in the public, portal and admin bars. "Hide and seek":
 * the sun and moon sit on opposite sides of a wheel whose hub is below the button; toggling turns the wheel 180°, so
 * the sun sets to the right as the moon rises from the left (and back). 450ms ease-out transform only; the global
 * prefers-reduced-motion rule (index.css) makes it an instant swap. The name says what the button will do.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const dark = useAppSelector(selectThemePreference) === 'dark';
  const label = dark ? t('theme.switchToLight') : t('theme.switchToDark');
  return (
    <button
      type="button"
      onClick={() => dispatch(themeChanged(dark ? 'light' : 'dark'))}
      aria-label={label}
      title={label}
      className={`relative inline-flex h-control-md w-control-md shrink-0 items-center justify-center overflow-hidden rounded-full border border-strong bg-surface text-primary transition-colors duration-fast hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`}
    >
      <span
        aria-hidden="true"
        data-testid="theme-wheel"
        className="absolute inset-0 transition-transform duration-[450ms] ease-out"
        // Hub at 160% of the button height: the sun (centre) and the moon (270%) are 180° apart on the wheel.
        style={{ transformOrigin: '50% 160%', transform: `rotate(${dark ? 180 : 0}deg)` }}
      >
        <Sun className="absolute left-1/2 top-1/2 h-icon-md w-icon-md -translate-x-1/2 -translate-y-1/2" />
        <Moon className="absolute left-1/2 top-[270%] h-icon-md w-icon-md -translate-x-1/2 -translate-y-1/2 rotate-180" />
      </span>
    </button>
  );
}
