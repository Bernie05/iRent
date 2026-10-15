import { useEffect } from 'react';
import { useAppSelector } from '../app/hooks';
import { selectThemePreference } from '../features/ui/uiSlice';
import { applyTheme, resolveTheme } from './theme';

/**
 * Keeps <html> in sync with the theme preference (R45). The pre-paint script already painted the stored
 * theme before React mounted; this takes over for changes.
 */
export function ThemeController(): null {
  const preference = useAppSelector(selectThemePreference);

  useEffect(() => {
    applyTheme(resolveTheme(preference), preference);
  }, [preference]);

  return null;
}
