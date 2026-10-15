import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import type { Language } from '../types/api';

/**
 * react-i18next setup (R46). One JSON file per language; its top-level keys are the namespaces
 * (`common`, `auth`, `errors`, `validation`, `domain`, and one per area as screens land).
 * Use `t('ns:key')` or `useTranslation('ns')`. Every UI string goes through `t()`.
 */
export const NAMESPACES = Object.keys(en) as (keyof typeof en)[];

export function createI18n(language: Language = 'en'): I18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    // Only EN is bundled: the UI is English-only since D-16. FIL stays in the repo and loads on demand (loadLanguage).
    resources: { en },
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fil'],
    ns: NAMESPACES,
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React already escapes.
    returnNull: false,
    initAsync: false,
  });
  return instance;
}

/** Adds a non-EN language's resources (its own lazy chunk) before switching to it. */
export async function loadLanguage(i18n: I18n, language: Language): Promise<void> {
  if (language === 'en' || i18n.hasResourceBundle(language, 'common')) return;
  const { _meta, ...namespaces } = (await import('../locales/fil.json')).default;
  void _meta;
  for (const [ns, resources] of Object.entries(namespaces)) i18n.addResourceBundle(language, ns, resources);
}

/** `<html lang>` value for a UI language. */
export function htmlLang(language: Language): string {
  return language === 'fil' ? 'fil' : 'en';
}
