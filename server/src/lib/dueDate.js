import { formatDate, lastDayOfMonth, parseDate, periodOf } from './time.js';

/**
 * BR-8: rent due date for a period.
 * due_day = day(move_in); due_date = (P.year, P.month, min(due_day, last_day_of(P))).
 * The clamp is recomputed every month, so it never drifts.
 * The SQL twin is `public.due_date_for(date, date)` (B8); both use test/fixtures/due-dates.json.
 * @param {string} moveIn 'YYYY-MM-DD'
 * @param {string} period 'YYYY-MM-01' (or any date / 'YYYY-MM' in that month)
 * @returns {string} 'YYYY-MM-DD'
 */
export function dueDateFor(moveIn, period) {
  const { d: dueDay } = parseDate(moveIn);
  const { y, m } = parseDate(periodOf(period));
  return formatDate(y, m, Math.min(dueDay, lastDayOfMonth(y, m)));
}
