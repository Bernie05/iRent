/**
 * B6: record_payment, apply_credit, recalc_item_status on real Postgres (PGlite).
 * The money invariants are checked after every test for every renter it touched.
 * True concurrency (SC-22 with Promise.all) needs several connections: see
 * test/integration/paymentRpcs.int.test.js (runs against local Supabase).
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  createDb, asRole, givenRenter, givenUser, givenTenancy, givenCharge, givenShare, recordPayment, creditBalance,
  itemRow, invariantViolations, uniqueRef,
} from '../helpers/pglite.js';
import { mapDbError } from '../../src/lib/dbErrors.js';

let db;
const touched = new Set();

beforeAll(async () => {
  db = await createDb();
});

afterEach(async () => {
  for (const renterId of touched) {
    expect(await invariantViolations(db, renterId), `invariants for ${renterId}`).toEqual([]);
  }
  touched.clear();
});

async function renter(opts) {
  const r = await givenRenter(db, opts);
  touched.add(r.id);
  return r;
}

async function rpcError(promise) {
  try {
    await promise;
  } catch (e) {
    // PGlite errors carry the Postgres fields; map them the way the API would.
    return mapDbError({ code: e.code, message: e.message, details: e.detail, hint: e.hint });
  }
  throw new Error('expected the RPC to fail');
}

async function ledger(renterId) {
  const { rows } = await db.query(
    'select entry_type, amount::numeric as amount from public.credit_ledger where renter_id = $1 order by created_at, id',
    [renterId],
  );
  return rows.map((r) => [r.entry_type, Number(r.amount)]);
}

async function paymentCount(renterId) {
  const { rows } = await db.query(
    'select count(*)::int as n from public.payments p join public.tenancies t on t.id = p.tenancy_id where t.renter_id = $1',
    [renterId],
  );
  return rows[0].n;
}

describe('record_payment: status (BR-1) and split (BR-9)', () => {
  it('a full payment → paid, with the PayResult contract shape', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const ref = uniqueRef('GC');
    const res = await recordPayment(db, { item_id: c, amount: 4500, reference_no: `  ${ref} `, submitted_by: r.id, expect_renter_id: r.id, proof_path: `${r.id}/p.png` });

    expect(res.item_status).toBe('paid');
    expect(Number(res.remaining)).toBe(0);
    expect(Number(res.credit_added)).toBe(0);
    expect(res.credit_applied).toEqual([]);
    expect(Number(res.credit_balance)).toBe(0);
    expect(Object.keys(res.payment).sort()).toEqual([
      'amount', 'applied_amount', 'credit_amount', 'has_proof', 'id', 'item', 'method', 'notes', 'paid_at',
      'reference_no', 'rejection_reason', 'reviewed_at', 'verification',
    ]);
    expect(res.payment).toMatchObject({
      item: { type: 'charge', id: c, period: '2026-10-01' },
      method: 'gcash',
      reference_no: ref, // trimmed
      has_proof: true,
      verification: 'auto_verified',
      rejection_reason: null,
      reviewed_at: null,
    });
    expect(Number(res.payment.applied_amount)).toBe(4500);
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'paid', remaining: 0 });
  });

  it('a lower amount → partial', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const res = await recordPayment(db, { item_id: c, amount: 2000 });
    expect(res.item_status).toBe('partial');
    expect(Number(res.remaining)).toBe(2500);
    const second = await recordPayment(db, { item_id: c, amount: 2500 });
    expect(second.item_status).toBe('paid');
  });

  it('overpaying ₱4,500 with ₱5,000 → applied 4,500, credit 500 and a ledger +500', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const res = await recordPayment(db, { item_id: c, amount: 5000 });
    expect(Number(res.payment.applied_amount)).toBe(4500);
    expect(Number(res.payment.credit_amount)).toBe(500);
    expect(Number(res.credit_added)).toBe(500);
    expect(res.item_status).toBe('paid');
    expect(Number(res.credit_balance)).toBe(500);
    expect(await ledger(r.id)).toEqual([['overpayment', 500]]);
  });

  it('centavo amounts are exact', async () => {
    const r = await renter();
    const s = await givenShare(db, r.tenancyId, { amount: 333.34 });
    const a = await recordPayment(db, { item_type: 'bill_share', item_id: s, amount: 0.01 });
    expect(Number(a.remaining)).toBe(333.33);
    const b = await recordPayment(db, { item_type: 'bill_share', item_id: s, amount: 333.35 });
    expect(Number(b.payment.applied_amount)).toBe(333.33);
    expect(Number(b.payment.credit_amount)).toBe(0.02);
    expect(b.payment.item).toMatchObject({ type: 'bill_share', id: s, bill_type: 'electricity', period: '2026-10-01' });
  });

  it('an admin-recorded cash payment without reference is confirmed with reviewer and time', async () => {
    const r = await renter();
    const admin = await givenUser(db, { role: 'admin' });
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const res = await recordPayment(db, {
      item_id: c, amount: 2000, method: 'cash', reference_no: null, verification: 'confirmed',
      submitted_by: admin.id, reviewed_by: admin.id, paid_at: '2026-10-02T03:00:00Z', notes: ' paid at the gate ',
    });
    expect(res.payment).toMatchObject({ method: 'cash', reference_no: null, verification: 'confirmed', notes: 'paid at the gate', has_proof: false });
    expect(res.payment.reviewed_at).not.toBeNull();
    expect(new Date(res.payment.paid_at).toISOString()).toBe('2026-10-02T03:00:00.000Z');
    const { rows } = await db.query('select reviewed_by from public.payments where id = $1', [res.payment.id]);
    expect(rows[0].reviewed_by).toBe(admin.id);
  });
});

describe('apply_credit after an overpayment (BR-10, R53a, OQ-16)', () => {
  it('SC-59: the excess pays the other open item right away', async () => {
    const r = await renter();
    const rent = await givenCharge(db, r.tenancyId, { amount: 4500, due: '2026-10-05' });
    const elec = await givenShare(db, r.tenancyId, { amount: 850, due: '2026-10-10' });

    const res = await recordPayment(db, { item_id: rent, amount: 5000, reference_no: uniqueRef('GC-5K') });

    expect(res.item_status).toBe('paid');
    expect(Number(res.credit_added)).toBe(500);
    expect(res.credit_applied).toHaveLength(1);
    expect(res.credit_applied[0].item).toMatchObject({ type: 'bill_share', id: elec, bill_type: 'electricity' });
    expect(Number(res.credit_applied[0].amount)).toBe(500);
    expect(Number(res.credit_balance)).toBe(0);
    expect(await itemRow(db, 'bill_share', elec)).toMatchObject({ status: 'partial', remaining: 350 });
    expect(await ledger(r.id)).toEqual([['overpayment', 500], ['application', -500]]);

    const { rows } = await db.query(
      `select method, amount::numeric as amount, applied_amount::numeric as applied, credit_amount::numeric as credit,
              verification, reference_no, proof_url
       from public.payments where bill_share_id = $1`,
      [elec],
    );
    expect(rows).toEqual([
      { method: 'credit', amount: '500.00', applied: '500.00', credit: '0.00', verification: 'confirmed', reference_no: null, proof_url: null },
    ]);
  });

  it('with another open ₱300 share, the ₱500 excess pays the share and leaves ₱200 credit', async () => {
    const r = await renter();
    const rent = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const water = await givenShare(db, r.tenancyId, { amount: 300, type: 'water' });
    const res = await recordPayment(db, { item_id: rent, amount: 5000 });
    expect(await itemRow(db, 'bill_share', water)).toMatchObject({ status: 'paid', remaining: 0 });
    expect(Number(res.credit_balance)).toBe(200);
    expect(await ledger(r.id)).toEqual([['overpayment', 500], ['application', -300]]);
    expect(await creditBalance(db, r.id)).toBe(200);
  });

  it('credit is applied oldest due date first, across current and past tenancies', async () => {
    const r = await renter({ moveIn: '2026-07-05' });
    const julyRent = await givenCharge(db, r.tenancyId, { amount: 1000, period: '2026-07-01', due: '2026-07-05' });
    const internet = await givenShare(db, r.tenancyId, { amount: 400, due: '2026-08-20', type: 'internet', period: '2026-08-01' });
    // Move out and in again: the old tenancy keeps its open items.
    await db.query(`update public.tenancies set is_active = false, move_out = '2026-08-31' where id = $1`, [r.tenancyId]);
    const t2 = await givenTenancy(db, r.id, { moveIn: '2026-09-10' });
    const octRent = await givenCharge(db, t2, { amount: 4500, period: '2026-10-01', due: '2026-10-10' });
    const sepRent = await givenCharge(db, t2, { amount: 4500, period: '2026-09-01', due: '2026-09-10' });

    // ₱5,700 on October: 4,500 applied, 1,200 credit → July rent (1,000), then 200 of internet.
    const res = await recordPayment(db, { item_id: octRent, amount: 5700 });
    expect(res.credit_applied.map((a) => [a.item.id, Number(a.amount)])).toEqual([
      [julyRent, 1000],
      [internet, 200],
    ]);
    expect(await itemRow(db, 'bill_share', internet)).toMatchObject({ status: 'partial', remaining: 200 });
    expect(await itemRow(db, 'charge', sepRent)).toMatchObject({ status: 'unpaid' });
    expect(Number(res.credit_balance)).toBe(0);
  });

  it('credit larger than all open items stays as credit (E29)', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4000 });
    const s = await givenShare(db, r.tenancyId, { amount: 100 });
    const res = await recordPayment(db, { item_id: c, amount: 9000 });
    expect(await itemRow(db, 'bill_share', s)).toMatchObject({ status: 'paid' });
    expect(Number(res.credit_balance)).toBe(4900);
  });

  it('apply_credit with no credit or no open items is a no-op', async () => {
    const r = await renter();
    await givenCharge(db, r.tenancyId, { amount: 4000 });
    const out = await asRole(db, 'service_role', null, async () =>
      (await db.query('select public.apply_credit($1, null) as a', [r.id])).rows[0].a,
    );
    expect(out).toEqual([]);
    expect(await paymentCount(r.id)).toBe(0);
  });
});

describe('SC-22: two ₱3,000 payments on one ₱4,500 charge (serialised)', () => {
  it('first applies 3,000; second applies 1,500 with 1,500 credit; the charge is paid', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const first = await recordPayment(db, { item_id: c, amount: 3000 });
    const second = await recordPayment(db, { item_id: c, amount: 3000 });
    expect([Number(first.payment.applied_amount), Number(first.payment.credit_amount)]).toEqual([3000, 0]);
    expect([Number(second.payment.applied_amount), Number(second.payment.credit_amount)]).toEqual([1500, 1500]);
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'paid', paid: 4500 });
    expect(await creditBalance(db, r.id)).toBe(1500);
  });
});

describe('record_payment errors (all-or-nothing)', () => {
  it('ITEM_ALREADY_PAID for a paid item; nothing is written', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    await recordPayment(db, { item_id: c, amount: 4500 });
    const before = await paymentCount(r.id);
    const err = await rpcError(recordPayment(db, { item_id: c, amount: 100 }));
    expect(err.code).toBe('ITEM_ALREADY_PAID');
    expect(err.status).toBe(409);
    expect(await paymentCount(r.id)).toBe(before);
  });

  it("NOT_FOUND for another renter's item (E20) or an unknown id; nothing is written", async () => {
    const a = await renter();
    const b = await renter();
    const cb = await givenCharge(db, b.tenancyId, { amount: 4500 });
    const err = await rpcError(recordPayment(db, { item_id: cb, amount: 100, expect_renter_id: a.id }));
    expect(err.code).toBe('NOT_FOUND');
    expect(await paymentCount(b.id)).toBe(0);
    const unknown = await rpcError(recordPayment(db, { item_id: '00000000-0000-4000-8000-000000000000', amount: 100 }));
    expect(unknown.code).toBe('NOT_FOUND');
  });

  it('DUPLICATE_REFERENCE (case and spaces ignored); the whole call rolls back', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 1000 });
    const other = await givenCharge(db, r.tenancyId, { amount: 1000, period: '2026-11-01', due: '2026-11-05' });
    const ref = uniqueRef('DUP');
    await recordPayment(db, { item_id: c, amount: 500, reference_no: ref });
    const ledgerBefore = await ledger(r.id);
    // Would overpay (credit + application) if it went through.
    const err = await rpcError(recordPayment(db, { item_id: other, amount: 5000, reference_no: ` ${ref.toLowerCase()} ` }));
    expect(err.code).toBe('DUPLICATE_REFERENCE');
    expect(err.status).toBe(409);
    expect(await ledger(r.id)).toEqual(ledgerBefore);
    expect(await itemRow(db, 'charge', other)).toMatchObject({ status: 'unpaid' });
  });

  it('rejects invalid input with VALIDATION_ERROR on the right field', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 1000 });
    const cases = [
      [{ method: 'credit' }, 'method'],
      [{ amount: 0 }, 'amount'],
      [{ amount: -5 }, 'amount'],
      [{ amount: 1.005 }, 'amount'],
      [{ amount: 1000000 }, 'amount'],
      [{ item_type: 'deposit' }, 'item_type'],
      [{ verification: 'rejected' }, 'verification'],
      [{ method: 'bpi', reference_no: '   ' }, 'reference_no'],
    ];
    for (const [override, field] of cases) {
      const err = await rpcError(recordPayment(db, { item_id: c, amount: 100, ...override }));
      expect(err.code, JSON.stringify(override)).toBe('VALIDATION_ERROR');
      expect(err.details).toHaveProperty(field);
    }
    expect(await paymentCount(r.id)).toBe(0);
  });
});

describe('recalc_item_status (BR-1)', () => {
  it('reverts to partial/unpaid when a payment is rejected, and ignores rejected rows', async () => {
    const r = await renter();
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    const p1 = await recordPayment(db, { item_id: c, amount: 3000 });
    const p2 = await recordPayment(db, { item_id: c, amount: 1500 });
    expect(p2.item_status).toBe('paid');

    const recalc = () =>
      asRole(db, 'service_role', null, async () =>
        (await db.query(`select public.recalc_item_status('charge', $1) as s`, [c])).rows[0].s,
      );
    await db.query(`update public.payments set verification = 'rejected', rejection_reason = 'x' where id = $1`, [p2.payment.id]);
    expect(await recalc()).toBe('partial');
    await db.query(`update public.payments set verification = 'rejected', rejection_reason = 'x' where id = $1`, [p1.payment.id]);
    expect(await recalc()).toBe('unpaid');
    expect(await itemRow(db, 'charge', c)).toMatchObject({ status: 'unpaid', paid: 0 });
  });

  it('unknown item → NOT_FOUND; unknown type → VALIDATION_ERROR', async () => {
    const e1 = await rpcError(asRole(db, 'service_role', null, () => db.query(`select public.recalc_item_status('charge', gen_random_uuid())`)));
    expect(e1.code).toBe('NOT_FOUND');
    const e2 = await rpcError(asRole(db, 'service_role', null, () => db.query(`select public.recalc_item_status('x', gen_random_uuid())`)));
    expect(e2.code).toBe('VALIDATION_ERROR');
  });
});
