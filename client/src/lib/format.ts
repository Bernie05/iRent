/**
 * Localised formatting (R47, NFR7). Money and dates use `Intl` with `en-PH` or `fil-PH`,
 * and every date is shown in Asia/Manila time.
 */
import type { Language } from '../types/api';
import { MANILA_TZ, toInstant } from './time';

export type AppLocale = 'en-PH' | 'fil-PH';

export function localeFor(language: Language): AppLocale {
  return language === 'fil' ? 'fil-PH' : 'en-PH';
}

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.PluralRules>();
function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.PluralRules>(key: string, make: () => T): T {
  let value = cache.get(key) as T | undefined;
  if (!value) {
    value = make();
    cache.set(key, value);
  }
  return value;
}

/** A shared `Intl.DateTimeFormat` in Manila time, built once per locale + options (never per render). */
export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return cached(`dtf:${locale}:${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, { timeZone: MANILA_TZ, ...options }));
}

export interface PesoOptions {
  /**
   * Rate cards: show 0 decimals when the amount is a whole number (`₱4,500`). A non-whole amount still
   * shows its centavos, so money is never rounded away.
   */
  whole?: boolean;
  language?: Language;
}

/** `formatPeso(4500, { whole: true })` → "₱4,500"; `formatPeso(333.3)` → "₱333.30". */
export function formatPeso(amount: number, options: PesoOptions = {}): string {
  const locale = localeFor(options.language ?? 'en');
  const digits = options.whole && Number.isInteger(amount) ? 0 : 2;
  const format = cached(`peso:${locale}:${digits}`, () =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'PHP',
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
  );
  return format.format(amount);
}

export type DateStyle = 'medium' | 'long' | 'short';

/**
 * A business date (`YYYY-MM-DD`, taken as a Manila calendar date) or an ISO timestamp, shown in Manila time.
 * `formatDate('2026-09-30T16:30:00Z')` → "Oct 1, 2026".
 */
export function formatDate(value: string | Date, options: { language?: Language; style?: DateStyle } = {}): string {
  const locale = localeFor(options.language ?? 'en');
  const style = options.style ?? 'medium';
  const format = cached(`date:${locale}:${style}`, () =>
    new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: MANILA_TZ }),
  );
  return format.format(toInstant(value));
}

/** An ISO timestamp with date and time, in Manila time (e.g. history rows). */
export function formatDateTime(value: string | Date, options: { language?: Language } = {}): string {
  const locale = localeFor(options.language ?? 'en');
  const format = cached(`datetime:${locale}`, () =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: MANILA_TZ }),
  );
  return format.format(toInstant(value));
}

/** A period (`YYYY-MM-01`) as month and year: "October 2026" / "Oktubre 2026". */
export function formatPeriod(period: string, options: { language?: Language } = {}): string {
  const locale = localeFor(options.language ?? 'en');
  const format = cached(`period:${locale}`, () =>
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: MANILA_TZ }),
  );
  return format.format(toInstant(`${period.slice(0, 7)}-01`));
}

/**
 * The rent due day (BR-8) as an ordinal: EN "5th", "21st"; FIL "ika-5".
 * Used in the Renters due-day column and the "Rent will be due on day {d} of each month." helper.
 */
export function formatDueDay(day: number, options: { language?: Language } = {}): string {
  if (options.language === 'fil') return `ika-${day}`;
  const rules = cached('ordinal:en', () => new Intl.PluralRules('en-PH', { type: 'ordinal' }));
  const suffix: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' };
  return `${day}${suffix[rules.select(day)] ?? 'th'}`;
}

/** Compact peso for KPI tiles and chart axes: "₱38.5K", "₱1.2M", "₱950". Exact amounts stay in tables. */
export function formatPesoCompact(amount: number, options: { language?: Language } = {}): string {
  const locale = localeFor(options.language ?? 'en');
  const format = cached(`pesoCompact:${locale}`, () =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'PHP', currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: 1 }),
  );
  return format.format(amount);
}

/** "10:30" → "10:30 AM" (a wall-clock label; the time is Manila time). */
export function slotLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * R72 window label of a maintenance notice: "Oct 20 – 24" ("Oct 20" for one day), plus " · 9:00 AM–5:00 PM" when it
 * has a daily time window. `null` for a general announcement.
 */
export function maintenanceWindow(
  a: { kind?: string; starts_on?: string | null; ends_on?: string | null; start_time?: string | null; end_time?: string | null },
  options: { language?: Language } = {},
): string | null {
  if (a.kind !== 'maintenance' || !a.starts_on || !a.ends_on) return null;
  const locale = localeFor(options.language ?? 'en');
  const format = cached(`monthDay:${locale}`, () => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: MANILA_TZ }));
  const dates = a.starts_on === a.ends_on ? format.format(toInstant(a.starts_on)) : format.formatRange(toInstant(a.starts_on), toInstant(a.ends_on));
  return a.start_time && a.end_time ? `${dates} · ${slotLabel(a.start_time)}–${slotLabel(a.end_time)}` : dates;
}
