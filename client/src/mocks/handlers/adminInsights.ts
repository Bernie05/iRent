import { http, HttpResponse } from 'msw';
import type { AnalyticsPoint, AnalyticsRange, ChargeRow, DashboardAnalytics, Expense, RecurringExpense } from '../../types/api';
import { expenseSchema, recurringExpenseSchema } from '../../validation/admin';
import { addMonths, isIsoDate, lastDayOfMonth, periodOf } from '../../lib/time';
import { cents, currentPeriod, db, findItem, money, nextId, nowIso, paidTotal, postRecurringExpenses, resumeWatermark, toChargeRow, type ExpenseRec, type ItemRec, type RecurringRec } from '../db';
import { apiError, apiUrl, authorise, isResponse, latency, noContent, validationError } from '../http';

/**
 * Proposed endpoints (admin dashboard design pass, DESIGN.md → Proposed contract additions). Mock-only:
 * GET /dashboard/analytics, GET/POST /expenses, DELETE /expenses/:id.
 */
const admin = (request: Request) => authorise(request, 'admin');
const manilaPeriod = (iso: string) => periodOf(new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10));

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let p = from; p <= to; p = addMonths(p, 1)) out.push(p);
  return out;
}

/** Rent charges and bill shares of a month. */
function itemsOf(period: string): ItemRec[] {
  const charges = db.charges.filter((c) => c.period === period).map((c) => findItem('charge', c.id)!);
  const billIds = new Set(db.bills.filter((b) => b.period === period).map((b) => b.id));
  const shares = db.shares.filter((s) => billIds.has(s.bill_id)).map((s) => findItem('bill_share', s.id)!);
  return [...charges, ...shares];
}

function point(period: string): AnalyticsPoint {
  const archived = db.archive.find((a) => a.period === period);
  const items = itemsOf(period);
  const end = [`${period.slice(0, 8)}${String(lastDayOfMonth(+period.slice(0, 4), +period.slice(5, 7))).padStart(2, '0')}`, db.today()].sort()[0];
  const revenue = db.payments
    .filter((p) => p.method !== 'credit' && p.verification !== 'rejected' && manilaPeriod(p.paid_at) === period)
    .reduce((s, p) => s + p.amount, archived?.revenue ?? 0);
  return {
    period,
    revenue: money(revenue),
    expenses: money(db.expenses.filter((e) => periodOf(e.spent_on) === period).reduce((s, e) => s + e.amount, 0)),
    billed: money(items.reduce((s, i) => s + i.rec.amount, 0)),
    collected: money(items.reduce((s, i) => s + paidTotal(i.type, i.rec.id), 0)),
    occupied: db.tenancies.filter((t) => t.move_in <= end && (t.move_out === null || t.move_out >= end)).length,
    total_beds: db.beds.length,
  };
}

function firstPeriod(): string {
  const all = [...db.archive.map((a) => a.period), ...db.charges.map((c) => c.period), ...db.expenses.map((e) => periodOf(e.spent_on))];
  return all.sort()[0] ?? currentPeriod();
}

const toExpense = (e: ExpenseRec): Expense => ({ ...e, amount: money(e.amount) });
const toRecurring = ({ created_at: _c, ...r }: RecurringRec): RecurringExpense => ({ ...r, amount: money(r.amount) });
/** Mock of the proposed daily posting job: post this month's due entries before answering. */
const runPostingJob = () => postRecurringExpenses(db);

export const adminInsightsHandlers = [
  http.get(apiUrl('/dashboard/analytics'), async ({ request }) => {
    await latency();
    runPostingJob();
    const user = admin(request);
    if (isResponse(user)) return user;
    const params = new URL(request.url).searchParams;
    const range = (params.get('range') ?? 'month') as AnalyticsRange;
    const period = params.get('period') ?? currentPeriod();
    if (!['month', 'year', 'total'].includes(range)) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { range: 'Use month, year or total' });
    if (!isIsoDate(period) || !period.endsWith('-01')) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { period: 'Use YYYY-MM-01' });

    const now = currentPeriod();
    let from: string, to: string, window: string[];
    if (range === 'month') {
      from = to = period;
      window = monthsBetween(addMonths(period, -5), period);
    } else if (range === 'year') {
      from = `${period.slice(0, 4)}-01-01`;
      to = [`${period.slice(0, 4)}-12-01`, now].sort()[0];
      window = monthsBetween(from, to);
    } else {
      from = firstPeriod();
      to = now;
      window = monthsBetween(from, to);
    }
    const series = window.map(point);
    const inRange = series.filter((p) => p.period >= from && p.period <= to);
    const last = inRange[inRange.length - 1] ?? point(to);
    const sum = (key: 'revenue' | 'expenses') => money(inRange.reduce((s, p) => s + cents(p[key]), 0));
    const rows = (periods: string[]) =>
      periods
        .flatMap(itemsOf)
        .map((i) => toChargeRow(i, true) as ChargeRow)
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.renter?.full_name ?? '').localeCompare(b.renter?.full_name ?? ''));
    const items = rows(monthsBetween(from, to));
    const open_items = rows(monthsBetween(firstPeriod(), to)).filter((r) => r.status !== 'paid');

    return HttpResponse.json<DashboardAnalytics>({
      range,
      from,
      to,
      revenue: sum('revenue'),
      expenses: sum('expenses'),
      occupancy: { occupied: last.occupied, total: last.total_beds },
      series,
      items,
      open_items,
    });
  }),

  http.get(apiUrl('/expenses'), async ({ request }) => {
    await latency();
    runPostingJob();
    const user = admin(request);
    if (isResponse(user)) return user;
    const params = new URL(request.url).searchParams;
    const from = params.get('from') ?? '0000-01-01';
    const to = params.get('to') ?? '9999-12-31';
    const rows = db.expenses
      .filter((e) => e.spent_on >= from && e.spent_on <= to)
      .sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at));
    return HttpResponse.json<Expense[]>(rows.map(toExpense));
  }),

  http.post(apiUrl('/expenses'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const parsed = expenseSchema(() => db.today()).safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const { note, amount, ...rest } = parsed.data;
    const rec: ExpenseRec = { id: nextId('exp'), ...rest, amount: cents(amount), note: note ?? null, recurring_id: null, created_at: nowIso() };
    db.expenses.push(rec);
    return HttpResponse.json<Expense>(toExpense(rec), { status: 201 });
  }),

  // Edit one expense (one-off or posted from a template); a posted entry keeps its recurring_id, the template is untouched.
  http.patch(apiUrl('/expenses/:id'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const rec = db.expenses.find((e) => e.id === params.id);
    if (!rec) return apiError(404, 'NOT_FOUND', 'Expense not found.');
    const parsed = expenseSchema(() => db.today()).safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const { note, amount, ...rest } = parsed.data;
    Object.assign(rec, rest, { amount: cents(amount), note: note ?? null });
    return HttpResponse.json<Expense>(toExpense(rec));
  }),

  // ----- Recurring expense templates -----
  http.get(apiUrl('/recurring-expenses'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    runPostingJob();
    const rows = [...db.recurring].sort((a, b) => a.due_day - b.due_day || a.name.localeCompare(b.name));
    return HttpResponse.json<RecurringExpense[]>(rows.map(toRecurring));
  }),

  http.post(apiUrl('/recurring-expenses'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const parsed = recurringExpenseSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const { amount, note, ends_on, ...rest } = parsed.data;
    // A past start month is posted on the next run (BR-16, OQ-28 = A): the watermark starts empty.
    const rec: RecurringRec = { id: nextId('rec'), ...rest, amount: cents(amount), ends_on: ends_on ?? null, note: note ?? null, last_posted_period: null, created_at: nowIso() };
    db.recurring.push(rec);
    runPostingJob();
    return HttpResponse.json<RecurringExpense>(toRecurring(rec), { status: 201 });
  }),

  // Full update. Posted entries keep their amounts: only future months use the new values.
  http.patch(apiUrl('/recurring-expenses/:id'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const rec = db.recurring.find((r) => r.id === params.id);
    if (!rec) return apiError(404, 'NOT_FOUND', 'Recurring expense not found.');
    const parsed = recurringExpenseSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const { amount, note, ends_on, ...rest } = parsed.data;
    // Re-activating moves the watermark to the latest month whose due date has passed: paused months are not back-filled.
    const resumed = !rec.active && rest.active;
    Object.assign(rec, rest, { amount: cents(amount), ends_on: ends_on ?? null, note: note ?? null });
    if (resumed) rec.last_posted_period = resumeWatermark(db.today());
    runPostingJob();
    return HttpResponse.json<RecurringExpense>(toRecurring(rec));
  }),

  // Delete a template: entries already posted stay as ordinary expenses (recurring_id → null, like ON DELETE SET NULL).
  http.delete(apiUrl('/recurring-expenses/:id'), ({ request, params }) => {
    const user = admin(request);
    if (isResponse(user)) return user;
    if (!db.recurring.some((r) => r.id === params.id)) return apiError(404, 'NOT_FOUND', 'Recurring expense not found.');
    db.recurring = db.recurring.filter((r) => r.id !== params.id);
    for (const e of db.expenses) if (e.recurring_id === params.id) e.recurring_id = null;
    return noContent();
  }),

  http.delete(apiUrl('/expenses/:id'), ({ request, params }) => {
    const user = admin(request);
    if (isResponse(user)) return user;
    if (!db.expenses.some((e) => e.id === params.id)) return apiError(404, 'NOT_FOUND', 'Expense not found.');
    db.expenses = db.expenses.filter((e) => e.id !== params.id);
    return noContent();
  }),
];
