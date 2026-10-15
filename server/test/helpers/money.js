/**
 * B10: shared money-test kit for the PGlite suites (the QA lane reuses it).
 *  - assertInvariants(db, renterId?)   the BR-1 / BR-9–BR-12 / BR-14 invariants (all renters when omitted)
 *  - invariantGuard(db)                registers the afterEach check for every renter a test touched
 *  - scenario builders: givenRenter / givenCharge / givenShare (pglite.js) plus pay, review, moveOut, …
 * RPC calls run as the service role, like the API does.
 */
import { afterEach, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { asRole, givenRenter, givenUser, invariantViolations, recordPayment, uniqueRef } from './pglite.js';
import { mapDbError } from '../../src/lib/dbErrors.js';

export * from './pglite.js';

/** Call `public.<name>(p_a => $1, …)` as the service role and return the single JSON/scalar result. */
export async function rpc(db, name, args = {}) {
  const keys = Object.keys(args);
  const params = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
  const sql = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
  return asRole(db, 'service_role', null, async () => (await db.query(sql, params)).rows[0].r);
}

/** Await a failing RPC and return the AppError the API would raise (mapDbError, like callRpc). */
export async function rpcError(promise) {
  try {
    await promise;
  } catch (e) {
    return mapDbError({ code: e.code, message: e.message, details: e.detail, hint: e.hint });
  }
  throw new Error('expected the RPC to fail');
}

/** Run assertInvariants after every test for the renters it created via `renter()`. */
export function invariantGuard(db) {
  const touched = new Set();
  afterEach(async () => {
    for (const id of touched) await assertInvariants(db(), id);
    touched.clear();
  });
  return async (opts) => {
    const r = await givenRenter(db(), opts);
    touched.add(r.id);
    return r;
  };
}

/** The B10 checker. Throws (vitest assertion) listing every violation. */
export async function assertInvariants(db, renterId) {
  const ids = renterId
    ? [renterId]
    : (await db.query(`select id from public.profiles where role = 'renter'`)).rows.map((r) => r.id);
  for (const id of ids) expect(await invariantViolations(db, id), `invariants for renter ${id}`).toEqual([]);
}

// ---------------------------------------------------------------------------
// Scenario builders
// ---------------------------------------------------------------------------
export const num = (v) => Number(v);

/** Admin user for reviewed_by / created_by. */
export const givenAdmin = (db) => givenUser(db, { role: 'admin' });

/** A renter-uploaded payment (auto_verified, gcash, unique reference). Returns PayResult. */
export const pay = (db, itemId, amount, extra = {}) =>
  recordPayment(db, { item_id: itemId, amount, reference_no: uniqueRef('GC'), ...extra });

/** An admin-recorded cash payment (confirmed). */
export const payCash = (db, itemId, amount, admin, extra = {}) =>
  recordPayment(db, {
    item_id: itemId, amount, method: 'cash', reference_no: null, verification: 'confirmed',
    submitted_by: admin?.id ?? null, reviewed_by: admin?.id ?? null, ...extra,
  });

export const review = (db, paymentId, action, adminId = null, reason = null) =>
  rpc(db, 'review_payment', { p_payment_id: paymentId, p_action: action, p_reason: reason, p_admin_id: adminId });
export const reject = (db, paymentId, adminId = null, reason = 'Reference not found.') =>
  review(db, paymentId, 'reject', adminId, reason);

export const generateRent = (db, period, acting = null) => rpc(db, 'generate_rent', { p_period: period, p_acting_user: acting });

export const createBill = (db, { type = 'electricity', period = '2026-10-01', total, due = '2026-10-10', shares, by = null }) =>
  rpc(db, 'create_bill', { p_type: type, p_period: period, p_total: String(total), p_due_date: due, p_shares: shares, p_created_by: by });

export const updateCharge = (db, id, { amount = null, due = null, acting = null } = {}) =>
  rpc(db, 'update_charge', { p_charge_id: id, p_amount: amount === null ? null : String(amount), p_due_date: due, p_acting_user: acting });

export const updateBillShares = (db, billId, shares, acting = null) =>
  rpc(db, 'update_bill_shares', { p_bill_id: billId, p_shares: shares, p_acting_user: acting });

export const moveOut = (db, tenancyId, date, { acting = null, today = null } = {}) =>
  rpc(db, 'move_out', { p_tenancy_id: tenancyId, p_move_out: date, p_acting_user: acting, p_today: today });
export const moveOutPreview = (db, tenancyId) => rpc(db, 'move_out_preview', { p_tenancy_id: tenancyId });

export const assignBed = (db, renterId, bedId, moveIn, deposit = null) =>
  rpc(db, 'assign_bed', { p_renter_id: renterId, p_bed_id: bedId, p_move_in: moveIn, p_deposit: deposit });

export const createRenter = async (db, { bedId, moveIn = '2026-10-01', name = 'New Renter', language = 'en', deposit = null, email } = {}) => {
  const id = randomUUID();
  const mail = email ?? `new-${id.slice(0, 8)}@irent.test`;
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, mail]);
  const res = await rpc(db, 'create_renter', {
    p_auth_id: id, p_full_name: name, p_email: mail, p_phone: '09170000000', p_language: language,
    p_bed_id: bedId, p_move_in: moveIn, p_deposit: deposit,
  });
  return { id, email: mail, ...res };
};

export const recordRefund = (db, renterId, amount, { method = 'cash', ref = null, at = null, note = null, admin = null } = {}) =>
  rpc(db, 'record_refund', {
    p_renter_id: renterId, p_amount: String(amount), p_method: method, p_reference_no: ref,
    p_refunded_at: at, p_note: note, p_admin_id: admin,
  });

/** [[entry_type, amount], …] in insertion order. */
export async function ledger(db, renterId) {
  const { rows } = await db.query(
    'select entry_type, amount::numeric as amount from public.credit_ledger where renter_id = $1 order by created_at, id',
    [renterId],
  );
  return rows.map((r) => [r.entry_type, Number(r.amount)]);
}

export async function paymentRow(db, id) {
  const { rows } = await db.query(
    `select verification, rejection_reason, amount::numeric as amount, applied_amount::numeric as applied,
            credit_amount::numeric as credit, method, reviewed_by
     from public.payments where id = $1`,
    [id],
  );
  const r = rows[0];
  return { ...r, amount: Number(r.amount), applied: Number(r.applied), credit: Number(r.credit) };
}

/** Credit payments (method = credit) of one item, oldest first. */
export async function creditPaymentsOf(db, type, itemId) {
  const col = type === 'charge' ? 'charge_id' : 'bill_share_id';
  const { rows } = await db.query(
    `select id, verification, amount::numeric as amount from public.payments
     where ${col} = $1 and method = 'credit' order by created_at, id`,
    [itemId],
  );
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

/** BR-4 numbers for one renter: { credit, open (Σ remaining of open items), outstanding (open + debt) }. */
export async function snapshot(db, renterId) {
  const { rows } = await db.query(
    `select
       (select coalesce(sum(amount), 0) from public.credit_ledger where renter_id = $1)::numeric as credit,
       (select coalesce(sum(public.item_remaining(i.t, i.id)), 0) from (
          select 'charge' as t, c.id from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id
            where t.renter_id = $1 and c.status <> 'paid'
          union all
          select 'bill_share', s.id from public.bill_shares s join public.tenancies t on t.id = s.tenancy_id
            where t.renter_id = $1 and s.status <> 'paid') i)::numeric as open`,
    [renterId],
  );
  const credit = Number(rows[0].credit);
  const open = Number(rows[0].open);
  return { credit, open, outstanding: Math.round((open + Math.max(0, -credit)) * 100) / 100 };
}
