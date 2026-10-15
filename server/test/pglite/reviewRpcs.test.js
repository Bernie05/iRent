/**
 * B7: review_payment, reverse_credit, credit_already_used on real Postgres (PGlite).
 * SC-36, SC-37, SC-38, SC-61–SC-64, E5, E6, E31–E34, E43. Invariants after every test.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createDb, givenCharge, givenShare, givenTenancy, itemRow, creditBalance, asRole,
  invariantGuard, pay, payCash, review, reject, generateRent, recordRefund, moveOut, ledger, paymentRow,
  creditPaymentsOf, givenAdmin, rpc, rpcError, uniqueRef,
} from '../helpers/money.js';

let db;
beforeAll(async () => {
  db = await createDb();
});
const renter = invariantGuard(() => db);

describe('review_payment: confirm (SC-36)', () => {
  it('confirms an auto_verified payment, stamps reviewer and time, returns the admin Payment', async () => {
    const r = await renter();
    const admin = await givenAdmin(db);
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const p = await pay(db, c, 4500);
    const out = await review(db, p.payment.id, 'confirm', admin.id);
    expect(out).toMatchObject({
      id: p.payment.id, verification: 'confirmed', renter: { id: r.id }, credit_already_used: 0,
    });
    expect(out.reviewed_at).not.toBeNull();
    expect((await paymentRow(db, p.payment.id)).reviewed_by).toBe(admin.id);
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'paid' });
  });

  it('a second review (confirm or reject) → ALREADY_REVIEWED 409, nothing changes (SC-38, E6)', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const p = await pay(db, c, 4500);
    await review(db, p.payment.id, 'confirm');
    for (const action of ['reject', 'confirm']) {
      const err = await rpcError(review(db, p.payment.id, action, null, 'late'));
      expect(err).toMatchObject({ code: 'ALREADY_REVIEWED', status: 409 });
    }
    expect((await paymentRow(db, p.payment.id)).verification).toBe('confirmed');
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'paid' });
  });

  it('an already-rejected payment cannot be reviewed again', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const p = await pay(db, c, 4500);
    await reject(db, p.payment.id);
    expect((await rpcError(review(db, p.payment.id, 'confirm'))).code).toBe('ALREADY_REVIEWED');
  });
});

describe('review_payment: validation and not-reviewable (E43, SC-67 step 4)', () => {
  it('a credit payment → NOT_REVIEWABLE 400 and is left untouched', async () => {
    const r = await renter();
    const rent = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const water = await givenShare(db, r.tenancyId, { amount: 300, type: 'water' });
    await pay(db, rent, 5000); // 500 excess → credit payment on the water share
    const [cp] = await creditPaymentsOf(db, 'bill_share', water);
    const err = await rpcError(review(db, cp.id, 'reject', null, 'nope'));
    expect(err).toMatchObject({ code: 'NOT_REVIEWABLE', status: 400 });
    expect((await paymentRow(db, cp.id)).verification).toBe('confirmed');
    expect(await itemRow(db, 'bill_share', water)).toMatchObject({ status: 'paid' });
  });

  it('bad action, missing or over-long reason → VALIDATION_ERROR on the right field', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const p = await pay(db, c, 4500);
    const cases = [
      [['approve', 'x'], 'action'],
      [['reject', null], 'reason'],
      [['reject', '   '], 'reason'],
      [['reject', 'x'.repeat(501)], 'reason'],
    ];
    for (const [[action, reason], field] of cases) {
      const err = await rpcError(review(db, p.payment.id, action, null, reason));
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toHaveProperty(field);
    }
    expect((await paymentRow(db, p.payment.id)).verification).toBe('auto_verified');
  });

  it('unknown payment → NOT_FOUND', async () => {
    const err = await rpcError(review(db, '00000000-0000-4000-8000-000000000000', 'confirm'));
    expect(err.code).toBe('NOT_FOUND');
  });
});

describe('review_payment: reject without credit (SC-37, E5)', () => {
  it('reverts the item to unpaid, keeps the reference blocked (BR-2), no ledger rows', async () => {
    const r = await renter();
    const admin = await givenAdmin(db);
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const ref = uniqueRef('GC');
    const p = await pay(db, c, 4500, { reference_no: ref });

    const out = await reject(db, p.payment.id, admin.id, ' Reference not found in GCash history. ');
    expect(out.payment).toMatchObject({
      verification: 'rejected', rejection_reason: 'Reference not found in GCash history.', renter: { id: r.id },
    });
    expect(Number(out.credit_reversed)).toBe(0);
    expect(Number(out.credit_balance)).toBe(0);
    expect(out.items_reopened).toEqual([{ item: { type: 'charge', id: c, period: '2026-10-01' }, remaining: 4500 }]);
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'unpaid', paid: 0 });
    expect(await ledger(db, r.id)).toEqual([]);

    const dup = await rpcError(pay(db, c, 4500, { reference_no: ref }));
    expect(dup.code).toBe('DUPLICATE_REFERENCE');
  });

  it('E5: rejecting a payment on a paid charge that also has other payments → partial', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    await pay(db, c, 2000);
    const p2 = await pay(db, c, 2500);
    expect((await itemRow(db, 'charge', c)).status).toBe('paid');
    const out = await reject(db, p2.payment.id);
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'partial', remaining: 2500 });
    expect(out.items_reopened).toHaveLength(1);
    expect(out.items_reopened[0].remaining).toBe(2500);
  });

  it('rejecting a payment on a still-open item reports nothing as reopened', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const p = await pay(db, c, 1000);
    const out = await reject(db, p.payment.id);
    expect(out.items_reopened).toEqual([]);
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'unpaid' });
  });
});

describe('SC-61: reject while the credit is unused', () => {
  it('removes the credit with a −C reversal; the item reverts; nothing else changes', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    await pay(db, c, 2000);
    const p = await pay(db, c, 3000); // applied 2500, credit 500
    expect([Number(p.payment.applied_amount), Number(p.payment.credit_amount)]).toEqual([2500, 500]);
    expect(await creditBalance(db, r.id)).toBe(500);
    expect(await rpc(db, 'credit_already_used', { p_payment_id: p.payment.id })).toBe('0.00');

    const out = await reject(db, p.payment.id, null, 'Reference not found.');
    expect(Number(out.credit_reversed)).toBe(500);
    expect(Number(out.credit_balance)).toBe(0);
    expect(out.items_reopened).toEqual([{ item: expect.objectContaining({ id: c }), remaining: 2500 }]);
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'partial', remaining: 2500 });
    expect(await ledger(db, r.id)).toEqual([['overpayment', 500], ['reversal', -500]]);
  });
});

describe('SC-62: reject after the credit was applied to a later charge', () => {
  it('unwinds that application, reopens the charge and keeps the net ledger at zero', async () => {
    const r = await renter();
    const oct = await givenCharge(db, r.tenancyId, { amount: 4500, period: '2026-10-01', due: '2026-10-05' });
    const p = await pay(db, oct, 5000, { reference_no: 'GC-5000' }); // credit 500
    await generateRent(db, '2026-11-01');                            // November gets the 500 credit
    const { rows: nov } = await db.query(
      `select id from public.rent_charges where tenancy_id = $1 and period = '2026-11-01'`, [r.tenancyId]);
    const novId = nov[0].id;
    expect(await itemRow(db, 'charge', novId)).toMatchObject({ status: 'partial', remaining: 4000 });
    expect(await creditBalance(db, r.id)).toBe(0);
    expect(Number(await rpc(db, 'credit_already_used', { p_payment_id: p.payment.id }))).toBe(500);

    const out = await reject(db, p.payment.id, null, 'Fake.');
    expect(Number(out.credit_reversed)).toBe(500);
    expect(Number(out.credit_balance)).toBe(0);
    expect(out.items_reopened.map((x) => [x.item.id, x.remaining])).toEqual([[oct, 4500], [novId, 4500]]);
    expect(await itemRow(db, 'charge', oct)).toMatchObject({ status: 'unpaid' });
    expect(await itemRow(db, 'charge', novId)).toMatchObject({ status: 'unpaid', paid: 0 });

    const [cp] = await creditPaymentsOf(db, 'charge', novId);
    expect(await paymentRow(db, cp.id)).toMatchObject({
      verification: 'rejected', rejection_reason: 'Credit reversed: payment GCASH GC-5000 was rejected',
    });
    expect(await ledger(db, r.id)).toEqual([
      ['overpayment', 500], ['application', -500], ['reversal', -500], ['application_reversal', 500],
    ]);
  });
});

describe('SC-63: the unwinding overshoots and the surplus is re-applied', () => {
  it('ends exactly as if payment A never happened', async () => {
    const r = await renter();
    const admin = await givenAdmin(db);
    const oct = await givenCharge(db, r.tenancyId, { amount: 4500, period: '2026-10-01', due: '2026-10-05' });
    const water = await givenShare(db, r.tenancyId, { amount: 300, type: 'water', due: '2026-10-15' });
    const A = await pay(db, oct, 4700, { reference_no: 'GC-A' });          // credit 200
    await payCash(db, water, 1100, admin, { item_type: 'bill_share' });                                  // credit 800
    expect(await creditBalance(db, r.id)).toBe(1000);
    await generateRent(db, '2026-11-01');                                   // P1 = 1,000 on November
    const { rows } = await db.query(
      `select id from public.rent_charges where tenancy_id = $1 and period = '2026-11-01'`, [r.tenancyId]);
    const nov = rows[0].id;
    expect(await itemRow(db, 'charge', nov)).toMatchObject({ status: 'partial', remaining: 3500 });

    const out = await reject(db, A.payment.id, admin.id, 'Fake.');

    expect(Number(out.credit_balance)).toBe(0);
    expect(await itemRow(db, 'charge', nov)).toMatchObject({ status: 'unpaid', remaining: 4500 });
    expect(await itemRow(db, 'charge', oct)).toMatchObject({ status: 'partial', remaining: 3700 }); // 800 re-applied
    expect(await itemRow(db, 'bill_share', water)).toMatchObject({ status: 'paid' });
    expect(out.items_reopened.map((x) => x.item.id)).toEqual([oct, nov]);
    // outstanding 3,700 + 4,500; the ledger nets to zero
    expect((await ledger(db, r.id)).reduce((s, [, a]) => s + a, 0)).toBe(0);
    const octCredit = await creditPaymentsOf(db, 'charge', oct);
    expect(octCredit.filter((x) => x.verification !== 'rejected').map((x) => x.amount)).toEqual([800]);
  });
});

describe('SC-64: reject after the credit was refunded', () => {
  it('the balance goes negative and stays negative; there is nothing to unwind', async () => {
    const r = await renter({ moveIn: '2026-09-01' });
    const c = await givenCharge(db, r.tenancyId, { amount: 4500, period: '2026-09-01', due: '2026-09-01' });
    const p = await pay(db, c, 5100, { reference_no: 'GC-X' }); // credit 600
    await moveOut(db, r.tenancyId, '2026-09-30', { today: '2026-10-02' });
    await recordRefund(db, r.id, 600);
    expect(await creditBalance(db, r.id)).toBe(0);

    const out = await reject(db, p.payment.id, null, 'Fake.');

    expect(Number(out.credit_reversed)).toBe(600);
    expect(Number(out.credit_balance)).toBe(-600);
    expect(await creditBalance(db, r.id)).toBe(-600);
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'unpaid', remaining: 4500 });
    expect(await ledger(db, r.id)).toEqual([['overpayment', 600], ['refund', -600], ['reversal', -600]]);
  });

  it('later credit pays the debt back before anything else (balance stays exact)', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 1000 });
    const p = await pay(db, c, 1500); // credit 500
    await recordRefund(db, r.id, 500);
    await reject(db, p.payment.id);
    expect(await creditBalance(db, r.id)).toBe(-500);
    await pay(db, c, 1500); // 1,000 applied, 500 credit → back to 0
    expect(await creditBalance(db, r.id)).toBe(0);
  });
});

describe('reverse_credit directly', () => {
  it('requires a rejected payment', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const p = await pay(db, c, 5000);
    const err = await rpcError(rpc(db, 'reverse_credit', { p_payment_id: p.payment.id }));
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(await creditBalance(db, r.id)).toBe(500);
  });

  it('re-applies a pre-existing positive balance to the item that was just reopened (OQ-16)', async () => {
    const r = await renter();
    const c1 = await givenCharge(db, r.tenancyId, { amount: 1000, period: '2026-09-01', due: '2026-09-05' });
    const p = await pay(db, c1, 1000);                       // c1 paid by p, no credit
    const c2 = await givenCharge(db, r.tenancyId, { amount: 500, period: '2026-10-01', due: '2026-10-05' });
    await pay(db, c2, 800);                                  // credit 300, no open items
    expect(await creditBalance(db, r.id)).toBe(300);
    const out = await reject(db, p.payment.id);              // c1 reopens; the 300 credit must go to it
    expect(Number(out.credit_balance)).toBe(0);
    expect(await itemRow(db, 'charge', c1)).toMatchObject({ status: 'partial', remaining: 700 });
  });
});

describe('credit_already_used (S11 warning) and privileges', () => {
  it('= C − min(C, max(balance, 0)); 0 when there is no credit', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 1000 });
    const noCredit = await pay(db, c, 400);
    expect(Number(await rpc(db, 'credit_already_used', { p_payment_id: noCredit.payment.id }))).toBe(0);
    const p = await pay(db, c, 1000); // applied 600, credit 400
    expect(Number(await rpc(db, 'credit_already_used', { p_payment_id: p.payment.id }))).toBe(0); // all still unused
    await recordRefund(db, r.id, 150); // balance 250 → 150 used
    expect(Number(await rpc(db, 'credit_already_used', { p_payment_id: p.payment.id }))).toBe(150);
  });

  it('the new functions are not executable by anon or authenticated', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 1000 });
    const p = await pay(db, c, 1000);
    for (const role of ['anon', 'authenticated']) {
      await expect(
        asRole(db, role, r.id, () => db.query('select public.review_payment($1, $2, null, null)', [p.payment.id, 'confirm'])),
      ).rejects.toThrow(/permission denied/i);
    }
  });
});

describe('review atomicity', () => {
  it('a failure inside reject rolls the whole review back', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const p = await pay(db, c, 5000);
    // Force a failure after step 1: an application_reversal can never be 0/negative → trip a check via a bad ledger state.
    await db.exec(`create or replace function public.__boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
                   create trigger __boom before insert on public.credit_ledger for each row when (new.entry_type = 'reversal') execute function public.__boom();`);
    try {
      await expect(review(db, p.payment.id, 'reject', null, 'x')).rejects.toThrow(/boom/);
    } finally {
      await db.exec('drop trigger __boom on public.credit_ledger; drop function public.__boom();');
    }
    expect((await paymentRow(db, p.payment.id)).verification).toBe('auto_verified');
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'paid' });
    expect(await creditBalance(db, r.id)).toBe(500);
  });
});

// Keep the linter quiet about helpers used only in some suites.
void givenTenancy;
