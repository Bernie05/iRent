import { useTranslation } from 'react-i18next';
import logoUrl from '../../assets/logo.png';
import { env } from '../../config/env';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { selectThemePreference, themeChanged } from '../ui/uiSlice';
import { THEME_PREFERENCES } from '../../theme/theme';
import { useGetHealthQuery } from '../../services/endpoints/public';

/**
 * Developer boot page for F1/F2: proves the store, i18n, theme engine and API layer are running.
 * F5/F6 replace it with the public home. The plain radio groups stand in for the F3 SegmentedControl.
 */
export function BootPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const theme = useAppSelector(selectThemePreference);
  const health = useGetHealthQuery();

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-10">
      <div className="inline-flex w-fit rounded-xl bg-logo-tile p-3 shadow-elevation-1">
        <img src={logoUrl} alt={t('logoAlt')} width={96} height={103} className="h-auto w-24" />
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="type-h1 text-primary">{t('boot.title')}</h1>
        <p className="type-body-m text-secondary">{t('boot.body')}</p>
      </header>

      <section className="flex flex-col gap-2 rounded-lg border bg-surface p-4 shadow-elevation-1" aria-labelledby="boot-api">
        <h2 id="boot-api" className="type-h4 text-primary">
          {t('boot.apiStatus')}
        </h2>
        <p className="type-body-s text-secondary">{env.useMocks ? t('boot.mocksOn') : t('boot.mocksOff', { url: env.apiUrl })}</p>
        <p className="type-body-s-strong" aria-live="polite">
          {health.isLoading ? (
            <span className="text-tertiary">{t('loading')}</span>
          ) : health.isSuccess ? (
            <span className="text-success">{t('boot.apiOk')}</span>
          ) : (
            <span className="text-danger">{t('boot.apiDown')}</span>
          )}
        </p>
      </section>

      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="mb-2 type-label-s text-primary">{t('theme.label')}</legend>
        {THEME_PREFERENCES.map((value) => (
          <label key={value} className="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-md border border-strong bg-secondary px-3 type-label-s text-primary">
            <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => dispatch(themeChanged(value))} />
            {t(`theme.${value}`)}
          </label>
        ))}
      </fieldset>

    </main>
  );
}
