import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/** Catch-all route: unknown URLs. */
export function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-2 p-6">
      <h1 className="type-h2 text-primary">{t('common:notFound.title')}</h1>
      <p className="type-body-s text-secondary">{t('common:notFound.body')}</p>
      <Link to="/" className="type-label-s w-fit text-brand underline">
        {t('common:notFound.home')}
      </Link>
    </div>
  );
}
