/**
 * B8: due_date_for, generate_rent, create_bill, update_charge, update_bill_shares on real Postgres (PGlite).
 * SC-32, SC-35, SC-39, SC-56, SC-57, SC-60, E7, E8, E13, E14, E26, E27, E38, E44.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createDb, givenBed, givenCharge, givenShare, givenTenancy, givenUser, itemRow, creditBalance, invariantGuard,
  pay, createBill, generateRent, updateCharge, updateBillShares, rpc, rpcError, ledger, num,
} from '../helpers/money.js';
import { dueDateFor } from '../../src/lib/dueDate.js';
import { equalSplit } from '../../src/lib/split.js';

const vectors = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/due-dates.json', import.meta.url)), 'utf8'),
).vectors;

let db;
beforeAll(async () => {
  db = await createDb();
});
const renter = invariantGuard(() => db);

async function chargesOf(period) {
  const { rows } = await db.query(
    `select id, tenancy_id, amount::numeric as amount, due_date::text as due, status from public.rent_charges where period = $1`,
    [period],
  );
  return rows;
}
const chargeOf = async (tenancyId, period) => (await chargesOf(period)).find((c) => c.tenancy_id === tenancyId);

describe('due_date_for (BR-8, RK16): the shared vectors run against SQL and JS', () => {
  it('matches every vector in due-dates.json', async () => {
    expect(vectors.length).toBeGreaterThan(10);
    for (const v of vectors) {
      const { rows } = await db.query('select public.due_date_for($1::date, $2::date)::text as d', [v.move_in, v.period]);
      expect(rows[0].d, `${v.move_in} → ${v.period}`).toBe(v.expected);
      expect(dueDateFor(v.move_in, v.period)).toBe(v.expected);
    }
  });
});

describe('generate_rent (R36)', () => {
  it('SC-32/E7: creates a charge per active tenancy at the bed rate; a second run skips them all', async () => {
    const a = await renter({ moveIn: '2026-09-05', rate: 4500 });
    const b = await renter({ moveIn: '2026-09-20', rate: 4000 });
    const first = await generateRent(db, '2026-11-01');
    expect(first).toMatchObject({ skipped_not_moved_in: 0, credit_applied_total: 0 });
    expect(first.created).toBeGreaterThanOrEqual(2);
    expect(await chargeOf(a.tenancyId, '2026-11-01')).toMatchObject({ amount: '4500.00', due: '2026-11-05', status: 'unpaid' });
    expect(await chargeOf(b.tenancyId, '2026-11-01')).toMatchObject({ amount: '4000.00', due: '2026-11-20' });

    const again = await generateRent(db, '2026-11-01');
    expect(again).toMatchObject({ created: 0, skipped_existing: first.created, skipped_not_moved_in: 0 });
  });

  it('uses the bed’s current rate, not the rate at move-in', async () => {
    const a = await renter({ rate: 4500 });
    await db.query(
      `update public.beds set monthly_rate = 4800 where id = (select bed_id from public.tenancies where id = $1)`, [a.tenancyId]);
    await generateRent(db, '2026-12-01');
    expect(await chargeOf(a.tenancyId, '2026-12-01')).toMatchObject({ amount: '4800.00' });
  });

  it('SC-56: move-in Jan 31 → Feb 28 (2027), then Mar 31', async () => {
    const a = await renter({ moveIn: '2027-01-31' });
    await generateRent(db, '2027-02-01');
    await generateRent(db, '2027-03-01');
    expect((await chargeOf(a.tenancyId, '2027-02-01')).due).toBe('2027-02-28');
    expect((await chargeOf(a.tenancyId, '2027-03-01')).due).toBe('2027-03-31');
  });

  it('SC-57/E27: move-in Oct 20 → generating September skips it as not yet moved in; October works', async () => {
    const a = await renter({ moveIn: '2026-10-20' });
    const sep = await generateRent(db, '2026-09-01');
    expect(sep.skipped_not_moved_in).toBeGreaterThanOrEqual(1);
    expect(await chargeOf(a.tenancyId, '2026-09-01')).toBeUndefined();
    await generateRent(db, '2026-10-01');
    expect((await chargeOf(a.tenancyId, '2026-10-01')).due).toBe('2026-10-20');
  });

  it('ignores moved-out tenancies; E8: with no active tenancy it creates 0', async () => {
    const fresh = await createDb({ seed: false });
    const r = await givenUser(fresh);
    const t = await givenTenancy(fresh, r.id);
    await fresh.query(`update public.tenancies set is_active = false, move_out = '2026-09-30' where id = $1`, [t]);
    const out = await rpc(fresh, 'generate_rent', { p_period: '2026-11-01', p_acting_user: null });
    expect(out).toEqual({ created: 0, skipped_existing: 0, skipped_not_moved_in: 0, credit_applied_total: 0 });
  });

  it('SC-60: a renter’s credit pays the new charge (partial) and is reported in credit_applied_total', async () => {
    const a = await renter({ rate: 4500 });
    const c = await givenCharge(db, a.tenancyId, { amount: 4500 });
    await pay(db, c, 5000); // credit 500
    expect(await creditBalance(db, a.id)).toBe(500);
    const out = await generateRent(db, '2027-05-01');
    expect(num(out.credit_applied_total)).toBeGreaterThanOrEqual(500);
    const nov = await chargeOf(a.tenancyId, '2027-05-01');
    expect(nov.status).toBe('partial');
    expect(await itemRow(db, 'charge', nov.id)).toMatchObject({ paid: 500, remaining: 4000 });
    expect(await creditBalance(db, a.id)).toBe(0);
  });

  it('SC-60: credit larger than the charge pays it in full and the rest stays', async () => {
    const a = await renter({ rate: 4000, moveIn: '2027-06-10' });
    const c = await givenCharge(db, a.tenancyId, { amount: 1000, period: '2027-06-01', due: '2027-06-10' });
    await pay(db, c, 6000); // credit 5,000
    await generateRent(db, '2027-07-01');
    const jul = await chargeOf(a.tenancyId, '2027-07-01');
    expect(jul.status).toBe('paid');
    expect(await creditBalance(db, a.id)).toBe(1000);
  });

  it('rejects a period that is not the first of a month', async () => {
    const err = await rpcError(generateRent(db, '2026-11-15'));
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toHaveProperty('period');
  });
});

describe('create_bill (R39, BR-5, E13, E14)', () => {
  const sharesOf = (...pairs) => pairs.map(([tenancy_id, amount]) => ({ tenancy_id, amount }));

  it('SC-39: ₱1,000 across 3 renters (BR-5 split) stores the bill and unpaid shares', async () => {
    const [a, b, c] = [await renter({ moveIn: '2020-01-01' }), await renter({ moveIn: '2020-01-02' }), await renter({ moveIn: '2020-01-03' })];
    const parts = equalSplit(100000, 3).map((x) => x / 100);
    expect(parts).toEqual([333.34, 333.33, 333.33]);
    const out = await createBill(db, { total: '1000.00', shares: sharesOf([a.tenancyId, parts[0]], [b.tenancyId, parts[1]], [c.tenancyId, parts[2]]) });
    expect(num(out.credit_applied_total)).toBe(0);
    const { rows } = await db.query(
      `select s.amount::numeric as amount, s.status from public.bill_shares s where s.bill_id = $1 order by s.amount desc`, [out.bill_id]);
    expect(rows.map((r) => [Number(r.amount), r.status])).toEqual([[333.34, 'unpaid'], [333.33, 'unpaid'], [333.33, 'unpaid']]);
    const { rows: bill } = await db.query('select total_amount::numeric as t, type, due_date::text as due from public.utility_bills where id = $1', [out.bill_id]);
    expect(bill[0]).toEqual({ t: '1000.00', type: 'electricity', due: '2026-10-10' });
  });

  it('SC-60 step 2: a share is paid from the renter’s credit', async () => {
    const a = await renter();
    const ben = await renter();
    const c = await givenCharge(db, ben.tenancyId, { amount: 4500 });
    await pay(db, c, 5000); // ben credit 500
    const out = await createBill(db, { total: 600, shares: sharesOf([a.tenancyId, 300], [ben.tenancyId, 300]) });
    expect(num(out.credit_applied_total)).toBe(300);
    const { rows } = await db.query(
      `select t.renter_id, s.status from public.bill_shares s join public.tenancies t on t.id = s.tenancy_id where s.bill_id = $1`, [out.bill_id]);
    expect(Object.fromEntries(rows.map((r) => [r.renter_id, r.status]))).toMatchObject({ [a.id]: 'unpaid', [ben.id]: 'paid' });
    expect(await creditBalance(db, ben.id)).toBe(200);
  });

  it('SHARES_SUM_MISMATCH (400) and nothing is stored', async () => {
    const a = await renter();
    const before = (await db.query('select count(*)::int as n from public.utility_bills')).rows[0].n;
    const err = await rpcError(createBill(db, { total: 1000, shares: sharesOf([a.tenancyId, 999.99]) }));
    expect(err).toMatchObject({ code: 'SHARES_SUM_MISMATCH', status: 400 });
    expect((await db.query('select count(*)::int as n from public.utility_bills')).rows[0].n).toBe(before);
  });

  it('NO_ACTIVE_TENANCIES when nobody lives there (E14)', async () => {
    const fresh = await createDb({ seed: false });
    const err = await rpcError(createBill(fresh, { total: 1000, shares: [] }));
    expect(err).toMatchObject({ code: 'NO_ACTIVE_TENANCIES', status: 400 });
  });

  it('every share must belong to an active tenancy', async () => {
    const a = await renter();
    const gone = await renter();
    await db.query(`update public.tenancies set is_active = false, move_out = '2026-10-01' where id = $1`, [gone.tenancyId]);
    const err = await rpcError(createBill(db, { total: 600, shares: sharesOf([a.tenancyId, 300], [gone.tenancyId, 300]) }));
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toHaveProperty('shares');
    const err2 = await rpcError(createBill(db, { total: 300, shares: sharesOf(['00000000-0000-4000-8000-000000000000', 300]) }));
    expect(err2.code).toBe('VALIDATION_ERROR');
  });

  it('rejects bad totals, periods, duplicate or negative shares', async () => {
    const a = await renter();
    const ok = sharesOf([a.tenancyId, 100]);
    const cases = [
      [{ total: 0, shares: ok }, 'total_amount'],
      [{ total: 1000001, shares: ok }, 'total_amount'],
      [{ total: 100.005, shares: ok }, 'total_amount'],
      [{ total: 100, period: '2026-10-05', shares: ok }, 'period'],
      [{ total: 100, shares: sharesOf([a.tenancyId, 50], [a.tenancyId, 50]) }, 'shares'],
      [{ total: 100, shares: sharesOf([a.tenancyId, -100]) }, 'shares'],
      [{ total: 100, shares: {} }, 'shares'],
    ];
    for (const [args, field] of cases) {
      const err = await rpcError(createBill(db, args));
      expect(err.code, JSON.stringify(args)).toBe('VALIDATION_ERROR');
      expect(err.details).toHaveProperty(field);
    }
  });
});

describe('update_charge (R35, E44, SC-35)', () => {
  it('AMOUNT_BELOW_PAID (400) when the amount is under what was paid; nothing changes', async () => {
    const a = await renter();
    const c = await givenCharge(db, a.tenancyId, { amount: 4500 });
    await pay(db, c, 2000);
    const err = await rpcError(updateCharge(db, c, { amount: 1500 }));
    expect(err).toMatchObject({ code: 'AMOUNT_BELOW_PAID', status: 400 });
    expect(await itemRow(db, 'charge', c)).toMatchObject({ amount: 4500, status: 'partial' });
  });

  it('lowering to ₱4,000 keeps ₱2,000 remaining (partial); lowering to the paid amount → paid', async () => {
    const a = await renter();
    const c = await givenCharge(db, a.tenancyId, { amount: 4500 });
    await pay(db, c, 2000);
    expect(await updateCharge(db, c, { amount: 4000 })).toMatchObject({ id: c, status: 'partial', credit_applied_total: 0 });
    expect(await itemRow(db, 'charge', c)).toMatchObject({ remaining: 2000 });
    expect((await updateCharge(db, c, { amount: 2000 })).status).toBe('paid');
  });

  it('E44: raising the amount while the renter has credit applies it', async () => {
    const a = await renter();
    const c1 = await givenCharge(db, a.tenancyId, { amount: 1000, period: '2026-09-01', due: '2026-09-05' });
    await pay(db, c1, 1500); // c1 paid, credit 500
    expect(await creditBalance(db, a.id)).toBe(500);
    const out = await updateCharge(db, c1, { amount: 1400 });
    expect(out).toMatchObject({ status: 'paid' });
    expect(num(out.credit_applied_total)).toBe(400);
    expect(await creditBalance(db, a.id)).toBe(100);
    expect(await itemRow(db, 'charge', c1)).toMatchObject({ status: 'paid', paid: 1400 });
  });

  it('a due-date-only edit changes nothing else; unknown id → NOT_FOUND; bad amounts → VALIDATION_ERROR', async () => {
    const a = await renter();
    const c = await givenCharge(db, a.tenancyId, { amount: 4500 });
    await updateCharge(db, c, { due: '2026-10-09' });
    const { rows } = await db.query('select due_date::text as d, amount::numeric as a from public.rent_charges where id = $1', [c]);
    expect(rows[0]).toEqual({ d: '2026-10-09', a: '4500.00' });
    expect((await rpcError(updateCharge(db, '00000000-0000-4000-8000-000000000000', { amount: 5 }))).code).toBe('NOT_FOUND');
    for (const amount of [0, -1, 1.005]) {
      expect((await rpcError(updateCharge(db, c, { amount }))).code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('update_bill_shares (R39 edit)', () => {
  async function bill(a, b, amounts = [500, 500]) {
    const out = await createBill(db, { total: amounts[0] + amounts[1], shares: [
      { tenancy_id: a.tenancyId, amount: amounts[0] }, { tenancy_id: b.tenancyId, amount: amounts[1] }] });
    const { rows } = await db.query(
      `select s.id, t.renter_id from public.bill_shares s join public.tenancies t on t.id = s.tenancy_id where s.bill_id = $1`, [out.bill_id]);
    const byRenter = Object.fromEntries(rows.map((r) => [r.renter_id, r.id]));
    return { billId: out.bill_id, sa: byRenter[a.id], sb: byRenter[b.id] };
  }

  it('moves money between shares when the sum still matches', async () => {
    const [a, b] = [await renter(), await renter()];
    const { billId, sa, sb } = await bill(a, b);
    const out = await updateBillShares(db, billId, [{ id: sa, amount: 700 }, { id: sb, amount: 300 }]);
    expect(out).toEqual({ bill_id: billId, credit_applied_total: 0 });
    expect(await itemRow(db, 'bill_share', sa)).toMatchObject({ amount: 700 });
    expect(await itemRow(db, 'bill_share', sb)).toMatchObject({ amount: 300 });
  });

  it('SHARES_SUM_MISMATCH counts unlisted shares too', async () => {
    const [a, b] = [await renter(), await renter()];
    const { billId, sa } = await bill(a, b);
    expect((await rpcError(updateBillShares(db, billId, [{ id: sa, amount: 700 }]))).code).toBe('SHARES_SUM_MISMATCH');
    expect(await itemRow(db, 'bill_share', sa)).toMatchObject({ amount: 500 });
  });

  it('AMOUNT_BELOW_PAID when a share drops under what it has received; nothing changes', async () => {
    const [a, b] = [await renter(), await renter()];
    const { billId, sa, sb } = await bill(a, b);
    await pay(db, sa, 400, { item_type: 'bill_share' });
    const err = await rpcError(updateBillShares(db, billId, [{ id: sa, amount: 300 }, { id: sb, amount: 700 }]));
    expect(err.code).toBe('AMOUNT_BELOW_PAID');
    expect(await itemRow(db, 'bill_share', sb)).toMatchObject({ amount: 500 });
  });

  it('lowering a share to what was paid settles it', async () => {
    const [a, b] = [await renter(), await renter()];
    const { billId, sa, sb } = await bill(a, b);
    await pay(db, sa, 400, { item_type: 'bill_share' });
    await updateBillShares(db, billId, [{ id: sa, amount: 400 }, { id: sb, amount: 600 }]);
    expect(await itemRow(db, 'bill_share', sa)).toMatchObject({ status: 'paid' });
  });

  it('raising a share while the renter has credit applies it (BR-10 trigger)', async () => {
    const [a, b] = [await renter(), await renter()];
    const { billId, sa, sb } = await bill(a, b);
    await pay(db, sb, 500, { item_type: 'bill_share' });          // b's share paid
    const cb = await givenCharge(db, b.tenancyId, { amount: 100, period: '2026-11-01', due: '2026-11-05' });
    await pay(db, cb, 300);                                       // credit 200
    expect(await creditBalance(db, b.id)).toBe(200);
    const out = await updateBillShares(db, billId, [{ id: sa, amount: 300 }, { id: sb, amount: 700 }]);
    expect(num(out.credit_applied_total)).toBe(200);
    expect(await itemRow(db, 'bill_share', sb)).toMatchObject({ status: 'paid', paid: 700 });
    expect(await creditBalance(db, b.id)).toBe(0);
    expect(await ledger(db, b.id)).toEqual([['overpayment', 200], ['application', -200]]);
  });

  it('unknown bill → NOT_FOUND; a foreign or duplicate share id → VALIDATION_ERROR', async () => {
    const [a, b] = [await renter(), await renter()];
    const { billId, sa } = await bill(a, b);
    expect((await rpcError(updateBillShares(db, '00000000-0000-4000-8000-000000000000', [{ id: sa, amount: 1 }]))).code).toBe('NOT_FOUND');
    const other = await bill(a, b);
    expect((await rpcError(updateBillShares(db, billId, [{ id: other.sa, amount: 500 }]))).code).toBe('VALIDATION_ERROR');
    expect((await rpcError(updateBillShares(db, billId, [{ id: sa, amount: 500 }, { id: sa, amount: 500 }]))).code).toBe('VALIDATION_ERROR');
  });
});

void givenBed; void givenShare;
