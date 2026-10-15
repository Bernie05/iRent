/**
 * B3: migrations + seed + constraints, executed on real Postgres (PGlite).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createDb, givenUser, givenBed, givenTenancy, givenCharge, givenShare, givenRenter } from '../helpers/pglite.js';

let db;
beforeAll(async () => {
  db = await createDb();
});

async function expectPgError(promise, pattern) {
  let err;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  expect(err, 'expected the statement to fail').toBeDefined();
  expect(String(err.message)).toMatch(pattern);
  return err;
}

async function insertPayment(fields) {
  const f = {
    amount: 100, applied_amount: 100, credit_amount: 0, method: 'gcash', reference_no: null,
    proof_url: null, verification: 'auto_verified', ...fields,
  };
  const cols = Object.keys(f);
  const params = cols.map((_, i) => `$${i + 1}`);
  return db.query(`insert into public.payments (${cols.join(', ')}) values (${params.join(', ')}) returning id`, Object.values(f));
}

describe('migrations and seed (B3)', () => {
  it('creates the 13 tables, the credit view and both buckets', async () => {
    const { rows } = await db.query(
      `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'announcement_reads', 'announcements', 'app_settings', 'beds', 'bill_shares', 'credit_ledger', 'inquiries',
      'notifications_log', 'payments', 'profiles', 'rent_charges', 'tenancies', 'utility_bills',
    ]);
    const view = await db.query(`select 1 from information_schema.views where table_name = 'renter_credit_balances'`);
    expect(view.rows).toHaveLength(1);
    const buckets = await db.query('select id, public from storage.buckets order by id');
    expect(buckets.rows).toEqual([
      { id: 'public-media', public: true },
      { id: 'receipts', public: false },
    ]);
  });

  it('seeds 6 beds: 3 lower at ₱4,500 and 3 upper at ₱4,000, all vacant', async () => {
    const { rows } = await db.query(
      `select bunk_type, monthly_rate::text as rate, count(*)::int as n, bool_and(status = 'vacant') as vacant
       from public.beds where label like 'Room %' group by 1, 2 order by 1`,
    );
    expect(rows).toEqual([
      { bunk_type: 'lower', rate: '4500.00', n: 3, vacant: true },
      { bunk_type: 'upper', rate: '4000.00', n: 3, vacant: true },
    ]);
  });

  it('seeds exactly one app_settings row (reminders on, all 5 types, 3 disabled accounts)', async () => {
    const { rows } = await db.query('select * from public.app_settings');
    expect(rows).toHaveLength(1);
    expect(rows[0].reminders_enabled).toBe(true);
    expect(rows[0].reminder_types).toEqual(['due_minus_3', 'due_today', 'overdue_1', 'overdue_3', 'overdue_7']);
    expect(rows[0].payment_accounts.map((a) => [a.method, a.enabled])).toEqual([
      ['gcash', false], ['maya', false], ['bpi', false],
    ]);
    await expectPgError(db.query('insert into public.app_settings (id) values (2)'), /app_settings_id_check/);
    await expectPgError(
      db.query(`update public.app_settings set reminder_types = array['weekly']`),
      /app_settings_reminder_types_check/,
    );
  });

  it('the app_settings row comes from the migrations alone (db push never runs the seed)', async () => {
    const noSeed = await createDb({ seed: false });
    const { rows } = await noSeed.query('select id, reminders_enabled from public.app_settings');
    expect(rows).toEqual([{ id: 1, reminders_enabled: true }]);
  });

  it('the seed is idempotent', async () => {
    const again = await createDb();
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { SUPABASE_DIR } = await import('../helpers/pglite.js');
    await again.exec(readFileSync(join(SUPABASE_DIR, 'seed.sql'), 'utf8'));
    const { rows } = await again.query('select count(*)::int as n from public.beds');
    expect(rows[0].n).toBe(6);
  });
});

describe('constraints (B3)', () => {
  it('BR-2: a duplicate reference with different case or spaces is rejected, per method', async () => {
    const r = await givenRenter(db);
    const c = await givenCharge(db, r.tenancyId, { amount: 4500 });
    await insertPayment({ tenancy_id: r.tenancyId, charge_id: c, reference_no: 'GC-12345' });
    await expectPgError(
      insertPayment({ tenancy_id: r.tenancyId, charge_id: c, reference_no: '  gc-12345 ' }),
      /payments_method_reference_uniq/,
    );
    // Same reference, another method: allowed.
    await insertPayment({ tenancy_id: r.tenancyId, charge_id: c, reference_no: 'GC-12345', method: 'maya' });
    // Rejected payments still hold their reference.
    await insertPayment({ tenancy_id: r.tenancyId, charge_id: c, reference_no: 'BPI-9', method: 'bpi', verification: 'rejected', rejection_reason: 'blurry' });
    await expectPgError(
      insertPayment({ tenancy_id: r.tenancyId, charge_id: c, reference_no: 'bpi-9', method: 'bpi' }),
      /payments_method_reference_uniq/,
    );
    // Cash without a reference is exempt (several allowed).
    await insertPayment({ tenancy_id: r.tenancyId, charge_id: c, method: 'cash', verification: 'confirmed' });
    await insertPayment({ tenancy_id: r.tenancyId, charge_id: c, method: 'cash', verification: 'confirmed' });
  });

  it('gcash/maya/bpi payments need a reference', async () => {
    const r = await givenRenter(db);
    const c = await givenCharge(db, r.tenancyId);
    await expectPgError(insertPayment({ tenancy_id: r.tenancyId, charge_id: c, method: 'maya' }), /payments_reference_required/);
  });

  it('BR-7: a second active tenancy for the same renter or the same bed is rejected', async () => {
    const renter = await givenUser(db);
    const other = await givenUser(db);
    const bed1 = await givenBed(db);
    const bed2 = await givenBed(db);
    await givenTenancy(db, renter.id, { bedId: bed1 });
    await expectPgError(givenTenancy(db, renter.id, { bedId: bed2 }), /tenancies_one_active_per_renter/);
    await expectPgError(givenTenancy(db, other.id, { bedId: bed1 }), /tenancies_one_active_per_bed/);

    // After move-out (inactive), the renter and the bed can have a new active tenancy.
    await db.query(
      `update public.tenancies set is_active = false, move_out = '2026-10-31' where renter_id = $1`,
      [renter.id],
    );
    await givenTenancy(db, other.id, { bedId: bed1 });
    await givenTenancy(db, renter.id, { bedId: bed2 });
  });

  it('tenancies: move_out ≥ move_in, and is_active matches move_out', async () => {
    const renter = await givenUser(db);
    const t = await givenTenancy(db, renter.id, { moveIn: '2026-10-10' });
    await expectPgError(
      db.query(`update public.tenancies set is_active = false, move_out = '2026-10-09' where id = $1`, [t]),
      /tenancies_move_out_after_move_in/,
    );
    await expectPgError(
      db.query(`update public.tenancies set is_active = false where id = $1`, [t]),
      /tenancies_active_matches_move_out/,
    );
  });

  it('a payment with both item ids, or neither, is rejected', async () => {
    const r = await givenRenter(db);
    const c = await givenCharge(db, r.tenancyId);
    const s = await givenShare(db, r.tenancyId);
    await expectPgError(insertPayment({ tenancy_id: r.tenancyId, charge_id: c, bill_share_id: s, reference_no: 'BOTH-1' }), /payments_one_item/);
    await expectPgError(insertPayment({ tenancy_id: r.tenancyId, reference_no: 'NONE-1' }), /payments_one_item/);
  });

  it('applied_amount + credit_amount must equal amount; amounts must be positive', async () => {
    const r = await givenRenter(db);
    const c = await givenCharge(db, r.tenancyId);
    await expectPgError(
      insertPayment({ tenancy_id: r.tenancyId, charge_id: c, reference_no: 'SPLIT-1', amount: 500, applied_amount: 400, credit_amount: 50 }),
      /payments_split_sums/,
    );
    await expectPgError(
      insertPayment({ tenancy_id: r.tenancyId, charge_id: c, reference_no: 'ZERO-1', amount: 0, applied_amount: 0 }),
      /payments_amount_check/,
    );
    await insertPayment({ tenancy_id: r.tenancyId, charge_id: c, reference_no: 'SPLIT-2', amount: 500, applied_amount: 400, credit_amount: 100 });
  });

  it('credit rows with a reference, a proof or a credit_amount are rejected', async () => {
    const r = await givenRenter(db);
    const c = await givenCharge(db, r.tenancyId);
    const base = { tenancy_id: r.tenancyId, charge_id: c, method: 'credit', verification: 'confirmed' };
    await expectPgError(insertPayment({ ...base, reference_no: 'CR-1' }), /payments_credit_rows/);
    await expectPgError(insertPayment({ ...base, proof_url: 'receipts/x.png' }), /payments_credit_rows/);
    await expectPgError(insertPayment({ ...base, amount: 100, applied_amount: 90, credit_amount: 10 }), /payments_credit_rows/);
    await insertPayment(base);
  });

  it('a rejection reason is only allowed on rejected payments', async () => {
    const r = await givenRenter(db);
    const c = await givenCharge(db, r.tenancyId);
    await expectPgError(
      insertPayment({ tenancy_id: r.tenancyId, charge_id: c, reference_no: 'RR-1', rejection_reason: 'x' }),
      /payments_rejection_reason/,
    );
  });

  it('credit ledger rows with the wrong sign for their type are rejected', async () => {
    const r = await givenRenter(db);
    const c = await givenCharge(db, r.tenancyId);
    const { rows } = await insertPayment({ tenancy_id: r.tenancyId, charge_id: c, reference_no: 'LEDGER-1' });
    const pay = rows[0].id;
    const ins = (type, amount, extra = {}) =>
      db.query(
        `insert into public.credit_ledger (renter_id, entry_type, amount, payment_id, refund_method)
         values ($1, $2, $3, $4, $5)`,
        [r.id, type, amount, extra.payment_id === undefined ? pay : extra.payment_id, extra.refund_method ?? null],
      );
    await expectPgError(ins('overpayment', -1), /credit_ledger_sign/);
    await expectPgError(ins('application_reversal', -1), /credit_ledger_sign/);
    await expectPgError(ins('application', 1), /credit_ledger_sign/);
    await expectPgError(ins('reversal', 1), /credit_ledger_sign/);
    await expectPgError(ins('refund', 1, { payment_id: null, refund_method: 'cash' }), /credit_ledger_sign/);
    await expectPgError(ins('overpayment', 0), /credit_ledger_amount_check/);

    await expectPgError(ins('overpayment', 5, { payment_id: null }), /credit_ledger_payment_link/);
    await expectPgError(ins('refund', -5, { payment_id: null }), /credit_ledger_refund_method/);
    await expectPgError(ins('refund', -5, { refund_method: 'cash' }), /credit_ledger_payment_link/);

    await ins('overpayment', 5);
    await ins('refund', -5, { payment_id: null, refund_method: 'gcash' });
    const bal = await db.query('select balance::text as b from public.renter_credit_balances where renter_id = $1', [r.id]);
    expect(bal.rows[0].b).toBe('0.00');
  });

  it('notifications_log: one reminder per item and type', async () => {
    const r = await givenRenter(db);
    const c = await givenCharge(db, r.tenancyId);
    const s = await givenShare(db, r.tenancyId);
    const log = (charge, share, type) =>
      db.query(
        'insert into public.notifications_log (tenancy_id, charge_id, bill_share_id, type) values ($1, $2, $3, $4)',
        [r.tenancyId, charge, share, type],
      );
    await log(c, null, 'due_minus_3');
    await expectPgError(log(c, null, 'due_minus_3'), /notifications_log_item_type_uniq/);
    await log(c, null, 'due_today');
    await log(null, s, 'due_minus_3');
    await expectPgError(log(c, s, 'overdue_1'), /notifications_log_one_item/);
  });

  it('rent charges: period is the 1st, one per tenancy and period, amount > 0', async () => {
    const r = await givenRenter(db);
    await expectPgError(givenCharge(db, r.tenancyId, { period: '2026-10-05' }), /rent_charges_period_check/);
    await givenCharge(db, r.tenancyId, { period: '2026-11-01' });
    await expectPgError(givenCharge(db, r.tenancyId, { period: '2026-11-01' }), /rent_charges_tenancy_period_key/);
    await expectPgError(givenCharge(db, r.tenancyId, { period: '2026-12-01', amount: 0 }), /rent_charges_amount_check/);
  });

  it('beds: unique label and rate between 1 and 100,000', async () => {
    await expectPgError(
      db.query(`insert into public.beds (label, room, bunk_type, monthly_rate) values ('Room 2 – Upper Bunk', 'Room 2', 'upper', 4000)`),
      /beds_label_key/,
    );
    await expectPgError(
      db.query(`insert into public.beds (label, room, bunk_type, monthly_rate) values ('X1', 'R', 'upper', 100001)`),
      /beds_monthly_rate_check/,
    );
  });

  it('profiles: email unique case-insensitively', async () => {
    const u = await givenUser(db);
    await db.query('insert into auth.users (id) values (gen_random_uuid())');
    await expectPgError(
      db.query(
        `insert into public.profiles (id, full_name, email) select id, 'Dup', upper($1) from auth.users where id not in (select id from public.profiles) limit 1`,
        [u.email],
      ),
      /profiles_email_uniq/,
    );
  });

  it('updated_at is maintained by trigger', async () => {
    const bed = await givenBed(db);
    const before = (await db.query('select updated_at from public.beds where id = $1', [bed])).rows[0].updated_at;
    await new Promise((r) => setTimeout(r, 10));
    await db.query(`update public.beds set room = 'Room Z' where id = $1`, [bed]);
    const after = (await db.query('select updated_at from public.beds where id = $1', [bed])).rows[0].updated_at;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });
});
