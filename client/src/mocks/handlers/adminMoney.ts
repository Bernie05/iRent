import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import type { Bill, ChargeRow, GenerateRentResult, PayResult, Payment, RejectResult, ShareRow, SignedUrl } from '../../types/api';
import { hasAtMostTwoDecimals } from '../../lib/money';
import { isIsoDate } from '../../lib/time';
import { REFERENCE_RE } from '../../validation/payments';
import { placeholderImage } from '../fixtures';
import {
  applyCredit,
  cents,
  currentPeriod,
  db,
  findItem,
  generateRent,
  isDuplicateReference,
  isOverdue,
  money,
  nowIso,
  nextId,
  paidTotal,
  recordPayment,
  rejectPayment,
  renterOfTenancy,
  splitEqually,
  statusOf,
  tenancyById,
  toChargeRow,
  toPayment,
  type BillRec,
} from '../db';
import { apiError, apiUrl, authorise, checkUpload, isResponse, latency, noContent, readMultipart, validationError } from '../http';

const admin = (request: Request) => authorise(request, 'admin');

function toBill(bill: BillRec): Bill {
  const shares = db.shares
    .filter((s) => s.bill_id === bill.id)
    .map((s) => toChargeRow(findItem('bill_share', s.id)!, true) as ShareRow);
  return { id: bill.id, type: bill.type, period: bill.period, total_amount: money(bill.total), due_date: bill.due_date, shares };
}

const moneyText = (value: unknown): value is string | number =>
  (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' && Number.isFinite(Number(value)) && hasAtMostTwoDecimals(String(value).trim());

/** Rent charges, payments and review, bills (B18, B19, B20). */
export const adminMoneyHandlers = [
  // ----- Rent charges -----
  http.get(apiUrl('/rent-charges'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const params = new URL(request.url).searchParams;
    const period = params.get('period') ?? currentPeriod();
    const status = params.get('status') ?? 'all';
    const rows = db.charges
      .filter((c) => c.period === period)
      .map((c) => findItem('charge', c.id)!)
      .filter((item) => {
        if (status === 'unpaid' || status === 'partial') return statusOf(item) === status;
        if (status === 'overdue') return isOverdue(item);
        return true;
      })
      .map((item) => toChargeRow(item, true))
      .sort((a, b) => (a.renter?.full_name ?? '').localeCompare(b.renter?.full_name ?? ''));
    return HttpResponse.json<ChargeRow[]>(rows);
  }),

  http.post(apiUrl('/rent-charges/generate'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const body = (await request.json().catch(() => ({}))) as { period?: string };
    const period = body.period ?? currentPeriod();
    if (!isIsoDate(period) || !period.endsWith('-01')) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { period: 'Use YYYY-MM-01' });
    return HttpResponse.json<GenerateRentResult>(generateRent(period, user.id));
  }),

  http.patch(apiUrl('/rent-charges/:id'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const item = findItem('charge', String(params.id));
    if (!item) return apiError(404, 'NOT_FOUND', 'Charge not found.');
    const body = (await request.json()) as { amount?: unknown; due_date?: unknown };
    if (body.due_date !== undefined && (typeof body.due_date !== 'string' || !isIsoDate(body.due_date))) {
      return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { due_date: 'Invalid date' });
    }
    if (body.amount !== undefined) {
      if (!moneyText(body.amount) || Number(body.amount) <= 0) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { amount: 'Invalid amount' });
      const amount = cents(String(body.amount));
      if (amount < paidTotal('charge', item.rec.id)) return apiError(400, 'AMOUNT_BELOW_PAID', 'The amount can\'t be less than what was already paid.');
      const raised = amount > item.rec.amount;
      item.rec.amount = amount;
      if (raised) applyCredit(renterOfTenancy(item.rec.tenancy_id)!, user.id); // E44
    }
    if (typeof body.due_date === 'string') (item.rec as { due_date: string }).due_date = body.due_date;
    return HttpResponse.json<ChargeRow>(toChargeRow(findItem('charge', item.rec.id)!, true));
  }),

  http.delete(apiUrl('/rent-charges/:id'), ({ request, params }) => {
    const user = admin(request);
    if (isResponse(user)) return user;
    const id = String(params.id);
    if (!db.charges.some((c) => c.id === id)) return apiError(404, 'NOT_FOUND', 'Charge not found.');
    if (db.payments.some((p) => p.item_type === 'charge' && p.item_id === id)) {
      return apiError(409, 'CHARGE_HAS_PAYMENTS', 'This charge has payments and can\'t be deleted.');
    }
    db.charges = db.charges.filter((c) => c.id !== id);
    return noContent();
  }),

  // ----- Payments -----
  http.get(apiUrl('/payments'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const verification = new URL(request.url).searchParams.get('verification');
    const rows = db.payments
      .filter((p) => p.method !== 'credit' && (!verification || p.verification === verification))
      .sort((a, b) => (verification === 'auto_verified' ? a.paid_at.localeCompare(b.paid_at) : b.paid_at.localeCompare(a.paid_at)))
      .map((p) => toPayment(p, true));
    return HttpResponse.json<Payment[]>(rows);
  }),

  http.post(apiUrl('/payments'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const { fields, files } = await readMultipart(request);
    const uploadError = checkUpload(files.receipt, false);
    if (uploadError) return uploadError;
    const details: Record<string, string> = {};
    if (fields.item_type !== 'charge' && fields.item_type !== 'bill_share') details.item_type = 'Invalid item type';
    if (!['cash', 'gcash', 'maya', 'bpi'].includes(fields.method)) details.method = 'Invalid method';
    if (!moneyText(fields.amount) || Number(fields.amount) <= 0 || Number(fields.amount) > 999_999.99) details.amount = 'Invalid amount';
    const reference = (fields.reference_no ?? '').trim();
    if (fields.method !== 'cash' || reference) {
      if (!REFERENCE_RE.test(reference)) details.reference_no = 'Invalid reference';
    }
    const paidAt = fields.paid_at ?? '';
    if (!isIsoDate(paidAt.slice(0, 10)) || paidAt.slice(0, 10) > db.today()) details.paid_at = 'Invalid date';
    if (Object.keys(details).length) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details);

    const item = findItem(fields.item_type as 'charge' | 'bill_share', fields.item_id);
    if (!item) return apiError(404, 'NOT_FOUND', 'Item not found.');
    if (statusOf(item) === 'paid') return apiError(409, 'ITEM_ALREADY_PAID', 'This item is already paid.');
    if (isDuplicateReference(fields.method, reference || null)) return apiError(409, 'DUPLICATE_REFERENCE', 'This reference number was already used.');
    const result = recordPayment({
      item,
      method: fields.method as 'cash' | 'gcash' | 'maya' | 'bpi',
      amount: cents(fields.amount),
      reference_no: reference || null,
      has_proof: Boolean(files.receipt),
      paid_at: paidAt.length === 10 ? `${paidAt}T12:00:00+08:00` : paidAt,
      notes: fields.notes?.trim() || null,
      verification: 'confirmed',
      submitted_by: user.id,
    });
    return HttpResponse.json<PayResult>(result, { status: 201 });
  }),

  http.patch(apiUrl('/payments/:id/review'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const payment = db.payments.find((p) => p.id === params.id);
    if (!payment) return apiError(404, 'NOT_FOUND', 'Payment not found.');
    const parsed = z
      .object({ action: z.enum(['confirm', 'reject']), reason: z.string().trim().max(500).optional() })
      .safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    if (payment.method === 'credit') return apiError(400, 'NOT_REVIEWABLE', 'Credit payments can\'t be reviewed.');
    if (payment.verification !== 'auto_verified') return apiError(409, 'ALREADY_REVIEWED', 'This payment was already reviewed.');
    if (parsed.data.action === 'confirm') {
      payment.verification = 'confirmed';
      payment.reviewed_at = nowIso();
      return HttpResponse.json<Payment>(toPayment(payment, true));
    }
    if (!parsed.data.reason) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { reason: 'Required' });
    return HttpResponse.json<RejectResult>(rejectPayment(payment, parsed.data.reason, user.id));
  }),

  http.get(apiUrl('/payments/:id/proof'), ({ request, params }) => {
    const user = admin(request);
    if (isResponse(user)) return user;
    const payment = db.payments.find((p) => p.id === params.id);
    if (!payment || !payment.has_proof) return apiError(404, 'NOT_FOUND', 'Payment not found.');
    return HttpResponse.json<SignedUrl>({ url: placeholderImage(`Screenshot ${payment.reference_no ?? ''}`) });
  }),

  // ----- Bills -----
  http.get(apiUrl('/bills'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const bills = [...db.bills].sort((a, b) => b.period.localeCompare(a.period) || b.created_at.localeCompare(a.created_at));
    return HttpResponse.json<Bill[]>(bills.map(toBill));
  }),

  http.post(apiUrl('/bills'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const parsed = z
      .object({
        type: z.enum(['electricity', 'water', 'internet']),
        period: z.string().refine((p) => isIsoDate(p) && p.endsWith('-01')),
        total_amount: z.number().min(0.01).max(1_000_000),
        due_date: z.string().refine(isIsoDate),
        shares: z.array(z.object({ tenancy_id: z.string(), amount: z.number().min(0) })).optional(),
      })
      .safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const total = cents(input.total_amount);
    const active = db.tenancies.filter((t) => t.is_active);
    if (active.length === 0) return apiError(400, 'NO_ACTIVE_TENANCIES', 'No active renters to split this bill with.');
    const shares = input.shares ? input.shares.map((s) => ({ tenancy_id: s.tenancy_id, amount: cents(s.amount) })) : splitEqually(total);
    if (shares.reduce((s, x) => s + x.amount, 0) !== total) return apiError(400, 'SHARES_SUM_MISMATCH', 'The shares must add up to the bill total.');
    if (shares.some((s) => !tenancyById(s.tenancy_id)?.is_active)) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { shares: 'Every share must belong to an active tenancy.' });
    const created = nowIso();
    const bill: BillRec = { id: nextId('bill'), type: input.type, period: input.period, total, due_date: input.due_date, created_at: created };
    db.bills.push(bill);
    for (const s of shares) db.shares.push({ id: nextId('shr'), bill_id: bill.id, tenancy_id: s.tenancy_id, amount: s.amount, created_at: created });
    for (const renterId of new Set(shares.map((s) => renterOfTenancy(s.tenancy_id)!))) applyCredit(renterId, user.id);
    return HttpResponse.json<Bill>(toBill(bill), { status: 201 });
  }),

  http.put(apiUrl('/bills/:id/shares'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const bill = db.bills.find((b) => b.id === params.id);
    if (!bill) return apiError(404, 'NOT_FOUND', 'Bill not found.');
    const parsed = z.object({ shares: z.array(z.object({ id: z.string(), amount: z.number().min(0) })) }).safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const current = db.shares.filter((s) => s.bill_id === bill.id);
    const next = new Map(current.map((s) => [s.id, s.amount]));
    for (const s of parsed.data.shares) {
      if (!next.has(s.id)) return apiError(404, 'NOT_FOUND', 'Share not found.');
      next.set(s.id, cents(s.amount));
    }
    if ([...next.values()].reduce((a, b) => a + b, 0) !== bill.total) return apiError(400, 'SHARES_SUM_MISMATCH', 'The shares must add up to the bill total.');
    for (const s of current) {
      if (next.get(s.id)! < paidTotal('bill_share', s.id)) return apiError(400, 'AMOUNT_BELOW_PAID', 'A share can\'t be less than what was already paid.');
    }
    for (const s of current) s.amount = next.get(s.id)!;
    for (const renterId of new Set(current.map((s) => renterOfTenancy(s.tenancy_id)!))) applyCredit(renterId, user.id);
    return HttpResponse.json<Bill>(toBill(bill));
  }),
];
