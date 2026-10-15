/**
 * B10: the end-to-end credit chain SC-59 → SC-60 → SC-62 → SC-63 → SC-64 → SC-65 → SC-66 on one
 * database, in order, with the invariant checker (all renters) after every step and the expected
 * balances written out per step. Then the checker's own sanity test and a seeded random-operation
 * run (fast-check) that asserts the invariants after every operation.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  createDb, givenRenter, givenCharge, givenShare, givenBed, assertInvariants, snapshot, invariantViolations,
  pay, payCash, reject, review, generateRent, createBill, updateCharge, moveOut, moveOutPreview, assignBed,
  recordRefund, ledger, rpcError, itemRow, givenAdmin, num,
} from '../helpers/money.js';
import { equalSplit } from '../../src/lib/split.js';

const round = (x) => Math.round(x * 100) / 100;

describe('credit chain (SC-59 → SC-66), one database, in sequence', () => {
  let db;
  const people = {};
  const st = {}; // ids carried between steps

  beforeAll(async () => {
    db = await createDb({ seed: false });
  });
  afterEach(async () => {
    await assertInvariants(db); // every renter in the database, after every step
  });

  /** Expect { credit, open } for each [renter, want]. */
  async function expectTable(table) {
    for (const [r, want] of table) {
      const got = await snapshot(db, r.id);
      expect({ credit: got.credit, open: got.open }, r.name).toEqual({ credit: want.credit, open: want.open });
    }
  }
  const newRenter = async (name, opts) => (people[name] = { name, ...(await givenRenter(db, opts)) });

  it('setup: ana (rent 4,500 + electricity 850 open), ben (credit 5,000), dee (credit 500 via GC-5000)', async () => {
    const ana = await newRenter('ana', { rate: 4500, moveIn: '2026-09-05' });
    const ben = await newRenter('ben', { rate: 4000, moveIn: '2026-09-20' });
    const dee = await newRenter('dee', { rate: 4500, moveIn: '2026-09-05' });
    st.anaRent = await givenCharge(db, ana.tenancyId, { amount: 4500, period: '2026-10-01', due: '2026-10-05' });
    st.anaElec = await givenShare(db, ana.tenancyId, { amount: 850, period: '2026-10-01', due: '2026-10-10' });
    const benRent = await givenCharge(db, ben.tenancyId, { amount: 4000, period: '2026-10-01', due: '2026-10-20' });
    await pay(db, benRent, 9000);
    st.deeRent = await givenCharge(db, dee.tenancyId, { amount: 4500, period: '2026-10-01', due: '2026-10-05' });
    st.deeP = await pay(db, st.deeRent, 5000, { reference_no: 'GC-5000' });

    await expectTable([[ana, { credit: 0, open: 5350 }], [ben, { credit: 5000, open: 0 }], [dee, { credit: 500, open: 0 }]]);
  });

  it('SC-59: ana pays ₱5,000 on rent; the ₱500 excess pays the electricity share at once', async () => {
    const res = await pay(db, st.anaRent, 5000, { reference_no: 'GC-5K' });
    expect(Number(res.credit_added)).toBe(500);
    expect(res.credit_applied).toHaveLength(1);
    await expectTable([[people.ana, { credit: 0, open: 350 }]]);
    expect(await itemRow(db, 'bill_share', st.anaElec)).toMatchObject({ status: 'partial', remaining: 350 });
  });

  it('SC-60: Generate November pays from credit; a 3-way bill is paid from ben’s credit', async () => {
    const gen = await generateRent(db, '2026-11-01');
    expect(gen).toEqual({ created: 3, skipped_existing: 0, skipped_not_moved_in: 0, credit_applied_total: 4500 });
    await expectTable([
      [people.ana, { credit: 0, open: 350 + 4500 }],
      [people.ben, { credit: 1000, open: 0 }], // November 4,000 paid in full from credit
      [people.dee, { credit: 0, open: 4000 }], // November 4,500 − 500
    ]);
    await assertInvariants(db);

    const { rows } = await db.query(`select id, move_in::text as move_in from public.tenancies where is_active`);
    const split = equalSplit(100000, rows); // BR-5: 333.34, 333.33, 333.33
    const out = await createBill(db, {
      type: 'electricity', period: '2026-11-01', due: '2026-11-10', total: '1000.00',
      shares: split.map((s) => ({ tenancy_id: s.tenancy_id, amount: s.amount / 100 })),
    });
    const share = (name) => split.find((s) => s.tenancy_id === people[name].tenancyId).amount / 100;
    st.share = { ana: share('ana'), ben: share('ben'), dee: share('dee') };
    expect(num(out.credit_applied_total)).toBe(st.share.ben);
    await expectTable([
      [people.ana, { credit: 0, open: round(350 + 4500 + st.share.ana) }],
      [people.ben, { credit: round(1000 - st.share.ben), open: 0 }],
      [people.dee, { credit: 0, open: round(4000 + st.share.dee) }],
    ]);
  });

  it('SC-62: rejecting dee’s GC-5000 reopens October and November; the ledger nets to 0', async () => {
    const out = await reject(db, st.deeP.payment.id, null, 'Fake.');
    expect(Number(out.credit_balance)).toBe(0);
    expect(out.items_reopened).toHaveLength(2);
    await expectTable([[people.dee, { credit: 0, open: round(4500 + 4500 + st.share.dee) }]]);
    expect(await ledger(db, people.dee.id)).toEqual([
      ['overpayment', 500], ['application', -500], ['reversal', -500], ['application_reversal', 500],
    ]);
  });

  it('SC-63: the unwinding overshoots; the surplus is re-applied (outstanding 3,700 + 4,500)', async () => {
    const erin = await newRenter('erin', { rate: 4500, moveIn: '2026-09-05' });
    const admin = await givenAdmin(db);
    const oct = await givenCharge(db, erin.tenancyId, { amount: 4500, period: '2026-10-01', due: '2026-10-05' });
    const water = await givenShare(db, erin.tenancyId, { amount: 300, type: 'water', period: '2026-10-01', due: '2026-10-15' });
    const A = await pay(db, oct, 4700, { reference_no: 'GC-A' });
    await payCash(db, water, 1100, admin, { item_type: 'bill_share' });
    const gen = await generateRent(db, '2026-11-01');
    expect(gen).toMatchObject({ created: 1, skipped_existing: 3 });
    expect(num(gen.credit_applied_total)).toBe(1000);
    await assertInvariants(db);

    await reject(db, A.payment.id, admin.id, 'Fake.');
    await expectTable([[erin, { credit: 0, open: 8200 }]]);
    expect(await itemRow(db, 'charge', oct)).toMatchObject({ status: 'partial', remaining: 3700 });
    expect((await ledger(db, erin.id)).reduce((s, [, a]) => s + a, 0)).toBe(0);
  });

  it('SC-64: cara’s credit was refunded, then GC-X is rejected: she owes ₱600 (outstanding 5,100)', async () => {
    const cara = await newRenter('cara', { rate: 4500, moveIn: '2026-09-01' });
    const sep = await givenCharge(db, cara.tenancyId, { amount: 4500, period: '2026-09-01', due: '2026-09-01' });
    const X = await pay(db, sep, 5100, { reference_no: 'GC-X' });
    expect((await moveOut(db, cara.tenancyId, '2026-09-30', { today: '2026-10-02' })).refund_due).toBe(600);
    await recordRefund(db, cara.id, 600);
    await reject(db, X.payment.id, null, 'Fake.');
    expect(await snapshot(db, cara.id)).toEqual({ credit: -600, open: 4500, outstanding: 5100 });
  });

  it('SC-65: move-out with ₱1,000 credit; over-refund fails; the exact refund clears it', async () => {
    const gia = await newRenter('gia', { rate: 4000, moveIn: '2026-09-05' });
    const sep = await givenCharge(db, gia.tenancyId, { amount: 4000, period: '2026-09-01', due: '2026-09-05' });
    await pay(db, sep, 5000);
    expect(await moveOutPreview(db, gia.tenancyId)).toEqual({ credit_balance: 1000, would_apply: 0, refund_due: 1000 });
    expect(await moveOut(db, gia.tenancyId, '2026-10-02', { today: '2026-10-02' })).toEqual({ credit_applied: 0, refund_due: 1000 });
    const err = await rpcError(recordRefund(db, gia.id, 1200));
    expect(err.message).toBe("Refund can't be more than the credit balance ₱1,000.00.");
    await recordRefund(db, gia.id, 1000, { note: 'Returned in person' });
    expect(await snapshot(db, gia.id)).toEqual({ credit: 0, open: 0, outstanding: 0 });
  });

  it('SC-66: hal moves out with ₱1,000 credit, is reassigned, and the credit pays the next charge', async () => {
    const hal = await newRenter('hal', { rate: 4500, moveIn: '2026-09-05' });
    const sep = await givenCharge(db, hal.tenancyId, { amount: 4500, period: '2026-09-01', due: '2026-09-05' });
    await pay(db, sep, 5500);
    await moveOut(db, hal.tenancyId, '2026-09-30', { today: '2026-10-02' });
    expect((await snapshot(db, hal.id)).credit).toBe(1000);
    const b6 = await givenBed(db, { rate: 4000 });
    const t2 = await assignBed(db, hal.id, b6, '2026-10-10');
    expect((await snapshot(db, hal.id)).credit).toBe(1000); // assigning applies nothing by itself

    const gen = await generateRent(db, '2026-10-01');
    expect(gen).toEqual({ created: 1, skipped_existing: 4, skipped_not_moved_in: 0, credit_applied_total: 1000 });
    expect(await snapshot(db, hal.id)).toEqual({ credit: 0, open: 3000, outstanding: 3000 });
    const { rows } = await db.query(`select due_date::text as d, status from public.rent_charges where tenancy_id = $1`, [t2.tenancy_id]);
    expect(rows).toEqual([{ d: '2026-10-10', status: 'partial' }]);
  });

  it('final: credit applications only ever point at credit payments', async () => {
    const { rows } = await db.query(
      `select count(*)::int as n from public.credit_ledger l join public.payments p on p.id = l.payment_id
       where l.entry_type = 'application' and p.method <> 'credit'`);
    expect(rows[0].n).toBe(0);
  });
});

describe('the invariant checker itself', () => {
  it('catches a wrong status, a credit left beside an open item and an over-applied item', async () => {
    const fresh = await createDb({ seed: false });
    const r = await givenRenter(fresh);
    const c = await givenCharge(fresh, r.tenancyId, { amount: 1000 });
    await pay(fresh, c, 1000);
    expect(await invariantViolations(fresh, r.id)).toEqual([]);

    await fresh.query(`update public.rent_charges set status = 'unpaid' where id = $1`, [c]);
    expect((await invariantViolations(fresh, r.id)).some((p) => /status unpaid, expected paid/.test(p))).toBe(true);
    await fresh.query(`update public.rent_charges set status = 'paid' where id = $1`, [c]);

    const c2 = await givenCharge(fresh, r.tenancyId, { amount: 500, period: '2026-11-01', due: '2026-11-05' });
    await fresh.query(
      `insert into public.credit_ledger (renter_id, entry_type, amount, payment_id)
       select $1, 'overpayment', 50, id from public.payments limit 1`, [r.id]);
    expect((await invariantViolations(fresh, r.id)).some((p) => /credit 50(\.00)? > 0 with 1 open item/.test(p))).toBe(true);

    await fresh.query(`update public.rent_charges set amount = 10 where id = $1`, [c2]);
    await fresh.query(
      `insert into public.payments (tenancy_id, charge_id, amount, applied_amount, credit_amount, method, verification)
       values ($1, $2, 20, 20, 0, 'cash', 'confirmed')`, [r.tenancyId, c2]);
    expect((await invariantViolations(fresh, r.id)).some((p) => /paid 2000 > amount 1000/.test(p))).toBe(true);
  });
});

describe('random operation sequences keep every invariant (seeded)', () => {
  const OK = new Set([
    'ITEM_ALREADY_PAID', 'REFUND_EXCEEDS_CREDIT', 'ALREADY_REVIEWED', 'AMOUNT_BELOW_PAID', 'BED_TAKEN',
    'RENTER_HAS_ACTIVE_TENANCY', 'SHARES_SUM_MISMATCH', 'NOT_FOUND', 'MOVE_OUT_BEFORE_MOVE_IN',
  ]);
  const op = fc.oneof(
    fc.record({ k: fc.constant('pay'), who: fc.nat(), item: fc.nat(), cents: fc.integer({ min: 1, max: 900000 }), cash: fc.boolean() }),
    fc.record({ k: fc.constantFrom('reject', 'confirm'), who: fc.nat(), pay: fc.nat() }),
    fc.record({ k: fc.constant('gen') }),
    fc.record({ k: fc.constant('bill'), cents: fc.integer({ min: 1, max: 500000 }) }),
    fc.record({ k: fc.constant('raise'), who: fc.nat(), item: fc.nat(), cents: fc.integer({ min: 1, max: 300000 }) }),
    fc.record({ k: fc.constant('refund'), who: fc.nat(), pct: fc.integer({ min: 1, max: 100 }) }),
    fc.record({ k: fc.constant('moveout'), who: fc.nat() }),
    fc.record({ k: fc.constant('assign'), who: fc.nat() }),
  );

  let period = 0;
  const nextPeriod = () => `${2028 + Math.floor(period / 12)}-${String((period++ % 12) + 1).padStart(2, '0')}-01`;

  it('40 random runs of 5–25 operations', async () => {
    const rdb = await createDb({ seed: false });
    const admin = await givenAdmin(rdb);
    const q = async (sql, params) => (await rdb.query(sql, params)).rows;
    const items = (where) => `
      select 'charge' as t, c.id from public.rent_charges c join public.tenancies t on t.id = c.tenancy_id
        where t.renter_id = $1 ${where.charge}
      union all
      select 'bill_share', s.id from public.bill_shares s join public.tenancies t on t.id = s.tenancy_id
        where t.renter_id = $1 ${where.share}`;
    const OPEN = items({ charge: `and c.status <> 'paid'`, share: `and s.status <> 'paid'` });
    const CHARGES = items({ charge: '', share: 'and false' });
    const pick = (arr, n) => (arr.length ? arr[n % arr.length] : undefined);

    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 5, maxLength: 25 }), async (ops) => {
        // Earlier runs' renters stay in the database but no longer take part (keeps each run fast).
        await rdb.query('update public.tenancies set move_out = move_in, is_active = false where is_active');
        const crew = [];
        for (const rate of [4500, 4000, 4500]) {
          const r = await givenRenter(rdb, { rate, moveIn: '2027-09-05' });
          await givenCharge(rdb, r.tenancyId, { amount: rate, period: '2027-09-01', due: '2027-09-05' });
          crew.push(r);
        }
        for (const o of ops) {
          try {
            const r = o.who === undefined ? undefined : pick(crew, o.who);
            if (o.k === 'pay') {
              const it = pick(await q(OPEN, [r.id]), o.item);
              if (it && o.cash) await payCash(rdb, it.id, o.cents / 100, admin, { item_type: it.t });
              else if (it) await pay(rdb, it.id, o.cents / 100, { item_type: it.t });
            } else if (o.k === 'reject' || o.k === 'confirm') {
              const p = pick(await q(
                `select p.id from public.payments p join public.tenancies t on t.id = p.tenancy_id
                 where t.renter_id = $1 and p.verification = 'auto_verified'`, [r.id]), o.pay);
              if (p) await review(rdb, p.id, o.k, admin.id, 'fuzz');
            } else if (o.k === 'gen') {
              await generateRent(rdb, nextPeriod(), admin.id);
            } else if (o.k === 'bill') {
              const active = await q(`select id, move_in::text as move_in from public.tenancies where is_active`);
              if (active.length) {
                const split = equalSplit(o.cents, active);
                await createBill(rdb, {
                  total: (o.cents / 100).toFixed(2), period: '2027-10-01',
                  shares: split.map((s) => ({ tenancy_id: s.tenancy_id, amount: s.amount / 100 })),
                });
              }
            } else if (o.k === 'raise') {
              const it = pick(await q(CHARGES, [r.id]), o.item);
              if (it) await updateCharge(rdb, it.id, { amount: ((await itemRow(rdb, 'charge', it.id)).amount + o.cents / 100).toFixed(2), acting: admin.id });
            } else if (o.k === 'refund') {
              const bal = (await snapshot(rdb, r.id)).credit;
              if (bal > 0) await recordRefund(rdb, r.id, Math.max(0.01, Math.floor(bal * o.pct) / 100).toFixed(2), { admin: admin.id });
            } else if (o.k === 'moveout') {
              await moveOut(rdb, r.tenancyId, '2027-10-01', { acting: admin.id, today: '2027-10-02' });
            } else if (o.k === 'assign') {
              await assignBed(rdb, r.id, await givenBed(rdb), '2027-10-02');
            }
          } catch (e) {
            const err = await rpcError(Promise.reject(e));
            if (!OK.has(err.code)) throw e;
          }
          for (const c of crew) await assertInvariants(rdb, c.id);
        }
      }),
      { numRuns: 40, seed: 20261002 },
    );
  }, 300_000);
});
