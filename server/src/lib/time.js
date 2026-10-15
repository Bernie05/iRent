/**
 * Time helpers (NFR7). Business dates are 'YYYY-MM-DD' strings in Asia/Manila;
 * a period is 'YYYY-MM-01'. Manila is UTC+8 all year (no DST).
 *
 * Test clock (D-12): when ALLOW_CLOCK_OVERRIDE=true (never in production), CLOCK_OVERRIDE
 * (an ISO instant) or setClockOverride() freezes "now".
 */
export const TIME_ZONE = 'Asia/Manila';

let runtimeOverride; // Date | undefined

function overrideAllowed() {
  // Same truthy values as config.js (boolFromEnv), so the two never disagree.
  const flag = process.env.ALLOW_CLOCK_OVERRIDE;
  return (flag === 'true' || flag === '1') && process.env.NODE_ENV !== 'production';
}

/** Set (or clear with undefined) the test clock. Throws if overrides are not allowed. */
export function setClockOverride(isoOrDate) {
  if (isoOrDate === undefined || isoOrDate === null) {
    runtimeOverride = undefined;
    return;
  }
  if (!overrideAllowed()) throw new Error('Clock override is not allowed in this environment');
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid clock override: ${isoOrDate}`);
  runtimeOverride = d;
}

/** The current instant, honouring the test clock. */
export function manilaNow() {
  if (overrideAllowed()) {
    if (runtimeOverride) return new Date(runtimeOverride.getTime());
    if (process.env.CLOCK_OVERRIDE) {
      const d = new Date(process.env.CLOCK_OVERRIDE);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar date of an instant in Manila, 'YYYY-MM-DD'. */
export function toManilaDate(instant) {
  return dateFmt.format(instant);
}

/** Today in Manila, 'YYYY-MM-DD'. */
export function manilaToday() {
  return toManilaDate(manilaNow());
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse 'YYYY-MM-DD' (strictly valid calendar date) → { y, m, d }. */
export function parseDate(date) {
  const match = DATE_RE.exec(date);
  if (!match) throw new TypeError(`Invalid date: ${date}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > lastDayOfMonth(y, m)) throw new TypeError(`Invalid date: ${date}`);
  return { y, m, d };
}

export function isValidDate(date) {
  try {
    parseDate(date);
    return true;
  } catch {
    return false;
  }
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
export const formatDate = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** Number of days in month `m` (1–12) of year `y`. */
export function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 'YYYY-MM-DD' or 'YYYY-MM' → 'YYYY-MM-01'. */
export function periodOf(date) {
  const text = /^\d{4}-\d{2}$/.test(date) ? `${date}-01` : date;
  const { y, m } = parseDate(text);
  return formatDate(y, m, 1);
}

/** Current Manila period 'YYYY-MM-01'. */
export function currentPeriod() {
  return periodOf(manilaToday());
}

const toUtcMs = (date) => {
  const { y, m, d } = parseDate(date);
  return Date.UTC(y, m - 1, d);
};

/** date + n days (n may be negative). */
export function addDays(date, n) {
  const dt = new Date(toUtcMs(date) + n * 86_400_000);
  return formatDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole days from a to b (b − a). */
export function daysBetween(a, b) {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}
