import { useTranslation } from 'react-i18next';
import type { BunkType } from '../types/api';
import { formatPeso } from '../lib/format';

interface RateCardProps {
  bunkType: BunkType;
  rate: number;
  vacantCount: number;
  /** Optional photo of this bunk type (decorative: the bunk type is named right under it). */
  photo?: { src: string; srcSet?: string; width: number; height: number };
  className?: string;
}

/** "Lower bunk · ₱4,500 / month" plus the vacant-bed count, on a rounded panel with a big bold amount. */
export function RateCard({ bunkType, rate, vacantCount, photo, className = '' }: RateCardProps) {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border bg-surface ${className}`}>
      {photo && (
        <img
          src={photo.src}
          srcSet={photo.srcSet}
          sizes="(min-width: 1152px) 560px, (min-width: 640px) 50vw, 100vw"
          width={photo.width}
          height={photo.height}
          alt=""
          loading="lazy"
          className="aspect-[16/9] w-full bg-muted object-cover"
        />
      )}
      <div className="flex flex-col gap-8 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <p className="type-h4 text-primary">{t(`domain:bunkType.${bunkType}`)}</p>
        <p className="type-label-s inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-primary">
          <span className="h-2 w-2 rounded-full bg-mark" aria-hidden="true" />
          {t('ui:rateCard.vacantCount', { count: vacantCount })}
        </p>
      </div>
      <p className="type-amount-l text-primary sm:text-6xl sm:leading-none sm:tracking-[-2px]">
        {formatPeso(rate, { whole: true })}
        <span className="type-body-m tracking-normal text-secondary"> {t('ui:rateCard.perMonth')}</span>
      </p>
      </div>
    </div>
  );
}
