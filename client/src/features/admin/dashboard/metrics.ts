/**
 * Dashboard math (design pass). Pure functions over the analytics response, so they are unit-tested
 * and the server only has to return raw rows. Money is summed in centavos (lib/money), never on floats.
 */
import { fromCentavos, toCentavos } from '../../../lib/money';
import { addMonths, periodOf } from '../../../lib/time';
import type { ChargeRow, ItemStatus, RecurringExpense, RenterRow } from '../../../types/api';

export const sumPesos = (values: number[]) => fromCentavos(values.reduce((s, v) => s + toCentavos(v), 0));

/** Percentage with one decimal, or null when the whole is 0 (shown as "—", never as 0%). */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export const net = (revenue: number, expenses: number) => fromCentavos(toCentavos(revenue) - toCentavos(expenses));

export type ItemKind = 'all' | 'rent' | 'bills';
export function byKind(items: ChargeRow[], kind: ItemKind): ChargeRow[] {
  return kind === 'all' ? items : items.filter((i) => (i.item.type === 'charge') === (kind === 'rent'));
}

export interface CollectionBucket {
  status: ItemStatus;
  count: number;
  /** Billed amount of the items in this bucket. */
  amount: number;
  remaining: number;
}

export interface Collection {
  billed: number;
  collected: number;
  outstanding: number;
  /** collected / billed, % with one decimal; null when nothing was billed. */
  rate: number | null;
  buckets: CollectionBucket[];
}

/** Collection for a set of items: billed vs collected (cash and credit), and the paid / partial / unpaid split. */
export function collectionOf(items: ChargeRow[]): Collection {
  const billed = sumPesos(items.map((i) => i.amount));
  const collected = sumPesos(items.map((i) => i.paid_total));
  const buckets = (['paid', 'partial', 'unpaid'] as const).map((status) => {
    const rows = items.filter((i) => i.status === status);
    return { status, count: rows.length, amount: sumPesos(rows.map((i) => i.amount)), remaining: sumPesos(rows.map((i) => i.remaining)) };
  });
  return { billed, collected, outstanding: sumPesos(items.map((i) => i.remaining)), rate: pct(collected, billed), buckets };
}

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

export type NotPaidFilter = 'all' | 'overdue' | 'partial' | 'unpaid';

/** Open items for the "Not paid" table: filtered, most overdue first, then by renter name. */
export function notPaid(items: ChargeRow[], filter: NotPaidFilter): ChargeRow[] {
  return items
    .filter((i) => i.status !== 'paid')
    .filter((i) => (filter === 'all' ? true : filter === 'overdue' ? i.is_overdue : i.status === filter))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.renter?.full_name ?? '').localeCompare(b.renter?.full_name ?? ''));
}

export interface UpcomingBirthday {
  renter: RenterRow;
  /** Next occurrence (`YYYY-MM-DD`). */
  date: string;
  daysAway: number;
  /** Age on that day. */
  turns: number;
}

/** Next occurrence of a birthday on or after `today`; Feb 29 falls on Feb 28 in other years. */
export function nextBirthday(birthday: string, today: string): string {
  const at = (year: number) => {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return `${year}-${birthday.slice(5) === '02-29' && !leap ? '02-28' : birthday.slice(5)}`;
  };
  const year = +today.slice(0, 4);
  return at(year) >= today ? at(year) : at(year + 1);
}

/** Active renters whose next birthday falls this month or next month, soonest first. */
export function upcomingBirthdays(renters: RenterRow[], today: string): UpcomingBirthday[] {
  const lastPeriod = addMonths(periodOf(today), 1);
  return renters
    .filter((r) => r.status === 'active' && r.birthday)
    .map((renter) => {
      const date = nextBirthday(renter.birthday!, today);
      return { renter, date, daysAway: daysBetween(today, date), turns: +date.slice(0, 4) - +renter.birthday!.slice(0, 4) };
    })
    .filter((b) => periodOf(b.date) <= lastPeriod)
    .sort((a, b) => a.daysAway - b.daysAway || a.renter.full_name.localeCompare(b.renter.full_name));
}

export interface RenterDebt {
  renter: { id: string; full_name: string };
  /** Bed of the most recent open item (the current bed for an active renter). */
  bed: string | null;
  /** Open items, oldest due first (the order a payment toward the total is applied in, BR-10). */
  items: ChargeRow[];
  total: number;
  /** Distinct billing months with something still open (rent and that month's bill count once). */
  months: number;
  oldestDue: string;
  status: 'overdue' | 'partial' | 'unpaid';
}

// ponytail: same-day ties sort rent before bills, then by id; the server breaks ties by created_at, so a preview on
// two items due the same day could differ from the result. Add created_at to ChargeRow if that ever matters.
const byDue = (a: ChargeRow, b: ChargeRow) => a.due_date.localeCompare(b.due_date) || a.item.type.localeCompare(b.item.type) || a.id.localeCompare(b.id);

/** One row per renter: open items summed, months counted; a renter matches the filter when any item does. */
export function debtsByRenter(items: ChargeRow[], filter: NotPaidFilter): RenterDebt[] {
  const groups = new Map<string, ChargeRow[]>();
  for (const i of items.filter((x) => x.status !== 'paid')) {
    const key = i.renter?.id ?? i.tenancy_id;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return [...groups.values()]
    .filter((rows) => notPaid(rows, filter).length > 0)
    .map((rows) => {
      const sorted = [...rows].sort(byDue);
      const latest = [...rows].sort((a, b) => b.item.period.localeCompare(a.item.period))[0];
      return {
        renter: sorted[0].renter ?? { id: sorted[0].tenancy_id, full_name: '—' },
        bed: latest.bed?.label ?? null,
        items: sorted,
        total: sumPesos(sorted.map((i) => i.remaining)),
        months: new Set(sorted.map((i) => i.item.period)).size,
        oldestDue: sorted[0].due_date,
        status: sorted.some((i) => i.is_overdue) ? 'overdue' : sorted.some((i) => i.status === 'partial') ? 'partial' : 'unpaid',
      } satisfies RenterDebt;
    })
    .sort((a, b) => a.oldestDue.localeCompare(b.oldestDue) || a.renter.full_name.localeCompare(b.renter.full_name));
}

export interface Allocation {
  lines: { row: ChargeRow; applied: number; left: number }[];
  /** Still owed after the payment. */
  remaining: number;
  /** Beyond the total: becomes credit (BR-9). */
  credit: number;
}

/** A payment toward a renter's total, applied to the open items in the given order (oldest due first). */
export function allocate(items: ChargeRow[], amount: number): Allocation {
  let left = Math.max(0, toCentavos(amount));
  const lines = items.map((row) => {
    const due = toCentavos(row.remaining);
    const applied = Math.min(left, due);
    left -= applied;
    return { row, applied: fromCentavos(applied), left: fromCentavos(due - applied) };
  });
  return { lines, remaining: sumPesos(lines.map((l) => l.left)), credit: fromCentavos(left) };
}

/** "₱X fixed per month": active recurring templates whose months include `period`. */
export function fixedPerMonth(templates: RecurringExpense[], period: string): { total: number; count: number } {
  const live = templates.filter((r) => r.active && r.starts_on <= period && (!r.ends_on || r.ends_on >= period));
  return { total: sumPesos(live.map((r) => r.amount)), count: live.length };
}
