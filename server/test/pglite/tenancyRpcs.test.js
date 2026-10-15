/**
 * B9: create_renter, assign_bed, move_out, move_out_preview, record_refund on real Postgres (PGlite).
 * SC-29–SC-31 (incl. step 2b, OQ-25 = A), SC-65, SC-66, E9, E11, E35–E37, BR-6, BR-7, BR-12.
 * The true two-connection races (E9) are in test/integration/money.int.test.js.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createDb, givenBed, givenCharge, givenShare, givenUser, givenTenancy, itemRow, creditBalance, invariantGuard,
  pay, generateRent, moveOut, moveOutPreview, assignBed, createRenter, recordRefund, ledger, rpcError, num,
  assertInvariants, asRole, reject,
} from '../helpers/money.js';

let db;
beforeAll(async () => {
  db = await createDb();
});
const renter = invariantGuard(() => db);

const bedStatus = async (id) => (await db.query('select status from public.beds where id = $1', [id])).rows[0].status;
const tenancy = async (id) => (await db.query(
  'select is_active, move_out::text as move_out, bed_id from public.tenancies where id = $1', [id])).rows[0];

describe('create_renter (R31, D-6)', () => {
  it('SC-29: inserts the invited profile, takes the bed and opens the tenancy', async () => {
    const bed = await givenBed(db, { rate: 4000, status: 'vacant' });
    const out = await createRenter(db, { bedId: bed, moveIn: '2026-10-05', language: 'fil', deposit: 4500, name: '  Cara Cruz ' });
    expect(Object.keys(out).sort()).toEqual(['email', 'id', 'renter_id', 'tenancy_id']);
    expect(out.renter_id).toBe(out.id);
    const { rows } = await db.query('select * from public.profiles where id = $1', [out.id]);
    expect(rows[0]).toMatchObject({ full_name: 'Cara Cruz', role: 'renter', language: 'fil', is_active: true, activated_at: null });
    expect(rows[0].invited_at).not.toBeNull();
    expect(await bedStatus(bed)).toBe('occupied');
    const { rows: t } = await db.query('select move_in::text as mi, deposit::numeric as d, is_active from public.tenancies where id = $1', [out.tenancy_id]);
    expect(t[0]).toEqual({ mi: '2026-10-05', d: '4500.00', is_active: true });
    await assertInvariants(db, out.id);
  });

  it('a reserved bed can be taken; an occupied bed → BED_TAKEN and nothing is created (SC-30)', async () => {
    const reserved = await givenBed(db, { status: 'reserved' });
    const ok = await createRenter(db, { bedId: reserved });
    expect(await bedStatus(reserved)).toBe('occupied');

    const profilesBefore = (await db.query('select count(*)::int as n from public.profiles')).rows[0].n;
    const err = await rpcError(createRenter(db, { bedId: reserved }));
    expect(err).toMatchObject({ code: 'BED_TAKEN', status: 409 });
    expect((await db.query('select count(*)::int as n from public.profiles')).rows[0].n).toBe(profilesBefore);
    expect(ok.tenancy_id).toBeTruthy();
  });

  it('an unknown bed → NOT_FOUND; a duplicate email → EMAIL_EXISTS; the whole call rolls back', async () => {
    expect((await rpcError(createRenter(db, { bedId: '00000000-0000-4000-8000-000000000000' }))).code).toBe('NOT_FOUND');
    const bed = await givenBed(db);
    const first = await createRenter(db, { bedId: await givenBed(db), email: 'dupe@irent.test' });
    const err = await rpcError(createRenter(db, { bedId: bed, email: 'DUPE@irent.test' }));
    expect(err).toMatchObject({ code: 'EMAIL_EXISTS', status: 409 });
    expect(await bedStatus(bed)).toBe('vacant');
    expect(first.id).toBeTruthy();
  });
});

describe('assign_bed (R33, BR-7)', () => {
  it('SC-31 step 3: a moved-out renter gets a new tenancy; the bed becomes occupied', async () => {
    const r = await renter();
    await moveOut(db, r.tenancyId, '2026-09-30', { today: '2026-10-02' });
    const bed = await givenBed(db, { rate: 4000 });
    const out = await assignBed(db, r.id, bed, '2026-10-10', 2000);
    expect(await bedStatus(bed)).toBe('occupied');
    expect(await tenancy(out.tenancy_id)).toMatchObject({ is_active: true, bed_id: bed });
  });

  it('SC-31 step 4: a renter with an active tenancy → RENTER_HAS_ACTIVE_TENANCY (409); the bed stays vacant', async () => {
    const r = await renter();
    const bed = await givenBed(db);
    const err = await rpcError(assignBed(db, r.id, bed, '2026-10-10'));
    expect(err).toMatchObject({ code: 'RENTER_HAS_ACTIVE_TENANCY', status: 409 });
    expect(await bedStatus(bed)).toBe('vacant');
  });

  it('an occupied bed → BED_TAKEN; unknown bed or renter (or an admin) → NOT_FOUND', async () => {
    const r = await renter();
    await moveOut(db, r.tenancyId, '2026-09-30', { today: '2026-10-02' });
    const other = await renter();
    const occupied = (await tenancy(other.tenancyId)).bed_id;
    expect((await rpcError(assignBed(db, r.id, occupied, '2026-10-10'))).code).toBe('BED_TAKEN');
    expect((await rpcError(assignBed(db, r.id, '00000000-0000-4000-8000-000000000000', '2026-10-10'))).code).toBe('NOT_FOUND');
    const bed = await givenBed(db);
    expect((await rpcError(assignBed(db, '00000000-0000-4000-8000-000000000000', bed, '2026-10-10'))).code).toBe('NOT_FOUND');
    const admin = await givenUser(db, { role: 'admin' });
    expect((await rpcError(assignBed(db, admin.id, bed, '2026-10-10'))).code).toBe('NOT_FOUND');
    expect(await bedStatus(bed)).toBe('vacant');
  });
});

describe('move_out (R34, R57, BR-12, OQ-25 = A)', () => {
  it('SC-31 step 1 / E11: ends the tenancy, frees the bed, keeps unpaid items on record', async () => {
    const r = await renter({ moveIn: '2026-09-05' });
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const bed = (await tenancy(r.tenancyId)).bed_id;
    const out = await moveOut(db, r.tenancyId, '2026-10-02', { today: '2026-10-02' });
    expect(out).toEqual({ credit_applied: 0, refund_due: 0 });
    expect(await tenancy(r.tenancyId)).toMatchObject({ is_active: false, move_out: '2026-10-02' });
    expect(await bedStatus(bed)).toBe('vacant');
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'unpaid', remaining: 4500 });
  });

  it('SC-31 step 2: a date before move-in → MOVE_OUT_BEFORE_MOVE_IN; nothing changes', async () => {
    const r = await renter({ moveIn: '2026-09-05' });
    const bed = (await tenancy(r.tenancyId)).bed_id;
    const err = await rpcError(moveOut(db, r.tenancyId, '2026-09-04', { today: '2026-10-02' }));
    expect(err).toMatchObject({ code: 'MOVE_OUT_BEFORE_MOVE_IN', status: 400 });
    expect((await tenancy(r.tenancyId)).is_active).toBe(true);
    expect(await bedStatus(bed)).toBe('occupied');
  });

  it('SC-31 step 2b: tomorrow (Manila) → MOVE_OUT_IN_FUTURE and nothing changes; today and a backdated date succeed', async () => {
    const r = await renter({ moveIn: '2026-09-05' });
    const bed = (await tenancy(r.tenancyId)).bed_id;
    const err = await rpcError(moveOut(db, r.tenancyId, '2026-10-03', { today: '2026-10-02' }));
    expect(err).toMatchObject({ code: 'MOVE_OUT_IN_FUTURE', status: 400 });
    expect((await tenancy(r.tenancyId)).is_active).toBe(true);
    expect(await bedStatus(bed)).toBe('occupied');

    const today = await moveOut(db, r.tenancyId, '2026-10-02', { today: '2026-10-02' });
    expect(today).toMatchObject({ refund_due: 0 });

    const back = await renter({ moveIn: '2026-09-05' });
    await moveOut(db, back.tenancyId, '2026-09-05', { today: '2026-10-02' }); // backdated, = move-in
    expect(await tenancy(back.tenancyId)).toMatchObject({ is_active: false, move_out: '2026-09-05' });
  });

  it('without p_today it uses the DB clock in Asia/Manila (a date 2 days ahead is rejected, today accepted)', async () => {
    const { rows } = await db.query(`select (now() at time zone 'Asia/Manila')::date::text as d, ((now() at time zone 'Asia/Manila')::date + 2)::text as later`);
    const r = await renter({ moveIn: '2020-01-01' });
    expect((await rpcError(moveOut(db, r.tenancyId, rows[0].later))).code).toBe('MOVE_OUT_IN_FUTURE');
    await moveOut(db, r.tenancyId, rows[0].d);
    expect((await tenancy(r.tenancyId)).is_active).toBe(false);
  });

  it('the Manila boundary is the caller’s date: UTC-evening instant is already tomorrow in Manila', async () => {
    // 2026-10-01 17:00Z = 2026-10-02 01:00 Manila. Manila today = Oct 2, so Oct 2 is allowed and Oct 3 is not.
    const r = await renter({ moveIn: '2026-09-05' });
    expect((await rpcError(moveOut(db, r.tenancyId, '2026-10-03', { today: '2026-10-02' }))).code).toBe('MOVE_OUT_IN_FUTURE');
    await moveOut(db, r.tenancyId, '2026-10-02', { today: '2026-10-02' });
  });

  it('an already moved-out or unknown tenancy → NOT_FOUND', async () => {
    const r = await renter();
    await moveOut(db, r.tenancyId, '2026-10-01', { today: '2026-10-02' });
    expect((await rpcError(moveOut(db, r.tenancyId, '2026-10-01', { today: '2026-10-02' }))).code).toBe('NOT_FOUND');
    expect((await rpcError(moveOut(db, '00000000-0000-4000-8000-000000000000', '2026-10-01', { today: '2026-10-02' }))).code).toBe('NOT_FOUND');
  });

  it('SC-65: credit ₱1,000, no open items → credit_applied 0, refund_due 1,000, bed vacant', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4000 });
    await pay(db, c, 5000);
    expect(await moveOutPreview(db, r.tenancyId)).toEqual({ credit_balance: 1000, would_apply: 0, refund_due: 1000 });
    const out = await moveOut(db, r.tenancyId, '2026-10-02', { today: '2026-10-02' });
    expect(out).toEqual({ credit_applied: 0, refund_due: 1000 });
  });

  it('SC-65 numbers: ₱1,000 credit and ₱600 open → ₱600 applied, refund_due 400', async () => {
    // BR-10 never lets credit and an open item coexist, so open the item with a direct insert,
    // exactly as a charge that appears between preview and confirm would.
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4000 });
    await pay(db, c, 5000); // credit 1,000
    await givenShare(db, r.tenancyId, { amount: 600, type: 'water' }); // raw insert: no auto-apply
    expect(await moveOutPreview(db, r.tenancyId)).toEqual({ credit_balance: 1000, would_apply: 600, refund_due: 400 });
    const out = await moveOut(db, r.tenancyId, '2026-10-02', { today: '2026-10-02' });
    expect(out).toEqual({ credit_applied: 600, refund_due: 400 });
    expect(await creditBalance(db, r.id)).toBe(400);
    expect((await tenancy(r.tenancyId)).is_active).toBe(false);
  });

  it('move_out_preview is read-only and unknown tenancy → NOT_FOUND; a negative balance previews 0 would_apply', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 1000 });
    const p = await pay(db, c, 1500);
    await recordRefund(db, r.id, 500);
    await reject(db, p.payment.id);
    expect(await moveOutPreview(db, r.tenancyId)).toMatchObject({ credit_balance: -500, would_apply: 0, refund_due: 0 });
    expect((await tenancy(r.tenancyId)).is_active).toBe(true);
    expect((await rpcError(moveOutPreview(db, '00000000-0000-4000-8000-000000000000'))).code).toBe('NOT_FOUND');
  });
});

describe('record_refund (R57, BR-12, SC-65)', () => {
  async function renterWithCredit(credit = 1000) {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4000 });
    await pay(db, c, 4000 + credit);
    return r;
  }

  it('SC-65 steps 3–4: ₱1,200 → REFUND_EXCEEDS_CREDIT naming ₱1,000.00; ₱1,000 brings the balance to 0', async () => {
    const r = await renterWithCredit(1000);
    const admin = await givenUser(db, { role: 'admin' });
    const err = await rpcError(recordRefund(db, r.id, 1200));
    expect(err).toMatchObject({ code: 'REFUND_EXCEEDS_CREDIT', status: 400, message: "Refund can't be more than the credit balance ₱1,000.00." });
    expect(await creditBalance(db, r.id)).toBe(1000);

    const entry = await recordRefund(db, r.id, 1000, { method: 'cash', note: ' Returned in person ', admin: admin.id });
    expect(entry).toMatchObject({ entry_type: 'refund', amount: -1000, refund_method: 'cash', reference_no: null, note: 'Returned in person' });
    expect(Object.keys(entry).sort()).toEqual(['amount', 'created_at', 'entry_type', 'id', 'note', 'reference_no', 'refund_method']);
    expect(await creditBalance(db, r.id)).toBe(0);
    const { rows } = await db.query(`select created_by from public.credit_ledger where id = $1`, [entry.id]);
    expect(rows[0].created_by).toBe(admin.id);
  });

  it('₱500 on a ₱400 balance → REFUND_EXCEEDS_CREDIT; ₱400 → balance 0; a second refund fails', async () => {
    const r = await renterWithCredit(400);
    expect((await rpcError(recordRefund(db, r.id, 500))).code).toBe('REFUND_EXCEEDS_CREDIT');
    await recordRefund(db, r.id, 400, { method: 'gcash', ref: 'RF-1' });
    expect(await creditBalance(db, r.id)).toBe(0);
    const again = await rpcError(recordRefund(db, r.id, 0.01));
    expect(again.code).toBe('REFUND_EXCEEDS_CREDIT');
    expect(again.message).toContain('₱0.00');
    expect(await ledger(db, r.id)).toEqual([['overpayment', 400], ['refund', -400]]);
  });

  it('a partial refund leaves the rest; the refund date becomes the entry date', async () => {
    const r = await renterWithCredit(1000);
    const e = await recordRefund(db, r.id, 250, { method: 'bpi', ref: ' BPI-9 ', at: '2026-09-30T16:00:00Z' });
    expect(e.reference_no).toBe('BPI-9');
    expect(new Date(e.created_at).toISOString()).toBe('2026-09-30T16:00:00.000Z');
    expect(await creditBalance(db, r.id)).toBe(750);
  });

  it('validates amount, method, reference and note; unknown or admin renter → NOT_FOUND', async () => {
    const r = await renterWithCredit(100);
    for (const [args, field] of [
      [{ amount: 0 }, 'amount'], [{ amount: -1 }, 'amount'], [{ amount: 1.005 }, 'amount'],
      [{ amount: 1, ref: 'x'.repeat(41) }, 'reference_no'], [{ amount: 1, note: 'x'.repeat(501) }, 'note'],
    ]) {
      const err = await rpcError(recordRefund(db, r.id, args.amount, { ref: args.ref, note: args.note }));
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toHaveProperty(field);
    }
    expect((await rpcError(recordRefund(db, '00000000-0000-4000-8000-000000000000', 1))).code).toBe('NOT_FOUND');
    const admin = await givenUser(db, { role: 'admin' });
    expect((await rpcError(recordRefund(db, admin.id, 1))).code).toBe('NOT_FOUND');
    expect(await creditBalance(db, r.id)).toBe(100);
  });

  it('refunds are append-only: nobody can update or delete the ledger row afterwards', async () => {
    const r = await renterWithCredit(100);
    const e = await recordRefund(db, r.id, 100);
    for (const role of ['service_role', 'authenticated', 'anon']) {
      await expect(asRole(db, role, null, () => db.query(`delete from public.credit_ledger where id = $1`, [e.id]))).rejects.toThrow();
      await expect(asRole(db, role, null, () => db.query(`update public.credit_ledger set note = 'x' where id = $1`, [e.id]))).rejects.toThrow();
    }
  });
});

describe('SC-66: credit survives a move-out and a new assignment', () => {
  it('the credit is applied to the next generated charge on the new tenancy', async () => {
    const r = await renter({ moveIn: '2026-09-05' });
    const c = await givenCharge(db, r.tenancyId, { amount: 4500, period: '2026-09-01', due: '2026-09-05' });
    await pay(db, c, 5500); // credit 1,000
    await moveOut(db, r.tenancyId, '2026-09-30', { today: '2026-10-02' });
    expect(await creditBalance(db, r.id)).toBe(1000); // "Refund due"

    const b6 = await givenBed(db, { rate: 4000 });
    const t2 = await assignBed(db, r.id, b6, '2026-10-10');
    expect(await creditBalance(db, r.id)).toBe(1000); // assigning applies nothing by itself

    const gen = await generateRent(db, '2026-10-01');
    expect(num(gen.credit_applied_total)).toBe(1000);
    const { rows } = await db.query(
      `select id, amount::numeric as a, due_date::text as due, status from public.rent_charges where tenancy_id = $1`, [t2.tenancy_id]);
    expect(rows[0]).toMatchObject({ a: '4000.00', due: '2026-10-10', status: 'partial' });
    expect(await itemRow(db, 'charge', rows[0].id)).toMatchObject({ paid: 1000, remaining: 3000 });
    expect(await creditBalance(db, r.id)).toBe(0);
  });
});

void givenTenancy;
