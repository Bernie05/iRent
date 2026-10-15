import type { ReactNode } from 'react';
import type { i18n as I18n } from 'i18next';
import { Provider } from 'react-redux';
import { I18nextProvider } from 'react-i18next';
import { ThemeController } from '../theme/ThemeController';
import { LanguageController } from '../i18n/LanguageController';
import { ToastProvider } from '../ui/ToastProvider';
import type { AppStore } from './store';

interface AppProvidersProps {
  store: AppStore;
  i18n: I18n;
  children: ReactNode;
}

/** Store, translations, and the theme/language side effects. The router is added by the caller. */
export function AppProviders({ store, i18n, children }: AppProvidersProps) {
  return (
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <ThemeController />
        <LanguageController />
        <ToastProvider>{children}</ToastProvider>
      </I18nextProvider>
    </Provider>
  );
}
