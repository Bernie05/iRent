import { useTranslation } from 'react-i18next';
import logoUrl from '../assets/logo.png';

interface LogoProps {
  /** Full = mark + wordmark image; Mark = same image at a smaller fixed size (no separate asset yet). */
  type?: 'full' | 'mark';
  className?: string;
}

/** Logo on a white tile (OQ-14 = B: readable in both themes). */
export function Logo({ type = 'full', className = '' }: LogoProps) {
  const { t } = useTranslation();
  const size = type === 'mark' ? 'h-8 w-8' : 'h-auto w-20';
  return (
    <span className={`inline-flex w-fit shrink-0 items-center rounded-full bg-logo-tile p-1.5 ring-1 ring-inset ring-[color:var(--color-border-default)] ${className}`}>
      <img src={logoUrl} alt={t('logoAlt')} width={96} height={103} className={size} />
    </span>
  );
}

/**
 * Logo mark + the bold "iRent" wordmark + the community name. `stacked` centres it in a column (auth);
 * `compact` drops the community name.
 */
export function BrandLockup({ compact = false, stacked = false, className = '' }: { compact?: boolean; stacked?: boolean; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center ${stacked ? 'flex-col gap-3 text-center' : 'gap-2.5'} ${className}`}>
      <Logo type="mark" className={stacked ? '[&>img]:h-10 [&>img]:w-10' : ''} />
      <span className={`flex flex-col ${stacked ? 'items-center' : ''}`}>
        <span className={`font-heading font-extrabold leading-none tracking-[-0.03em] text-primary ${stacked ? 'text-[1.75rem]' : 'text-xl'}`}>
          {t('appName')}
        </span>
        {!compact && <span className="type-caption mt-1 whitespace-nowrap text-secondary">{t('brandName')}</span>}
      </span>
    </span>
  );
}
