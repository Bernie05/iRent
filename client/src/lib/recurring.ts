import { lastDayOfMonth } from './time';

/** The due date of a monthly template in `period` (YYYY-MM-01): its due day, clamped to the month's last day (31 → 30 Apr, 28/29 Feb). */
export function recurringDueDate(dueDay: number, period: string): string {
  return `${period.slice(0, 8)}${String(Math.min(dueDay, lastDayOfMonth(+period.slice(0, 4), +period.slice(5, 7)))).padStart(2, '0')}`;
}
