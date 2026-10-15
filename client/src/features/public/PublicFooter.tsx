import { useTranslation } from 'react-i18next';
import { env, telHref } from '../../config/env';
import { Phone } from '../../ui/icons';
import { BrandLockup } from '../../ui/Logo';
import { LinkButton } from '../../ui/LinkButton';

/** R1, R7: footer with the brand, the phone number (tel: link) and the renter log-in. */
export function PublicFooter() {
  const { t } = useTranslation();
  return (
    <footer className="border-t bg-surface px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <BrandLockup />
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={telHref()}
            className="type-label-s inline-flex min-h-touch items-center gap-2 border border-strong px-4 tabular-nums text-primary hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <Phone className="h-icon-sm w-icon-sm" aria-hidden="true" />
            {t('public:footer.call', { phone: env.contactPhone })}
          </a>
          <LinkButton to="/login" className="!rounded-none">{t('common:login')}</LinkButton>
        </div>
      </div>
    </footer>
  );
}
