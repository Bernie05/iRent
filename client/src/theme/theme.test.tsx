import { act } from '@testing-library/react';
import { PREPAINT_SCRIPT, THEME_STORAGE_KEY } from './prepaint';
import { readStoredTheme, resolveTheme, type ThemePreference } from './theme';
import { themeChanged } from '../features/ui/uiSlice';
import { renderWithApp } from '../test/utils';

const html = () => document.documentElement;

describe('resolveTheme (R45)', () => {
  it.each<[ThemePreference, 'light' | 'dark']>([
    ['light', 'light'],
    ['dark', 'dark'],
  ])('%s → %s', (preference, expected) => {
    expect(resolveTheme(preference)).toBe(expected);
  });

  it('defaults missing, corrupt, or legacy System values to Light', () => {
    expect(readStoredTheme()).toBe('light');
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readStoredTheme()).toBe('light');
    localStorage.setItem(THEME_STORAGE_KEY, 'system');
    expect(readStoredTheme()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');
  });
});

describe('pre-paint script (no flash of the wrong theme, SC-49)', () => {
  const runScript = () => new Function(PREPAINT_SCRIPT)();

  it.each<[string | null]>([[null], ['light'], ['dark'], ['system'], ['garbage']])('stored=%s: agrees with resolveTheme()', (stored) => {
    if (stored === null) localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, stored);
    runScript();
    const preference: ThemePreference = stored === 'dark' ? 'dark' : 'light';
    const expected = resolveTheme(preference);
    expect(html().classList.contains('dark')).toBe(expected === 'dark');
    expect(html().style.colorScheme).toBe(expected);
    expect(html().getAttribute('data-theme-preference')).toBe(preference);
  });

  it('does not throw when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(runScript).not.toThrow();
    expect(html().classList.contains('dark')).toBe(false);
    spy.mockRestore();
  });

  it('is plain ES5 (it runs before any bundle, in every browser)', () => {
    expect(PREPAINT_SCRIPT).not.toMatch(/=>|\blet\b|\bconst\b|`/);
  });
});

describe('ThemeController', () => {
  it('applies the stored Dark theme and persists changes to localStorage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const { store } = renderWithApp(<p>content</p>);
    expect(html().classList.contains('dark')).toBe(true);

    act(() => {
      store.dispatch(themeChanged('light'));
    });
    expect(html().classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('defaults to Light regardless of the OS color scheme', () => {
    const { store } = renderWithApp(<p>content</p>);
    expect(store.getState().ui.theme).toBe('light');
    expect(html().classList.contains('dark')).toBe(false);
  });

  it('applies the selected theme without following the OS', () => {
    const { store } = renderWithApp(<p>content</p>);
    act(() => {
      store.dispatch(themeChanged('dark'));
    });
    expect(html().classList.contains('dark')).toBe(true);
  });
});
