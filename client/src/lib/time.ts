/**
 * Asia/Manila business-date helpers (NFR7). Business dates are `YYYY-MM-DD` strings; a period is `YYYY-MM-01`.
 * Manila has no DST (UTC+8 all year), which keeps these helpers simple and exact.
 */
export const MANILA_TZ = 'Asia/Manila';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Today's date in Manila as `YYYY-MM-DD`. */
// en-CA formats as YYYY-MM-DD. Built once: manilaToday runs in many renders.
const MANILA_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export function manilaToday(now: Date = new Date()): string {
  return MANILA_DATE.format(now);
}

/** The period (`YYYY-MM-01`) that contains the given business date or instant. */
export function periodOf(value: string | Date = new Date()): string {
  const date = typeof value === 'string' ? value : manilaToday(value);
  return `${date.slice(0, 7)}-01`;
}

/** Adds whole days to a `YYYY-MM-DD` date. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** BR-8: the move-in day in period P, clamped to the month's last day. */
export function dueDateFor(moveIn: string, period: string): string {
  const dueDay = Number(moveIn.slice(8, 10));
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const day = Math.min(dueDay, lastDayOfMonth(year, month));
  return `${period.slice(0, 7)}-${String(day).padStart(2, '0')}`;
}

/**
 * Turns a business date (`YYYY-MM-DD`) into the instant at Manila midnight, or parses an ISO timestamp.
 * Use it before handing a value to `Intl.DateTimeFormat` with `timeZone: 'Asia/Manila'`.
 */
export function toInstant(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (ISO_DATE_RE.test(value)) return new Date(`${value}T00:00:00+08:00`);
  return new Date(value);
}

/** Shifts a period (`YYYY-MM-01`) by whole months: `addMonths('2026-01-01', -1)` → '2025-12-01'. */
export function addMonths(period: string, months: number): string {
  const index = Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1 + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}
