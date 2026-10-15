import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useGetDashboardAnalyticsQuery, useGetDashboardQuery, useGetInquiriesQuery, useGetScheduleQuery } from '../../services/endpoints/admin';
import { upcomingSchedule } from './inquiries/calendar';
import { addDays, manilaToday } from '../../lib/time';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { useFormat } from '../../hooks/useFormat';
import { lastDayOfMonth, periodOf, toInstant } from '../../lib/time';
import { dateFormat, localeFor } from '../../lib/format';
import type { AnalyticsRange } from '../../types/api';
import { ErrorState } from '../../ui/ErrorState';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Skeleton } from '../../ui/Skeleton';
import { SelectField, TextField } from '../../ui/TextField';
import { ChevronRight } from '../../ui/icons';
import { BarList, ColumnChart, Sparkline } from './dashboard/charts';
import { BirthdaysCard } from './dashboard/BirthdaysCard';
import { Card } from './dashboard/Card';
import { ExpensesCard } from './dashboard/ExpensesCard';
import { NotPaidCard } from './dashboard/NotPaidCard';
import { ViewingsWeekCard } from './dashboard/ViewingsWeekCard';
import { byKind, collectionOf, net, pct, type ItemKind } from './dashboard/metrics';

const RANGES: AnalyticsRange[] = ['month', 'year', 'total'];
const KINDS: ItemKind[] = ['all', 'rent', 'bills'];
/** Chart panel: the chart's own centred caption is the title (reference layout). */
const PANEL = 'min-w-0 rounded-lg border bg-surface p-5 shadow-elevation-1';
/** Chart panels fill their grid cell and centre the chart (fixed chart height, no stretching). */
const CHART_PANEL = `${PANEL} flex flex-col justify-center`;
/** From xl the Not paid card fills its cell (min 28rem, set by the row) and scrolls inside. */
const FILL_CARD = 'xl:absolute xl:inset-0';

interface KpiProps {
  label: string;
  value: string;
  /** Exact value for screen readers when `value` is compact. */
  exact?: string;
  sub: string;
  trend: number[];
  trendLabel: string;
  to?: string;
}

function Kpi({ label, value, exact, sub, trend, trendLabel, to }: KpiProps) {
  const body = (
    <>
      <p className="text-center type-label-s text-secondary">{label}</p>
      <p className="text-center type-amount-l text-primary max-sm:type-amount-m">
        <span aria-hidden={exact ? true : undefined}>{value}</span>
        {exact && <span className="sr-only">{exact}</span>}
      </p>
      <p className="text-center type-caption text-secondary">{sub}</p>
      <div className="mt-auto pt-2">
        <Sparkline values={trend} />
        <p className="text-center type-caption text-tertiary">{trendLabel}</p>
      </div>
    </>
  );
  const box = `flex h-full flex-col gap-1 ${PANEL} max-sm:p-4`;
  return to ? (
    <Link
      to={to}
      className={`${box} transition-colors duration-fast hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
    >
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

function AttentionLink({ to, label, count, icon }: { to: string; label: string; count: number; icon?: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex min-h-touch items-center justify-between gap-3 rounded-md px-2 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span className="flex items-center gap-2 type-body-s text-primary">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-1">
        <span className={`type-label-xs min-w-[1.5rem] rounded-full px-2 py-0.5 text-center tabular-nums ${count ? 'bg-accent text-on-accent' : 'bg-muted text-secondary'}`}>{count}</span>
        <ChevronRight className="h-icon-sm w-icon-sm text-tertiary" aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * Admin dashboard (design pass 2026-10-14, Power BI-style reference): period filter, five KPI tiles with sparklines,
 * revenue vs expenses, collection split, not-paid table, expenses, birthdays, occupancy. R28 links kept
 * (occupancy → Beds, collection → Rent, inquiries, payments to review).
 */
export function AdminDashboardPage() {
  const { t } = useTranslation();
  const f = useFormat();
  const now = periodOf();
  const [range, setRange] = useState<AnalyticsRange>('month');
  const [month, setMonth] = useState(now.slice(0, 7));
  const [year, setYear] = useState(now.slice(0, 4));
  const [kind, setKind] = useState<ItemKind>('all');
  const period = range === 'month' ? (/^\d{4}-\d{2}$/.test(month) ? `${month}-01` : now) : range === 'year' ? `${year}-01-01` : undefined;
  const { data, isLoading, isFetching, error, refetch } = useGetDashboardAnalyticsQuery({ range, period });
  const { data: counts } = useGetDashboardQuery();
  const { data: inquiries } = useGetInquiriesQuery();
  const { data: schedule } = useGetScheduleQuery({ from: manilaToday(), to: addDays(manilaToday(), 1) });
  const showSkeleton = useDelayedFlag(isLoading);

  const shortMonth = (p: string) => dateFormat(localeFor(f.language), { month: 'short' }).format(toInstant(p));
  const years = Array.from({ length: 5 }, (_, i) => String(Number(now.slice(0, 4)) - i));

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl label={t('admin:dashboard.periodLabel')} options={RANGES.map((r) => ({ value: r, label: t(`admin:dashboard.range.${r}`) }))} value={range} onChange={setRange} />
      {range === 'month' && <TextField label={t('admin:dashboard.monthPicker')} labelHidden type="month" max={now.slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} containerClassName="w-44" />}
      {range === 'year' && (
        <SelectField label={t('admin:dashboard.yearPicker')} labelHidden value={year} onChange={(e) => setYear(e.target.value)} options={years.map((y) => ({ value: y, label: y }))} containerClassName="w-28" />
      )}
    </div>
  );

  const rangeLabel = !data
    ? ''
    : data.range === 'month'
      ? f.period(data.from)
      : data.range === 'year'
        ? data.from.slice(0, 4)
        : t('admin:dashboard.allTime', { from: f.period(data.from), to: f.period(data.to) });

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="type-h1 text-primary">{t('admin:dashboard.title')}</h1>
        <p className="type-body-s text-secondary" aria-live="polite">
          {rangeLabel}
        </p>
      </div>
      {controls}
    </header>
  );

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState message={t('admin:dashboard.errorLoading')} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {showSkeleton && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="card" />
            ))}
          </div>
        )}
      </div>
    );
  }

  const series = data.series;
  const all = collectionOf(data.items);
  const filtered = collectionOf(byKind(data.items, kind));
  const occupancy = pct(data.occupancy.occupied, data.occupancy.total);
  const trendLabel = data.range === 'month' ? t('admin:dashboard.trendLastSix') : t('admin:dashboard.trendRange');
  const lastDay = `${data.to.slice(0, 8)}${String(lastDayOfMonth(+data.to.slice(0, 4), +data.to.slice(5, 7))).padStart(2, '0')}`;
  const percent = (n: number | null) => (n === null ? '—' : `${n}%`);

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className={`flex flex-col gap-4 transition-opacity duration-fast ${isFetching ? 'opacity-60' : ''}`} aria-busy={isFetching || undefined}>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
          <Kpi
            label={t('admin:dashboard.totalRevenue')}
            value={f.pesoCompact(data.revenue)}
            exact={f.peso(data.revenue)}
            sub={t('admin:dashboard.revenueHint')}
            trend={series.map((p) => p.revenue)}
            trendLabel={trendLabel}
            to="/admin/payments"
          />
          <Kpi
            label={t('admin:dashboard.totalExpenses')}
            value={f.pesoCompact(data.expenses)}
            exact={f.peso(data.expenses)}
            sub={t('admin:dashboard.expensesHint')}
            trend={series.map((p) => p.expenses)}
            trendLabel={trendLabel}
          />
          <Kpi
            label={t('admin:dashboard.net')}
            value={f.pesoCompact(net(data.revenue, data.expenses))}
            exact={f.peso(net(data.revenue, data.expenses))}
            sub={t('admin:dashboard.netHint')}
            trend={series.map((p) => net(p.revenue, p.expenses))}
            trendLabel={trendLabel}
          />
          <Kpi
            label={t('admin:dashboard.occupancy')}
            value={percent(occupancy)}
            sub={t('admin:dashboard.bedsOccupied', { occupied: data.occupancy.occupied, total: data.occupancy.total })}
            trend={series.map((p) => pct(p.occupied, p.total_beds) ?? 0)}
            trendLabel={trendLabel}
            to="/admin/beds"
          />
          <div className="col-span-2 xl:col-span-1">
            <Kpi
              label={t('admin:dashboard.collectionRate')}
              value={percent(all.rate)}
              sub={all.billed ? t('admin:dashboard.collectedOfBilled', { collected: f.pesoCompact(all.collected), billed: f.pesoCompact(all.billed) }) : t('admin:dashboard.noBilling')}
              trend={series.flatMap((p) => pct(p.collected, p.billed) ?? [])}
              trendLabel={trendLabel}
              to="/admin/rent"
            />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <div className={`${CHART_PANEL} xl:col-span-2`}>
            <ColumnChart
              title={t('admin:dashboard.revenueVsExpenses')}
              series={[
                { label: t('admin:dashboard.revenue'), color: 'var(--color-chart-1)' },
                { label: t('admin:dashboard.expenses'), color: 'var(--color-chart-2)' },
              ]}
              data={series.map((p) => ({ label: shortMonth(p.period), longLabel: f.period(p.period), values: [p.revenue, p.expenses] }))}
              format={(n) => f.peso(n)}
              formatTick={(n) => f.pesoCompact(n)}
            />
          </div>
          <Card
            title={t('admin:dashboard.collection')}
            hint={t('admin:dashboard.collectionFor', { period: rangeLabel })}
            action={<SegmentedControl label={t('admin:dashboard.itemKind')} options={KINDS.map((k) => ({ value: k, label: t(`admin:dashboard.kind.${k}`) }))} value={kind} onChange={setKind} />}
          >
            {filtered.billed === 0 ? (
              <p className="py-6 text-center type-body-s text-secondary">{t('admin:dashboard.noBillingHint')}</p>
            ) : (
              <>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="type-amount-l text-primary">{percent(filtered.rate)}</span>
                  <span className="type-body-s text-secondary">{t('admin:dashboard.collectionSummary', { collected: f.peso(filtered.collected), billed: f.peso(filtered.billed) })}</span>
                </p>
                <BarList
                  title={t('admin:dashboard.collection')}
                  rows={filtered.buckets.map((b) => ({
                    label: t(`admin:dashboard.bucket.${b.status}`),
                    value: b.amount,
                    display: f.peso(b.amount),
                    detail: [t('admin:dashboard.itemCount', { count: b.count }), b.remaining ? t('admin:dashboard.stillDue', { amount: f.peso(b.remaining) }) : ''].filter(Boolean).join(' · '),
                  }))}
                />
              </>
            )}
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          {/* Both columns end level: Not paid fills what Viewings leaves on the left, the occupancy chart stretches on the right. */}
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
            <div className="min-w-0 xl:relative xl:min-h-[28rem] xl:flex-1">
              <NotPaidCard className={FILL_CARD} items={data.open_items} periodLabel={f.period(data.to)} />
            </div>
            <ViewingsWeekCard />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <BirthdaysCard />
            <Card title={t('admin:dashboard.attention')}>
              <div className="-mx-2 flex flex-col">
                <AttentionLink to="/admin/payments" label={t('admin:dashboard.paymentsToReview')} count={counts?.payments_to_review ?? 0} />
                <AttentionLink to="/admin/inquiries" label={t('admin:dashboard.newInquiries')} count={counts?.new_inquiries ?? 0} />
                <AttentionLink to="/admin/maintenance?tab=requests" label={t('admin:dashboard.newMaintenance')} count={counts?.new_maintenance ?? 0} />
                <AttentionLink to="/admin/inquiries" label={t('admin:dashboard.upcomingSchedule')} count={upcomingSchedule(inquiries ?? [], schedule?.events ?? [], manilaToday())} />
              </div>
            </Card>
            <div className={`${CHART_PANEL} xl:flex-1`}>
              <ColumnChart
                title={t('admin:dashboard.occupancyByMonth')}
                series={[{ label: t('admin:dashboard.occupied'), color: 'var(--color-chart-1)' }]}
                data={series.map((p) => ({ label: shortMonth(p.period), longLabel: f.period(p.period), values: [p.occupied] }))}
                format={(n) => t('admin:dashboard.bedsOccupied', { occupied: n, total: data.occupancy.total })}
                formatTick={(n) => String(n)}
                max={data.occupancy.total || 1}
              />
            </div>
          </div>
        </div>

        <ExpensesCard className="xl:max-h-[36rem]" from={data.from} to={lastDay} />
      </div>
    </div>
  );
}
