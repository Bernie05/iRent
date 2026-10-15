import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useGetInquiriesQuery } from '../../../services/endpoints/admin';
import { useFormat } from '../../../hooks/useFormat';
import { dateFormat, localeFor } from '../../../lib/format';
import { addDays, manilaToday, toInstant } from '../../../lib/time';
import { IconButton } from '../../../ui/IconButton';
import { Skeleton } from '../../../ui/Skeleton';
import { ChevronLeft, ChevronRight } from '../../../ui/icons';
import { telHref } from '../../../config/env';
import { itemsByDate, weekOf } from '../inquiries/calendar';
import { Card } from './Card';

/** Scheduled viewings one week at a time (Sunday first): a tile per day with its count; picking a day lists its viewings with time. */
export function ViewingsWeekCard() {
  const { t } = useTranslation();
  const f = useFormat();
  const today = manilaToday();
  const [start, setStart] = useState(() => weekOf(today)[0]);
  const days = weekOf(start);
  const [picked, setPicked] = useState<string | null>(null);
  const { data, isLoading, isError } = useGetInquiriesQuery();
  const byDate = itemsByDate(data ?? []);
  const countOn = (d: string) => byDate.get(d)?.viewings.length ?? 0;
  const selected = picked && days.includes(picked) ? picked : days.includes(today) ? today : (days.find((d) => countOn(d) > 0) ?? days[0]);
  const viewings = byDate.get(selected)?.viewings ?? [];
  const total = days.reduce((n, d) => n + countOn(d), 0);
  const isThisWeek = days.includes(today);

  const locale = localeFor(f.language);
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => dateFormat(locale, o).format(toInstant(d));
  const range = t('admin:dashboard.viewingsRange', { from: fmt(days[0], { month: 'short', day: 'numeric' }), to: fmt(days[6], { month: 'short', day: 'numeric' }) });
  const time = (iso: string) => dateFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const go = (weeks: number) => {
    setStart(addDays(start, weeks * 7));
    setPicked(null);
  };

  return (
    <Card
      title={t('admin:dashboard.viewings')}
      hint={`${isThisWeek ? `${t('admin:dashboard.thisWeek')} · ` : ''}${range} · ${t('admin:dashboard.viewingsCount', { count: total })}`}
      action={
        <div className="flex items-center">
          <IconButton label={t('admin:dashboard.prevWeek')} icon={<ChevronLeft className="h-icon-sm w-icon-sm" />} onClick={() => go(-1)} />
          {!isThisWeek && (
            <button type="button" onClick={() => {
                setStart(weekOf(today)[0]);
                setPicked(null);
              }} className="rounded-md px-2 py-1 type-label-xs text-brand hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
              {t('admin:dashboard.thisWeek')}
            </button>
          )}
          <IconButton label={t('admin:dashboard.nextWeek')} icon={<ChevronRight className="h-icon-sm w-icon-sm" />} onClick={() => go(1)} />
        </div>
      }
    >
      {isLoading ? (
        <Skeleton variant="row" />
      ) : isError ? (
        <p className="type-body-s text-secondary">{t('admin:dashboard.errorLoading')}</p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1" role="group" aria-label={range}>
            {days.map((d) => {
              const n = countOn(d);
              const on = d === selected;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={t('admin:dashboard.viewingsOnDay', { date: fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }), count: n })}
                  onClick={() => setPicked(d)}
                  className={`flex flex-col items-center gap-0.5 rounded-md border px-0.5 py-2 transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                    on ? 'border-brand bg-brand-subtle' : 'hover:bg-muted'
                  }`}
                >
                  <span className="type-caption text-secondary">{fmt(d, { weekday: 'narrow' })}</span>
                  <span className={`type-body-s-strong ${d === today ? 'text-brand' : 'text-primary'}`}>{fmt(d, { day: 'numeric' })}</span>
                  <span className={`type-label-xs min-w-[1.25rem] rounded-full px-1 text-center tabular-nums ${n ? 'bg-accent text-on-accent' : 'text-tertiary'}`}>{n}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-1" aria-live="polite">
            <p className="type-label-s text-primary">{fmt(selected, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            {viewings.length === 0 ? (
              <p className="py-2 type-body-s text-secondary">{t('admin:dashboard.noViewingsDay')}</p>
            ) : (
              <ul className="flex flex-col">
                {viewings.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 border-b py-2 last:border-b-0">
                    <span className="w-16 shrink-0 type-body-s-strong tabular-nums text-primary">{time(v.scheduled_at!)}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate type-body-s text-primary">{v.name}</span>
                      {v.schedule_note && <span className="truncate type-caption text-secondary">{v.schedule_note}</span>}
                    </span>
                    <a
                      href={telHref(v.phone)}
                      className="shrink-0 type-body-s tabular-nums text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                      {v.phone}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link to="/admin/inquiries" className="self-start type-label-s text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {t('admin:dashboard.openInquiries')}
          </Link>
        </>
      )}
    </Card>
  );
}
