import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../../hooks/useFormat';
import { dateFormat, localeFor } from '../../../lib/format';
import { addDays, addMonths, lastDayOfMonth, manilaToday, periodOf, toInstant } from '../../../lib/time';
import type { Inquiry, ScheduleEvent } from '../../../types/api';
import { useDeleteScheduleEventMutation, useGetScheduleQuery } from '../../../services/endpoints/admin';
import { ConfirmDelete } from '../../../ui/ConfirmDialog';
import { useToast } from '../../../ui/ToastProvider';
import { ScheduleEventModal } from './ScheduleEventModal';
import { Button } from '../../../ui/Button';
import { IconButton } from '../../../ui/IconButton';
import { StatusBadge } from '../../../ui/StatusBadge';
import { Tabs } from '../../../ui/Tabs';
import { Pagination, usePaged } from '../../../ui/Pagination';
import { ChevronLeft, ChevronRight, Eye, Plus, Users, Wrench } from '../../../ui/icons';
import { eventsByDate, itemsByDate, manilaParts, monthGrid, type DayItems } from './calendar';
import { slotLabel } from './ScheduleModal';

/** The same day number in the month `by` months away, clamped to that month's last day (Jan 31 → Feb 28). */
function sameDayIn(date: string, by: number): string {
  const p = addMonths(periodOf(date), by);
  return `${p.slice(0, 8)}${String(Math.min(Number(date.slice(8)), lastDayOfMonth(+p.slice(0, 4), +p.slice(5, 7)))).padStart(2, '0')}`;
}

interface Actions {
  onSchedule: (i: Inquiry) => void;
  onCancel: (i: Inquiry) => void;
}

interface EventActions {
  onEdit: (e: ScheduleEvent) => void;
  onDelete: (e: ScheduleEvent) => void;
  onAdd: (date: string) => void;
}

/** Each kind has a colour (AA status pairs) and an icon + legend entry, so colour is never the only cue. */
const KIND = {
  viewing: { chip: 'bg-status-success-bg text-status-success-fg', Icon: Eye },
  renter: { chip: 'bg-status-info-bg text-status-info-fg', Icon: Users },
  other: { chip: 'bg-status-neutral-bg text-status-neutral-fg', Icon: Wrench }, // shown as "Maintenance"
} as const;

function Chip({ kind, text }: { kind: keyof typeof KIND; text: string }) {
  const { chip, Icon } = KIND[kind];
  return (
    <span className={`flex min-w-0 items-center gap-1 rounded-sm px-1 type-caption ${chip}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </span>
  );
}

/** "2:00 PM–3:00 PM", "10:00 AM" or "All day". */
function useEventTime() {
  const { t } = useTranslation();
  return (e: ScheduleEvent) =>
    e.all_day ? t('admin:schedule.allDay') : `${slotLabel(manilaParts(e.starts_at).time)}${e.ends_at ? `–${slotLabel(manilaParts(e.ends_at).time)}` : ''}`;
}

const noop = () => {};

/**
 * Viewing calendar (in-house, no dependency: a month grid is ~150 lines and a calendar library would add tens of kB for
 * features we don't use). Desktop: an APG date-grid (a table with one roving-tabindex button per day; arrows move by
 * day/week, Home/End by week, PageUp/PageDown by month; Enter selects), each day named like "Saturday, October 17, 2026,
 * 2 viewings, today". Days with viewings show time and name; preferred-but-unscheduled dates show lighter. Phones get an
 * agenda list of the month instead of the grid. All dates are Asia/Manila.
 * Inquiries uses it for viewings + renter items; the Maintenance page (`maintenance`) for maintenance ("other") items
 * only, with the selected day as the side panel (no inquiries, no legend).
 */
export function ViewingCalendar({ inquiries = [], onSchedule = noop, onCancel = noop, maintenance = false }: { inquiries?: Inquiry[]; maintenance?: boolean } & Partial<Actions>) {
  const { t } = useTranslation();
  const f = useFormat();
  const today = manilaToday();
  const [period, setPeriod] = useState(periodOf(today));
  const [selected, setSelected] = useState(today);
  const [panel, setPanel] = useState<'inquiries' | 'day'>('inquiries');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState(today);
  const [moved, setMoved] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<ScheduleEvent | null>(null);
  const toast = useToast();
  const eventTime = useEventTime();
  const [deleteEvent, { isLoading: isDeleting }] = useDeleteScheduleEventMutation();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const items = itemsByDate(inquiries);
  const weeks = monthGrid(period);
  const { data: feed } = useGetScheduleQuery({ from: weeks[0][0], to: weeks[weeks.length - 1][6] });
  const events = eventsByDate((feed?.events ?? []).filter((e) => (e.type === 'other') === maintenance));
  const emptyDay = t(maintenance ? 'admin:maintenance.emptyDay' : 'admin:viewings.emptyDay');
  const eventActions: EventActions = { onEdit: setEditingEvent, onDelete: setDeletingEvent, onAdd: setAdding };

  async function onConfirmDelete() {
    if (!deletingEvent) return;
    try {
      const r = await deleteEvent(deletingEvent.id).unwrap();
      toast.show('success', `${t('admin:schedule.deleted')}${r.notified.renter ? ` ${t('admin:schedule.renterEmailedCancel')}` : ''}`);
      setDeletingEvent(null);
    } catch {
      toast.show('error', t('errors:UNKNOWN'));
    }
  }
  const locale = localeFor(f.language);
  const weekday = (d: string, style: 'short' | 'long') => dateFormat(locale, { weekday: style }).format(toInstant(d));
  const longDate = (d: string) => dateFormat(locale, { dateStyle: 'full' }).format(toInstant(d));

  // Keyboard moves focus to the new day (switching month when needed), but never steals focus on first render.
  useEffect(() => {
    if (moved) buttons.current.get(focusDate)?.focus();
  }, [focusDate, period, moved]);

  function go(date: string) {
    setMoved(true);
    setFocusDate(date);
    if (date.slice(0, 7) !== period.slice(0, 7)) setPeriod(periodOf(date));
  }

  function onKeyDown(e: KeyboardEvent, date: string) {
    const weekdayIndex = new Date(`${date}T00:00:00Z`).getUTCDay();
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      Home: () => addDays(date, -weekdayIndex),
      End: () => addDays(date, 6 - weekdayIndex),
      PageUp: () => sameDayIn(date, -1),
      PageDown: () => sameDayIn(date, 1),
    };
    const next = moves[e.key]?.();
    if (!next) return;
    e.preventDefault();
    go(next);
  }

  const dayLabel = (d: string, it?: DayItems) =>
    [
      longDate(d),
      it?.viewings.length ? t('admin:viewings.countViewings', { count: it.viewings.length }) : null,
      events.get(d)?.length ? t('admin:schedule.countItems', { count: events.get(d)!.length }) : null,
      it?.preferred.length ? t('admin:viewings.countPreferred', { count: it.preferred.length }) : null,
      d === today ? t('admin:viewings.today') : null,
    ]
      .filter(Boolean)
      .join(', ');

  const title = dateFormat(locale, { month: 'long', year: 'numeric' }).format(toInstant(period));
  const open = inquiries.filter((i) => i.status === 'new' || i.status === 'contacted').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const monthDays = [...new Set([...items.keys(), ...events.keys()])].filter((d) => d.slice(0, 7) === period.slice(0, 7)).sort();

  return (
    <section aria-labelledby="calendar-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="calendar-title" className="type-h3 text-primary" aria-live="polite">
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-1">
          <IconButton label={t('admin:viewings.prevMonth')} icon={<ChevronLeft className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setPeriod(addMonths(period, -1))} />
          <Button
            variant="secondary"
            onClick={() => {
              setPeriod(periodOf(today));
              setSelected(today);
              setFocusDate(today);
            }}
          >
            {t('admin:viewings.today')}
          </Button>
          <IconButton label={t('admin:viewings.nextMonth')} icon={<ChevronRight className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setPeriod(addMonths(period, 1))} />
          <Button iconLeft={<Plus className="h-icon-sm w-icon-sm" aria-hidden="true" />} onClick={() => setAdding(selected)}>
            {t('admin:schedule.add')}
          </Button>
        </div>
      </div>

      {!maintenance && (
      <ul aria-label={t('admin:schedule.legend')} className="flex flex-wrap gap-x-4 gap-y-1 type-caption text-secondary">
        {(['viewing', 'renter'] as const).map((k) => {
          const { chip, Icon } = KIND[k];
          return (
            <li key={k} className="flex items-center gap-1.5">
              <span className={`inline-flex h-4 w-4 items-center justify-center rounded-sm ${chip}`} aria-hidden="true">
                <Icon className="h-3 w-3" />
              </span>
              {t(`admin:schedule.kind.${k}`)}
            </li>
          );
        })}
      </ul>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0">
        {/* Desktop grid */}
        <table role="grid" aria-labelledby="calendar-title" className="hidden w-full lg:table table-fixed border-collapse overflow-hidden rounded-lg border bg-surface">
          <thead>
            <tr>
              {weeks[0].map((d) => (
                <th key={d} scope="col" abbr={weekday(d, 'long')} className="border-b bg-muted py-2 type-label-xs text-secondary">
                  {weekday(d, 'short')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]}>
                {week.map((d) => {
                  const it = items.get(d);
                  const inMonth = d.slice(0, 7) === period.slice(0, 7);
                  const tabbable = focusDate.slice(0, 7) === period.slice(0, 7) ? d === focusDate : d === `${period.slice(0, 8)}01`;
                  return (
                    <td key={d} role="gridcell" aria-selected={d === selected} className="h-24 border-b border-r p-0 align-top last:border-r-0">
                      <button
                        ref={(el) => {
                          if (el) buttons.current.set(d, el);
                          else buttons.current.delete(d);
                        }}
                        type="button"
                        tabIndex={tabbable ? 0 : -1}
                        aria-label={`${dayLabel(d, it)}${d === highlight ? `, ${t('admin:viewings.highlighted')}` : ''}`}
                        onClick={(e) => {
                          setSelected(d);
                          setFocusDate(d);
                          setPanel('day');
                          // A mouse click on an empty day opens "Add schedule"; keyboard activation (detail 0) only selects the day
                          // and the panel offers "+ Add schedule".
                          if (e.detail > 0 && !it && !events.get(d)) setAdding(d);
                        }}
                        onKeyDown={(e) => onKeyDown(e, d)}
                        className={`flex h-full w-full flex-col items-stretch gap-1 p-1.5 text-left transition-colors duration-fast hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
                          d === selected ? 'bg-brand-subtle' : ''
                        } ${d === highlight ? 'outline outline-2 -outline-offset-2 outline-[color:var(--color-mark)]' : ''} ${inMonth ? '' : 'opacity-50'}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full type-label-xs ${d === today ? 'bg-primary text-on-brand' : 'text-primary'}`}
                        >
                          {Number(d.slice(8))}
                        </span>
                        <span aria-hidden="true" className="flex flex-col gap-0.5">
                          {[
                            ...(it?.viewings ?? []).map((v) => ({ id: v.id, kind: 'viewing' as const, text: `${slotLabel(manilaParts(v.scheduled_at!).time)} ${v.name.split(' ')[0]}` })),
                            ...(events.get(d) ?? []).map((e) => ({ id: e.id, kind: e.type, text: `${e.all_day ? '' : `${slotLabel(manilaParts(e.starts_at).time)} `}${e.title}` })),
                          ]
                            .slice(0, 3)
                            .map((c) => (
                              <Chip key={c.id} kind={c.kind} text={c.text} />
                            ))}
                          {(it?.viewings.length ?? 0) + (events.get(d)?.length ?? 0) > 3 && (
                            <span className="type-caption text-secondary">{t('admin:viewings.more', { count: (it?.viewings.length ?? 0) + (events.get(d)?.length ?? 0) - 3 })}</span>
                          )}
                          {it?.preferred.slice(0, 1).map((p) => (
                            <span key={p.id} className="truncate rounded-sm border border-dashed px-1 type-caption text-tertiary">
                              {t('admin:viewings.preferredShort', { name: p.name.split(' ')[0] })}
                            </span>
                          ))}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

      {/* Phones and tablets: agenda of the month */}
      <div className="flex flex-col gap-4 lg:hidden" aria-label={t('admin:viewings.agenda')} role="region">
        {monthDays.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center type-body-s text-secondary">{t(maintenance ? 'admin:maintenance.emptyMonth' : 'admin:viewings.emptyMonth')}</p>
        ) : (
          monthDays.map((d) => (
            <div key={d} className="rounded-lg border bg-surface p-4">
              <DayList date={d} heading={`${longDate(d)}${d === today ? ` · ${t('admin:viewings.today')}` : ''}`} items={items.get(d)} events={events.get(d)} eventTime={eventTime} empty={emptyDay} {...eventActions} onSchedule={onSchedule} onCancel={onCancel} />
            </div>
          ))
        )}
      </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-surface p-4">
          {maintenance ? (
            <DayList date={selected} heading={longDate(selected)} events={events.get(selected)} eventTime={eventTime} empty={emptyDay} {...eventActions} onSchedule={onSchedule} onCancel={onCancel} />
          ) : (
          <>
          <Tabs
            label={t('admin:viewings.panelLabel')}
            items={[
              { value: 'inquiries', label: t('admin:viewings.tabInquiries', { count: open.length }) },
              { value: 'day', label: t('admin:viewings.tabDay') },
            ]}
            value={panel}
            onChange={setPanel}
          />
          <div role="tabpanel" aria-label={panel === 'day' ? t('admin:viewings.tabDay') : t('admin:viewings.tabInquiries', { count: open.length })}>
            {panel === 'day' ? (
              <div className="flex flex-col gap-3">
                <DayList date={selected} heading={longDate(selected)} items={items.get(selected)} events={events.get(selected)} eventTime={eventTime} empty={emptyDay} {...eventActions} onSchedule={onSchedule} onCancel={onCancel} />
                <button type="button" onClick={() => setPanel('inquiries')} className="inline-flex min-h-touch w-fit items-center gap-1 rounded-md type-label-s text-secondary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
                  <ChevronLeft className="h-icon-sm w-icon-sm" aria-hidden="true" />
                  {t('admin:viewings.backToInquiries')}
                </button>
              </div>
            ) : (
              <InquiriesPanel
                inquiries={open}
                onSchedule={onSchedule}
                onShow={(d) => {
                  setHighlight(d);
                  setPeriod(periodOf(d));
                  setFocusDate(d);
                  setSelected(d);
                }}
                highlight={highlight}
              />
            )}
          </div>
          </>
          )}
        </div>
      </div>

      {(adding !== null || editingEvent) && (
        <ScheduleEventModal
          key={editingEvent?.id ?? `new-${adding}`}
          date={adding ?? selected}
          editing={editingEvent ?? undefined}
          inquiries={inquiries}
          maintenance={maintenance}
          onClose={() => {
            setAdding(null);
            setEditingEvent(null);
          }}
        />
      )}
      <ConfirmDelete
        item={deletingEvent?.title ?? null}
        detail={deletingEvent?.notify_renter ? t('admin:schedule.deleteDetailRenter') : deletingEvent?.announcement_id ? t('admin:schedule.deleteDetailNotice') : undefined}
        busy={isDeleting}
        onCancel={() => setDeletingEvent(null)}
        onConfirm={() => void onConfirmDelete()}
      />
    </section>
  );
}

/** Open inquiries not scheduled yet (New, Contacted), newest first: Schedule, the message, and "Show on calendar". */
function InquiriesPanel({ inquiries, onSchedule, onShow, highlight }: { inquiries: Inquiry[]; onSchedule: (i: Inquiry) => void; onShow: (date: string) => void; highlight: string | null }) {
  const { t } = useTranslation();
  const f = useFormat();
  const paged = usePaged(inquiries, 6);
  if (inquiries.length === 0) return <p className="type-body-s text-secondary">{t('admin:viewings.noOpen')}</p>;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-default">
        {paged.rows.map((i) => (
          <li key={i.id} className={`flex flex-col gap-2 py-3 first:pt-0 ${highlight && i.preferred_date === highlight ? 'rounded-md bg-brand-subtle px-2' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 flex-col">
                <span className="type-body-s-strong text-primary">{i.name}</span>
                <a href={`tel:${i.phone.replace(/\s/g, '')}`} className="w-fit type-caption text-secondary underline">
                  {i.phone}
                </a>
                <span className="type-caption text-tertiary">
                  {i.preferred_date ? t('admin:inquiries.preferredDate', { date: f.date(i.preferred_date) }) : t('admin:viewings.noPreferred')}
                </span>
              </span>
              <StatusBadge tone={i.status === 'new' ? 'info' : 'warning'}>{t(`domain:inquiryStatus.${i.status}`)}</StatusBadge>
            </div>
            {i.message && (
              <details className="type-body-s text-primary">
                <summary className="inline-flex min-h-touch cursor-pointer items-center rounded-md type-label-xs text-secondary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">{t('admin:viewings.message')}</summary>
                <p className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{i.message}</p>
              </details>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" aria-label={t('admin:viewings.scheduleFor', { name: i.name })} onClick={() => onSchedule(i)}>
                {t('admin:viewings.schedule')}
              </Button>
              {i.preferred_date && (
                <Button variant="ghost" aria-label={t('admin:viewings.showOnCalendar', { name: i.name })} onClick={() => onShow(i.preferred_date!)}>
                  {t('admin:viewings.show')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Pagination pager={paged} label={t('ui:pagination.pagesOf', { name: t('admin:inquiries.title') })} />
    </div>
  );
}

/**
 * One day: "+ Add schedule", then every item by time: viewings (Reschedule/Cancel), renter or maintenance items (Edit/Delete),
 * and preferred-but-unscheduled visitors (Schedule).
 */
function DayList({
  date,
  heading,
  items,
  events = [],
  eventTime,
  empty,
  onSchedule,
  onCancel,
  onEdit,
  onDelete,
  onAdd,
}: { date: string; heading: string; items?: DayItems; events?: ScheduleEvent[]; eventTime: (e: ScheduleEvent) => string; empty: string } & Actions & EventActions) {
  const { t } = useTranslation();
  const headingId = `day-${date}`;
  const viewings = items?.viewings ?? [];
  const preferred = items?.preferred ?? [];
  // Viewings and events merged by start time (all-day items first).
  const timeline: ({ key: string; viewing: Inquiry; event?: undefined } | { key: string; event: ScheduleEvent; viewing?: undefined })[] = [
    ...viewings.map((v) => ({ key: v.scheduled_at!, viewing: v })),
    ...events.map((e) => ({ key: e.all_day ? '' : e.starts_at, event: e })),
  ].sort((x, y) => new Date(x.key || 0).getTime() - new Date(y.key || 0).getTime());
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="type-h4 text-primary">
          {heading}
        </h3>
        <Button variant="secondary" iconLeft={<Plus className="h-icon-sm w-icon-sm" aria-hidden="true" />} aria-label={t('admin:schedule.addOn', { date: heading })} onClick={() => onAdd(date)}>
          {t('admin:schedule.addShort')}
        </Button>
      </div>
      {timeline.length === 0 && preferred.length === 0 ? (
        <p className="type-body-s text-secondary">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-default">
          {timeline.map(({ event: e, viewing: v }) =>
            e ? (
              <li key={e.id} className="flex flex-col gap-2 py-3 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="type-body-s-strong text-primary">
                      {eventTime(e)} · {e.title}
                    </span>
                    {e.renter && <span className="type-caption text-secondary">{e.renter.full_name}</span>}
                    {e.note && <span className="type-caption text-tertiary">{e.note}</span>}
                    {e.notify_renter && <span className="type-caption text-tertiary">{t('admin:schedule.renterGetsEmails')}</span>}
                    {e.announcement_id && <span className="type-caption text-tertiary">{t('admin:schedule.postedToRenters')}</span>}
                    {e.maintenance_request_id && <span className="type-caption text-tertiary">{t('admin:schedule.linkedRequest')}</span>}
                  </span>
                  <Chip kind={e.type} text={t(`admin:schedule.kind.${e.type}`)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" aria-label={t('admin:schedule.editFor', { title: e.title })} onClick={() => onEdit(e)}>
                    {t('admin:schedule.edit')}
                  </Button>
                  <Button variant="ghost" aria-label={t('admin:schedule.deleteFor', { title: e.title })} onClick={() => onDelete(e)}>
                    {t('admin:schedule.delete')}
                  </Button>
                </div>
              </li>
            ) : (
              <li key={v!.id} className="flex flex-col gap-2 py-3 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="type-body-s-strong text-primary">
                      {slotLabel(manilaParts(v!.scheduled_at!).time)} · {v!.name}
                    </span>
                    <a href={`tel:${v!.phone.replace(/\s/g, '')}`} className="w-fit type-caption text-secondary underline">
                      {v!.phone}
                    </a>
                    {v!.schedule_note && <span className="type-caption text-tertiary">{v!.schedule_note}</span>}
                  </span>
                  <Chip kind="viewing" text={t('admin:schedule.kind.viewing')} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" aria-label={t('admin:viewings.rescheduleFor', { name: v!.name })} onClick={() => onSchedule(v!)}>
                    {t('admin:viewings.reschedule')}
                  </Button>
                  <Button variant="ghost" aria-label={t('admin:viewings.cancelFor', { name: v!.name })} onClick={() => onCancel(v!)}>
                    {t('admin:viewings.cancel')}
                  </Button>
                </div>
              </li>
            ),
          )}
          {preferred.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-3 first:pt-0">
              <span className="flex flex-col">
                <span className="type-body-s text-primary">{p.name}</span>
                <span className="type-caption text-tertiary">{t('admin:viewings.preferredDay')}</span>
              </span>
              <Button variant="secondary" aria-label={t('admin:viewings.scheduleFor', { name: p.name })} onClick={() => onSchedule(p)}>
                {t('admin:viewings.schedule')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
