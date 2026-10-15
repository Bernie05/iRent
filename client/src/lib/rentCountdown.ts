import type { ChargeRow, MeTenancy } from '../types/api';
import { formatPeso } from './format';
import { addDays, addMonths, dueDateFor, periodOf } from './time';

export type RentCountdown =
  | { kind: 'overdue'; days: number; due: string }
  | { kind: 'due' | 'next'; days: number; due: string; period: string; amount: number; tenancyId: string };

/** Whole calendar days from `from` to `to` (both `YYYY-MM-DD`, parsed as UTC dates, so exact). */
const daysFrom = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;

/**
 * R76 (D-27, OQ-34, E72), in priority order: 1) the oldest open rent charge past due → overdue; 2) the earliest open rent
 * charge → due in N days (0 = today); 3) with an active tenancy, the BR-8 due date of the period after the tenancy's
 * latest rent charge (or the move-in month), only if it is today or later; 4) else nothing. `today` is the Manila date.
 */
export function rentCountdown(today: string, tenancy: MeTenancy | null | undefined, charges: ChargeRow[]): RentCountdown | null {
  const rent = charges.filter((c) => c.item.type === 'charge');
  const open = rent.filter((c) => c.status !== 'paid').sort((a, b) => a.due_date.localeCompare(b.due_date));
  const first = open[0];
  if (first && first.due_date < today) return { kind: 'overdue', days: daysFrom(first.due_date, today), due: first.due_date };
  if (first) return { kind: 'due', days: daysFrom(today, first.due_date), due: first.due_date, period: first.item.period, amount: first.remaining, tenancyId: first.tenancy_id };
  if (!tenancy) return null;

  const latest = rent.filter((c) => c.tenancy_id === tenancy.id).reduce<string | null>((max, c) => (max && max > c.item.period ? max : c.item.period), null);
  const period = latest ? addMonths(latest, 1) : periodOf(tenancy.move_in);
  const due = dueDateFor(tenancy.move_in, period);
  return due >= today ? { kind: 'next', days: daysFrom(today, due), due, period, amount: tenancy.bed.monthly_rate, tenancyId: tenancy.id } : null;
}

/** RFC 5545 TEXT escaping (backslash, semicolon, comma). */
const icsText = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`);

/**
 * R76 "Add to calendar": one all-day VEVENT on the due date, a stable UID (re-adding updates the same event) and a
 * VALARM at 9:00 AM the day before (15 h before the all-day start). CRLF line endings.
 */
export function rentIcs(c: { due: string; period: string; amount: number; tenancyId: string }, now: Date = new Date()): string {
  const date = (d: string) => d.replaceAll('-', '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//iRent//Rent reminder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:rent-${c.tenancyId}-${c.period.slice(0, 7)}@irent`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${date(c.due)}`,
    `DTEND;VALUE=DATE:${date(addDays(c.due, 1))}`,
    `SUMMARY:${icsText(`Rent due ${formatPeso(c.amount)} (iRent)`)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText('Rent is due tomorrow (iRent)')}`,
    'TRIGGER:-PT15H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** Downloads text as a file through a temporary Blob link (no dependency). */
export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
