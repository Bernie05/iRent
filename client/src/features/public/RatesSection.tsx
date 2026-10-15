import { useTranslation } from 'react-i18next';
import { useGetAvailableBedsQuery } from '../../services/endpoints/public';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { RateCard } from '../../ui/RateCard';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/ErrorState';
import { EmptyState } from '../../ui/EmptyState';
import { errorToMessage } from '../../services/errors';
import { SECTION_HEADING } from './HeroSection';
import { BUNK_PHOTOS } from '../../lib/demoPhotos';

/** R5, E24: rate cards from GET /beds/available, one per (bunk_type, rate). */
export function RatesSection() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useGetAvailableBedsQuery();
  const showSkeleton = useDelayedFlag(isLoading);

  return (
    <section id="rates" aria-labelledby="rates-title" className="mx-auto scroll-mt-24 max-w-6xl px-4 pb-20 sm:pb-28">
      <h2 id="rates-title" className={SECTION_HEADING}>
        {t('public:rates.title')}
      </h2>
      <div className="mt-10">
        {error ? (
          <ErrorState message={t(errorToMessage(error))} onRetry={() => void refetch()} />
        ) : isLoading ? (
          showSkeleton && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} variant="card" className="!h-48 rounded-xl" />
              ))}
            </div>
          )
        ) : !data || data.length === 0 ? (
          <EmptyState title={t('public:rates.empty')} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {data.map((rate) => (
              <RateCard
                key={`${rate.bunk_type}:${rate.monthly_rate}`}
                bunkType={rate.bunk_type}
                rate={rate.monthly_rate}
                vacantCount={rate.vacant_count}
                photo={BUNK_PHOTOS[rate.bunk_type]}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
