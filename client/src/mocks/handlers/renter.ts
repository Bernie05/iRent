import { http, HttpResponse } from 'msw';
import type { Balance, ChargeRow, CreditLedger, Greeting, MyAnnouncements, PayResult, Payment, PaymentAccount, ShareRow, SignedUrl } from '../../types/api';
import { nextBirthday } from '../../features/admin/dashboard/metrics';
import { hasAtMostTwoDecimals } from '../../lib/money';
import { REFERENCE_RE } from '../../validation/payments';
import { placeholderImage } from '../fixtures';
import {
  balanceOf,
  cents,
  db,
  findItem,
  isDuplicateReference,
  isLive,
  byCustomOrder,
  publishAnnouncements,
  itemsOfRenter,
  ledgerOf,
  recordPayment,
  renterOfTenancy,
  statusOf,
  toAnnouncement,
  toChargeRow,
  toPayment,
  tenanciesOf,
} from '../db';
import { apiError, apiUrl, authorise, checkUpload, isResponse, latency, noContent, readMultipart } from '../http';

const byPeriodDesc = <T extends { item: { period: string }; due_date: string }>(a: T, b: T) =>
  b.item.period.localeCompare(a.item.period) || b.due_date.localeCompare(a.due_date);

/** Renter endpoints (`requireRole('renter')`). Scope: every tenancy of the caller, current and past. */
export const renterHandlers = [
  http.get(apiUrl('/me/charges'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    const rows = itemsOfRenter(user.id).filter((i) => i.type === 'charge').map((i) => toChargeRow(i, false));
    return HttpResponse.json<ChargeRow[]>(rows.sort(byPeriodDesc));
  }),

  http.get(apiUrl('/me/bills'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    const rows = itemsOfRenter(user.id).filter((i) => i.type === 'bill_share').map((i) => toChargeRow(i, false) as ShareRow);
    return HttpResponse.json<ShareRow[]>(rows.sort(byPeriodDesc));
  }),

  http.get(apiUrl('/me/balance'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    return HttpResponse.json<Balance>(balanceOf(user.id));
  }),

  http.get(apiUrl('/me/credit'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    return HttpResponse.json<CreditLedger>(ledgerOf(user.id));
  }),

  http.get(apiUrl('/me/payments'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    const tenancyIds = new Set(tenanciesOf(user.id).map((t) => t.id));
    const rows = db.payments
      .filter((p) => tenancyIds.has(p.tenancy_id))
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
      .map((p) => toPayment(p, false));
    return HttpResponse.json<Payment[]>(rows);
  }),

  http.get(apiUrl('/me/payments/:id/proof'), ({ request, params }) => {
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    const payment = db.payments.find((p) => p.id === params.id);
    // D-8: another renter's payment is 404, like a missing one.
    if (!payment || renterOfTenancy(payment.tenancy_id) !== user.id || !payment.has_proof) {
      return apiError(404, 'NOT_FOUND', 'Payment not found.');
    }
    return HttpResponse.json<SignedUrl>({ url: placeholderImage(`Screenshot ${payment.reference_no ?? ''}`) });
  }),

  http.post(apiUrl('/me/payments'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    const { fields, files } = await readMultipart(request);
    const uploadError = checkUpload(files.proof, true);
    if (uploadError) return uploadError;

    const details: Record<string, string> = {};
    if (fields.item_type !== 'charge' && fields.item_type !== 'bill_share') details.item_type = 'Invalid item type';
    if (!['gcash', 'maya', 'bpi'].includes(fields.method)) details.method = 'Invalid method';
    const amountText = (fields.amount ?? '').trim();
    const amount = Number(amountText);
    if (!amountText || !Number.isFinite(amount) || amount <= 0 || amount > 999_999.99 || !hasAtMostTwoDecimals(amountText)) details.amount = 'Invalid amount';
    const reference = (fields.reference_no ?? '').trim();
    if (!REFERENCE_RE.test(reference)) details.reference_no = 'Invalid reference';
    if (Object.keys(details).length) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details);

    const item = findItem(fields.item_type as 'charge' | 'bill_share', fields.item_id);
    if (!item || renterOfTenancy(item.rec.tenancy_id) !== user.id) return apiError(404, 'NOT_FOUND', 'Item not found.');
    if (statusOf(item) === 'paid') return apiError(409, 'ITEM_ALREADY_PAID', 'This item is already paid.');
    if (isDuplicateReference(fields.method, reference)) return apiError(409, 'DUPLICATE_REFERENCE', 'This reference number was already used.');

    const result = recordPayment({
      item,
      method: fields.method as 'gcash' | 'maya' | 'bpi',
      amount: cents(amountText),
      reference_no: reference,
      has_proof: true,
      paid_at: new Date().toISOString(),
      notes: null,
      verification: 'auto_verified',
      submitted_by: user.id,
    });
    return HttpResponse.json<PayResult>(result, { status: 201 });
  }),

  http.get(apiUrl('/me/payment-accounts'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    return HttpResponse.json<PaymentAccount[]>(db.settings.payment_accounts.filter((a) => a.enabled).map((a) => ({ ...a })));
  }),

  // R17 (D-30): pinned first, then the admin's custom order; plus the unread count. BR-17: published and not ended only.
  http.get(apiUrl('/me/announcements'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    publishAnnouncements(db); // ponytail: the mock runs the BR-18 job on reads; the server runs it every 5 minutes.
    const items = db.announcements
      .filter((a) => isLive(a))
      .sort(byCustomOrder)
      .map((a) => toAnnouncement(a, user.id));
    return HttpResponse.json<MyAnnouncements>({ items, unread_count: items.filter((a) => !a.is_read).length });
  }),

  http.post(apiUrl('/me/announcements/:id/read'), ({ request, params }) => {
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    const a = db.announcements.find((x) => x.id === params.id);
    if (!a || !isLive(a)) return apiError(404, 'NOT_FOUND', 'Announcement not found.');
    db.reads.add(`${String(params.id)}:${user.id}`);
    return noContent();
  }),

  /**
   * Proposed (birthday greeting): the rendered template on the caller's birthday (Asia/Manila; Feb 29 → Feb 28 in other
   * years), else null. The birth date itself never leaves the server (R61).
   */
  http.get(apiUrl('/me/greeting'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    const today = db.today();
    const g = db.greeting;
    if (!g.enabled || !user.birthday || nextBirthday(user.birthday, today) !== today) return HttpResponse.json<Greeting | null>(null);
    const name = user.full_name.trim().split(/\s+/)[0];
    const fill = (text: string) => text.replaceAll('{name}', name);
    return HttpResponse.json<Greeting | null>({ title: fill(g.title), message: fill(g.message), link_label: g.link_label, link_url: g.link_url, image_url: g.image_url });
  }),
];
