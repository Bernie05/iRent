import { useTranslation } from 'react-i18next';
import { useGetRentersQuery } from '../../../services/endpoints/admin';
import { useFormat } from '../../../hooks/useFormat';
import { manilaToday } from '../../../lib/time';
import { Skeleton } from '../../../ui/Skeleton';
import { StatusBadge } from '../../../ui/StatusBadge';
import { Cake } from '../../../ui/icons';
import { upcomingBirthdays } from './metrics';
import { Card } from './Card';


/** Active renters' birthdays this month and next, soonest first; today's are highlighted. */
export function BirthdaysCard() {
  const { t } = useTranslation();
  const f = useFormat();
  const { data, isLoading, isError } = useGetRentersQuery();
  const list = data ? upcomingBirthdays(data, manilaToday()) : [];

  return (
    <Card title={t('admin:dashboard.birthdays')} hint={t('admin:dashboard.birthdaysHint')}>
      {isLoading ? (
        <Skeleton variant="row" />
      ) : isError ? (
        <p className="type-body-s text-secondary">{t('admin:dashboard.errorLoading')}</p>
      ) : list.length === 0 ? (
        <div className="flex flex-col gap-1 py-4 text-center">
          <p className="type-body-s-strong text-primary">{t('admin:dashboard.noBirthdays')}</p>
          <p className="type-body-s text-secondary">{t('admin:dashboard.noBirthdaysHint')}</p>
        </div>
      ) : (
        // About 3½ rows tall, scrolling inside, so a long list doesn't stretch the column (px-2 keeps today's highlight unclipped).
        <ul
          tabIndex={0}
          aria-label={t('admin:dashboard.scrollable', { name: t('admin:dashboard.birthdays') })}
          className="-mx-2 flex max-h-56 flex-col overflow-y-auto px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {list.map((b) => {
            const isToday = b.daysAway === 0;
            return (
              <li key={b.renter.id} className={`flex items-center gap-3 border-b py-3 last:border-b-0 ${isToday ? '-mx-2 rounded-md border-b-0 bg-brand-subtle px-2' : ''}`}>
                <span className={`flex h-avatar-sm w-avatar-sm shrink-0 items-center justify-center rounded-full ${isToday ? 'bg-accent text-on-accent' : 'bg-muted text-secondary'}`} aria-hidden="true">
                  <Cake className="h-icon-sm w-icon-sm" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate type-body-s-strong text-primary">{b.renter.full_name}</span>
                  <span className="type-caption text-secondary">
                    {f.date(b.date)} · {t('admin:dashboard.turns', { age: b.turns })}
                    {b.renter.tenancy && ` · ${b.renter.tenancy.bed.label}`}
                  </span>
                </span>
                {isToday ? (
                  <StatusBadge tone="brand">{t('admin:dashboard.today')}</StatusBadge>
                ) : (
                  <span className="shrink-0 type-label-xs text-secondary">
                    {b.daysAway === 1 ? t('admin:dashboard.tomorrow') : t('admin:dashboard.inDays', { count: b.daysAway })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
