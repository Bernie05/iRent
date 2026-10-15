import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import en from '../locales/en.json';
import fil from '../locales/fil.json';
import { createI18n, loadLanguage } from '.';
import { LANGUAGE_STORAGE_KEY, languageChanged } from '../features/ui/uiSlice';
import { useFormat } from '../hooks/useFormat';
import { renderWithApp } from '../test/utils';
import { AppProviders } from '../app/AppProviders';
import { makeStore } from '../app/store';

function keysOf(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

/** key → sorted list of {{placeholders}} in its string. */
function placeholdersOf(obj: object, prefix = ''): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') Object.assign(out, placeholdersOf(v, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = [...String(v).matchAll(/{{s*(w+)s*}}/g)].map((m) => m[1]).sort();
  }
  return out;
}

function Greeting() {
  const { t } = useTranslation();
  return <p>{t('theme.label')}</p>;
}

describe('i18n resources (R46)', () => {
  it('FIL has exactly the EN keys (plus its _meta translation flag)', () => {
    const { _meta, ...filKeys } = fil;
    expect(_meta.translationStatus).toBe('draft');
    expect(keysOf(filKeys).sort()).toEqual(keysOf(en).sort());
  });

  it('FIL keeps the same {{placeholders}} as EN for every key', () => {
    const { _meta, ...filKeys } = fil;
    void _meta;
    expect(placeholdersOf(filKeys)).toEqual(placeholdersOf(en));
  });

  it('has no empty strings in either language', () => {
    const { _meta, ...filKeys } = fil;
    void _meta;
    const empty = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? empty(v).map((x) => `${k}.${x}`) : v === '' ? [k] : []));
    expect(empty(en)).toEqual([]);
    expect(empty(filKeys)).toEqual([]);
  });

  it('resolves namespaced keys in FIL once loaded (not bundled, O-1)', async () => {
    const i18n = createI18n('fil');
    await loadLanguage(i18n, 'fil');
    expect(i18n.t('common:theme.dark')).toBe('Madilim');
    expect(i18n.t('errors:BED_TAKEN')).toBe('Kakakuha lang ng bed na ito. Pumili ng ibang bed.');
  });

  it('falls back to EN when a FIL key is missing', async () => {
    const i18n = createI18n('fil');
    await loadLanguage(i18n, 'fil');
    expect(i18n.t('common:thisKeyDoesNotExist', { defaultValue: 'x' })).toBe('x');
    expect(i18n.getFixedT('en')('validation:fileInvalid')).toBe(en.validation.fileInvalid);
  });

  it('uses a generic image message for uploads and a screenshot message only for payment proof', () => {
    expect(en.validation.fileInvalid).not.toMatch(/screenshot/i);
    expect(en.validation.screenshotInvalid).toMatch(/screenshot/i);
  });
});

describe('LanguageController', () => {
  it('switches the UI language, <html lang> and localStorage when the language changes', async () => {
    const { store } = renderWithApp(<Greeting />);
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');

    act(() => {
      store.dispatch(languageChanged('fil'));
    });
    expect(await screen.findByText('Tema')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fil');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fil');
  });

  it('starts in English even if FIL was stored (no language switch since 2026-10-14)', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fil');
    renderWithApp(<Greeting />);
    expect(screen.getByText('Theme')).toBeInTheDocument();
  });
});

describe('useFormat', () => {
  it('binds formatters and item labels to the current language (D-12)', async () => {
    const store = makeStore();
    const i18n = createI18n('en');
    const { result } = renderHook(() => useFormat(), {
      wrapper: ({ children }) => (
        <AppProviders store={store} i18n={i18n}>
          {children}
        </AppProviders>
      ),
    });
    expect(result.current.peso(4500, true)).toBe('₱4,500');
    expect(result.current.item({ type: 'charge', id: 'c', period: '2026-10-01' })).toBe('October 2026 rent');
    expect(result.current.item({ type: 'bill_share', id: 's', period: '2026-09-01', bill_type: 'electricity' })).toBe('September 2026 electricity bill');

    act(() => {
      store.dispatch(languageChanged('fil'));
    });
    expect(result.current.period('2026-10-01')).toBe('Oktubre 2026');
    await waitFor(() => expect(result.current.item({ type: 'bill_share', id: 's', period: '2026-09-01', bill_type: 'water' })).toBe('Bill ng tubig para sa Setyembre 2026'));
    expect(result.current.dueDay(5)).toBe('ika-5');
  });
});
