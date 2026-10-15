/** Viewing calendar helpers (pure, Asia/Manila business dates). */
import { addDays, manilaToday } from '../../../lib/time';
import { dateFormat } from '../../../lib/format';
import type { Inquiry, ScheduleEvent } from '../../../types/api';

/** Manila date (YYYY-MM-DD) and time (HH:MM) of a scheduled viewing. */
export function manilaParts(iso: string): { date: string; time: string } {
  const instant = new Date(iso);
  const time = dateFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
  return { date: manilaToday(instant), time };
}

/** Weeks (Sunday first) covering the month of `period` (YYYY-MM-01), including the adjacent months' days. */
export function monthGrid(period: string): string[][] {
  const first = `${period.slice(0, 7)}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  let day = addDays(first, -weekday);
  const weeks: string[][] = [];
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
    day = addDays(day, 7);
  } while (day.slice(0, 7) === period.slice(0, 7));
  return weeks;
}

/** The seven days (Sunday first) of the week containing `date`. */
export function weekOf(date: string): string[] {
  const sunday = addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

export interface DayItems {
  viewings: Inquiry[];
  /** Open inquiries (not scheduled or closed) whose preferred date is this day. */
  preferred: Inquiry[];
}

/** Scheduled viewings and preferred-but-unscheduled dates, keyed by Manila date; viewings sorted by time. */
export function itemsByDate(inquiries: Inquiry[]): Map<string, DayItems> {
  const map = new Map<string, DayItems>();
  const at = (date: string) => map.get(date) ?? (map.set(date, { viewings: [], preferred: [] }).get(date) as DayItems);
  for (const i of inquiries) {
    if (i.status === 'scheduled' && i.scheduled_at) at(manilaParts(i.scheduled_at).date).viewings.push(i);
    else if (i.preferred_date && (i.status === 'new' || i.status === 'contacted')) at(i.preferred_date).preferred.push(i);
  }
  for (const v of map.values()) v.viewings.sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
  return map;
}

/** Other scheduled viewings at the same instant (a warning, not a block). */
export function clashesWith(inquiries: Inquiry[], scheduledAt: string, exceptId: string): Inquiry[] {
  const t = new Date(scheduledAt).getTime();
  return inquiries.filter((i) => i.id !== exceptId && i.status === 'scheduled' && i.scheduled_at && new Date(i.scheduled_at).getTime() === t);
}

/** Scheduled viewings today and tomorrow (Manila), for the dashboard's Needs attention. */
export function upcomingViewings(inquiries: Inquiry[], today: string): number {
  const days = new Set([today, addDays(today, 1)]);
  return inquiries.filter((i) => i.status === 'scheduled' && i.scheduled_at && days.has(manilaParts(i.scheduled_at).date)).length;
}

/** Admin schedule items (renter, other) keyed by Manila date: all-day items first, then by start time. */
export function eventsByDate(events: ScheduleEvent[]): Map<string, ScheduleEvent[]> {
  const map = new Map<string, ScheduleEvent[]>();
  for (const e of events) {
    const date = manilaParts(e.starts_at).date;
    map.set(date, [...(map.get(date) ?? []), e]);
  }
  for (const list of map.values()) list.sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at));
  return map;
}

/** Everything on the schedule today and tomorrow (Manila): viewings plus renter and other items. */
export function upcomingSchedule(inquiries: Inquiry[], events: ScheduleEvent[], today: string): number {
  const days = new Set([today, addDays(today, 1)]);
  return upcomingViewings(inquiries, today) + events.filter((e) => days.has(manilaParts(e.starts_at).date)).length;
}
