import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import type { Bed, CreateRenterResult, CreditLedger, Dashboard, LedgerEntry, MoveOutPreview, MoveOutResult, RenterRow, Tenancy } from '../../types/api';
import { addRenterSchema, bedSchema, editRenterSchema } from '../../validation/admin';
import { refundSchema } from '../../validation/payments';
import { isIsoDate, manilaToday } from '../../lib/time';
import {
  activeTenancyOf,
  activeTenancyOnBed,
  addLedger,
  applyCredit,
  bedById,
  cents,
  creditBalance,
  currentPeriod,
  db,
  findItem,
  ledgerOf,
  money,
  nextId,
  nowIso,
  openItemsOf,
  profileById,
  remainingOf,
  tenancyById,
  toBed,
  toLedgerEntry,
  toRenterRow,
  type TenancyRec,
} from '../db';
import { apiError, apiUrl, authorise, checkUpload, isResponse, latency, noContent, readMultipart, validationError } from '../http';

const admin = (request: Request) => authorise(request, 'admin');

function toTenancy(t: TenancyRec): Tenancy {
  const renter = profileById(t.renter_id)!;
  const bed = bedById(t.bed_id)!;
  return {
    id: t.id,
    renter: { id: renter.id, full_name: renter.full_name },
    bed: { id: bed.id, label: bed.label, room: bed.room },
    move_in: t.move_in,
    move_out: t.move_out,
    is_active: t.is_active,
  };
}

/** Dashboard, beds, renters and tenancies (B14, B15, B13 resend). */
export const adminPeopleHandlers = [
  http.get(apiUrl('/dashboard'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const period = currentPeriod();
    const month = period.slice(0, 7);
    const manilaMonth = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 7);
    const collected = db.payments
      .filter((p) => p.verification !== 'rejected' && p.method !== 'credit' && manilaMonth(p.paid_at) === month)
      .reduce((s, p) => s + p.amount, 0);
    const outstanding = db.charges
      .filter((c) => c.period === period)
      .reduce((s, c) => s + remainingOf(findItem('charge', c.id)!), 0);
    return HttpResponse.json<Dashboard>({
      beds: { occupied: db.beds.filter((b) => b.status === 'occupied').length, total: db.beds.length },
      month: { collected: money(collected), outstanding: money(outstanding) },
      new_inquiries: db.inquiries.filter((i) => i.status === 'new').length,
      payments_to_review: db.payments.filter((p) => p.verification === 'auto_verified' && p.method !== 'credit').length,
      new_maintenance: db.maintenance.filter((m) => m.status === 'submitted').length, // D-26
    });
  }),

  // ----- Beds -----
  http.get(apiUrl('/beds'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    return HttpResponse.json<Bed[]>(db.beds.map(toBed));
  }),

  http.post(apiUrl('/beds'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const { fields, files } = await readMultipart(request);
    const uploadError = checkUpload(files.photo, false);
    if (uploadError) return uploadError;
    const parsed = bedSchema.omit({ photo: true }).safeParse(fields);
    if (!parsed.success) return validationError(parsed.error);
    if (db.beds.some((b) => b.label.toLowerCase() === parsed.data.label.toLowerCase())) {
      return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { label: 'This label is already used.' });
    }
    const bed = { id: nextId('bed'), ...parsed.data, monthly_rate: cents(parsed.data.monthly_rate), photo_url: null };
    db.beds.push(bed);
    return HttpResponse.json<Bed>(toBed(bed), { status: 201 });
  }),

  http.patch(apiUrl('/beds/:id'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const bed = bedById(String(params.id));
    if (!bed) return apiError(404, 'NOT_FOUND', 'Bed not found.');
    const { fields, files } = await readMultipart(request);
    const uploadError = checkUpload(files.photo, false);
    if (uploadError) return uploadError;
    if (fields.status !== undefined && fields.status !== bed.status && bed.status === 'occupied') {
      return apiError(409, 'BED_OCCUPIED', 'An occupied bed changes status only through move-in and move-out.');
    }
    const parsed = bedSchema.omit({ photo: true }).partial().safeParse(fields);
    if (!parsed.success) return validationError(parsed.error);
    const { monthly_rate, ...rest } = parsed.data;
    if (rest.label && db.beds.some((b) => b.id !== bed.id && b.label.toLowerCase() === rest.label!.toLowerCase())) {
      return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { label: 'This label is already used.' });
    }
    Object.assign(bed, rest, monthly_rate !== undefined ? { monthly_rate: cents(monthly_rate) } : {});
    return HttpResponse.json<Bed>(toBed(bed));
  }),

  http.delete(apiUrl('/beds/:id'), ({ request, params }) => {
    const user = admin(request);
    if (isResponse(user)) return user;
    const bed = bedById(String(params.id));
    if (!bed) return apiError(404, 'NOT_FOUND', 'Bed not found.');
    if (db.tenancies.some((t) => t.bed_id === bed.id)) return apiError(409, 'BED_HAS_HISTORY', 'This bed has rental history and can\'t be deleted.');
    db.beds = db.beds.filter((b) => b.id !== bed.id);
    return noContent();
  }),

  // ----- Renters -----
  http.get(apiUrl('/renters'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const search = (new URL(request.url).searchParams.get('search') ?? '').trim().toLowerCase();
    const rows = db.profiles
      .filter((p) => p.role === 'renter' && (!search || p.full_name.toLowerCase().includes(search)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .map(toRenterRow);
    return HttpResponse.json<RenterRow[]>(rows);
  }),

  http.post(apiUrl('/renters'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const parsed = addRenterSchema(() => db.today()).safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    if (db.profiles.some((p) => p.email.toLowerCase() === input.email.toLowerCase())) {
      return apiError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
    }
    const bed = bedById(input.bed_id);
    if (!bed || bed.status === 'occupied' || activeTenancyOnBed(bed.id)) return apiError(409, 'BED_TAKEN', 'This bed was just taken.');
    const now = nowIso();
    const profile = { id: nextId('usr'), full_name: input.full_name, email: input.email, phone: input.phone, role: 'renter' as const, language: input.language, password: `unset-${Math.random()}`, invited_at: now, activated_at: null, is_active: true, birthday: input.birthday ?? null };
    db.profiles.push(profile);
    db.tenancies.push({ id: nextId('ten'), renter_id: profile.id, bed_id: bed.id, move_in: input.move_in, move_out: null, deposit: input.deposit !== undefined ? cents(input.deposit) : null, is_active: true });
    bed.status = 'occupied';
    // Mock hook for E42: an email containing "invitefail" simulates a failed invite email.
    const inviteSent = !input.email.includes('invitefail');
    return HttpResponse.json<CreateRenterResult>({ renter: toRenterRow(profile), invite_sent: inviteSent }, { status: 201 });
  }),

  http.patch(apiUrl('/renters/:id'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const renter = profileById(String(params.id));
    if (!renter || renter.role !== 'renter') return apiError(404, 'NOT_FOUND', 'Renter not found.');
    const body = (await request.json()) as Record<string, unknown>;
    if ('email' in body) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { email: 'The email can\'t be changed.' });
    const parsed = editRenterSchema.partial().safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    Object.assign(renter, parsed.data);
    return HttpResponse.json<RenterRow>(toRenterRow(renter));
  }),

  http.post(apiUrl('/renters/:id/resend-invite'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const renter = profileById(String(params.id));
    if (!renter || renter.role !== 'renter') return apiError(404, 'NOT_FOUND', 'Renter not found.');
    if (renter.activated_at) return apiError(409, 'ALREADY_ACTIVATED', 'This renter has already set a password.');
    renter.invited_at = nowIso();
    return HttpResponse.json({ ok: true }, { status: 202 });
  }),

  http.get(apiUrl('/renters/:id/credit'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const renter = profileById(String(params.id));
    if (!renter || renter.role !== 'renter') return apiError(404, 'NOT_FOUND', 'Renter not found.');
    return HttpResponse.json<CreditLedger>(ledgerOf(renter.id));
  }),

  http.post(apiUrl('/renters/:id/refunds'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const renter = profileById(String(params.id));
    if (!renter || renter.role !== 'renter') return apiError(404, 'NOT_FOUND', 'Renter not found.');
    const body = (await request.json()) as Record<string, unknown>;
    const balance = money(creditBalance(renter.id));
    const parsed = refundSchema(Number.MAX_SAFE_INTEGER, () => db.today()).safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    if (cents(parsed.data.amount) > cents(balance)) {
      return apiError(400, 'REFUND_EXCEEDS_CREDIT', `Refund can't be more than the credit balance ₱${balance.toFixed(2)}.`);
    }
    const entry = addLedger({
      renter_id: renter.id,
      entry_type: 'refund',
      amount: -cents(parsed.data.amount),
      refund_method: parsed.data.method,
      ...(parsed.data.reference_no ? { reference_no: parsed.data.reference_no } : {}),
      ...(parsed.data.note ? { note: parsed.data.note } : {}),
    });
    return HttpResponse.json<LedgerEntry>(toLedgerEntry(entry), { status: 201 });
  }),

  // ----- Tenancies -----
  http.post(apiUrl('/tenancies'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const parsed = z
      .object({ renter_id: z.string(), bed_id: z.string(), move_in: z.string().refine(isIsoDate), deposit: z.number().min(0).max(100_000).optional() })
      .safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const renter = profileById(parsed.data.renter_id);
    if (!renter || renter.role !== 'renter') return apiError(404, 'NOT_FOUND', 'Renter not found.');
    if (activeTenancyOf(renter.id)) return apiError(409, 'RENTER_HAS_ACTIVE_TENANCY', 'This renter already has an active bed.');
    const bed = bedById(parsed.data.bed_id);
    if (!bed || bed.status === 'occupied' || activeTenancyOnBed(bed.id)) return apiError(409, 'BED_TAKEN', 'This bed was just taken.');
    const tenancy: TenancyRec = { id: nextId('ten'), renter_id: renter.id, bed_id: bed.id, move_in: parsed.data.move_in, move_out: null, deposit: parsed.data.deposit !== undefined ? cents(parsed.data.deposit) : null, is_active: true };
    db.tenancies.push(tenancy);
    bed.status = 'occupied';
    return HttpResponse.json<Tenancy>(toTenancy(tenancy), { status: 201 });
  }),

  http.get(apiUrl('/tenancies/:id/move-out-preview'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const tenancy = tenancyById(String(params.id));
    if (!tenancy) return apiError(404, 'NOT_FOUND', 'Tenancy not found.');
    const balance = creditBalance(tenancy.renter_id);
    const open = openItemsOf(tenancy.renter_id).reduce((s, i) => s + remainingOf(i), 0);
    const wouldApply = balance > 0 ? Math.min(balance, open) : 0;
    return HttpResponse.json<MoveOutPreview>({ credit_balance: money(balance), would_apply: money(wouldApply), refund_due: money(Math.max(0, balance - wouldApply)) });
  }),

  http.post(apiUrl('/tenancies/:id/move-out'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const tenancy = tenancyById(String(params.id));
    if (!tenancy || !tenancy.is_active) return apiError(404, 'NOT_FOUND', 'Active tenancy not found.');
    const body = (await request.json()) as { move_out?: string };
    if (!body.move_out || !isIsoDate(body.move_out)) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { move_out: 'Invalid date' });
    if (body.move_out > manilaToday()) return apiError(400, 'MOVE_OUT_IN_FUTURE', "Move-out date can't be in the future.");
    if (body.move_out < tenancy.move_in) return apiError(400, 'MOVE_OUT_BEFORE_MOVE_IN', 'The move-out date can\'t be before the move-in date.');
    tenancy.move_out = body.move_out;
    tenancy.is_active = false;
    const bed = bedById(tenancy.bed_id);
    if (bed) bed.status = 'vacant';
    const applied = applyCredit(tenancy.renter_id, user.id).reduce((s, a) => s + cents(a.amount), 0);
    const left = creditBalance(tenancy.renter_id);
    return HttpResponse.json<MoveOutResult>({ credit_applied: money(applied), refund_due: money(Math.max(0, left)) });
  }),

  http.get(apiUrl('/tenancies'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const activeOnly = new URL(request.url).searchParams.get('active') === 'true';
    const rows = db.tenancies
      .filter((t) => !activeOnly || t.is_active)
      .sort((a, b) => a.move_in.localeCompare(b.move_in) || a.id.localeCompare(b.id))
      .map(toTenancy);
    return HttpResponse.json<Tenancy[]>(rows);
  }),
];

