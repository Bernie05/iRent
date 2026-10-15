import { useTranslation } from 'react-i18next';
import type { ChargeRow, MeTenancy } from '../../types/api';
import { rentCountdown, rentIcs, downloadText } from '../../lib/rentCountdown';
import { manilaToday } from '../../lib/time';
import { formatDate } from '../../lib/format';
import { Button } from '../../ui/Button';
import { AlertTriangle, CalendarPlus, Clock } from '../../ui/icons';
import { useAppSelector } from '../../app/hooks';
import { selectLanguage } from '../ui/uiSlice';

/** R76 (D-27): the rent countdown line in the balance area, plus "Add to calendar" (cases 2 and 3). */
export function RentCountdown({ tenancy, charges }: { tenancy: MeTenancy | null | undefined; charges: ChargeRow[] }) {
  const { t } = useTranslation();
  const language = useAppSelector(selectLanguage);
  const c = rentCountdown(manilaToday(), tenancy, charges);
  if (!c) return null;

  if (c.kind === 'overdue') {
    return (
      <p className="mt-2 inline-flex items-center gap-1 type-body-s-strong text-danger">
        <AlertTriangle className="h-icon-sm w-icon-sm" aria-hidden="true" />
        {t('portal:home.countdown.overdue', { count: c.days })}
      </p>
    );
  }

  const date = formatDate(c.due, { language });
  const text =
    c.kind === 'next'
      ? t('portal:home.countdown.next', { count: c.days, date })
      : c.days === 0
        ? t('portal:home.countdown.dueToday', { date })
        : t('portal:home.countdown.due', { count: c.days, date });

  return (
    <div className="mt-2 flex flex-col items-center gap-2">
      <p className="inline-flex items-center gap-1 type-body-s-strong text-primary">
        <Clock className="h-icon-sm w-icon-sm" aria-hidden="true" />
        {text}
      </p>
      <Button
        variant="secondary"
        iconLeft={<CalendarPlus className="h-icon-sm w-icon-sm" aria-hidden="true" />}
        onClick={() => downloadText(`irent-rent-${c.period.slice(0, 7)}.ics`, rentIcs(c), 'text/calendar;charset=utf-8')}
      >
        {t('portal:home.countdown.addToCalendar')}
      </Button>
    </div>
  );
}
