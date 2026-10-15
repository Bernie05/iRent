import { THEME_STORAGE_KEY } from './prepaint';

export type ThemePreference = 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark'];
export { THEME_STORAGE_KEY };

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark';
}

/** Light/Dark → the theme to paint (R45). Must match PREPAINT_SCRIPT. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference;
}

export function readStoredTheme(storage: Storage | undefined = safeLocalStorage()): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(value)) return value;
    storeTheme('light', storage);
    return 'light';
  } catch {
    return 'light';
  }
}

export function storeTheme(preference: ThemePreference, storage: Storage | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private mode or blocked storage: the choice still applies for this visit.
  }
}

/** Paints a resolved theme on <html>: the `dark` class drives the `.dark` token block and Tailwind `dark:`. */
export function applyTheme(resolved: ResolvedTheme, preference: ThemePreference, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  root.setAttribute('data-theme-preference', preference);
}

export function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}
