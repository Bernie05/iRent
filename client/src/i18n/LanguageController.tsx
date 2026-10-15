import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../app/hooks';
import { selectLanguage } from '../features/ui/uiSlice';
import { htmlLang, loadLanguage } from './index';

/** Applies the chosen language to i18next and `<html lang>` (R46), loading its resources first when needed. */
export function LanguageController(): null {
  const language = useAppSelector(selectLanguage);
  const { i18n } = useTranslation();

  useEffect(() => {
    let current = true;
    void loadLanguage(i18n, language).then(() => {
      if (current && i18n.language !== language) void i18n.changeLanguage(language);
    });
    document.documentElement.lang = htmlLang(language);
    return () => {
      current = false;
    };
  }, [i18n, language]);

  return null;
}
