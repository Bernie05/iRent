/**
 * B4: RLS, grants and storage policies on real Postgres (PGlite), switching roles the way
 * PostgREST does (set role + JWT subject). The live suite repeats the key checks with real
 * Supabase JWTs (test/integration/rls.int.test.js).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createDb, asRole, givenUser, givenRenter, givenCharge, givenShare, recordPayment } from '../helpers/pglite.js';

let db;
let A; // renter A with a charge, a share, a payment and credit
let B; // renter B, same
let admin;

const TABLES = [
  'profiles', 'beds', 'tenancies', 'rent_charges', 'utility_bills', 'bill_shares', 'payments', 'credit_ledger',
  'inquiries', 'announcements', 'announcement_reads', 'notifications_log', 'app_settings',
];

async function seedRenter() {
  const r = await givenRenter(db);
  r.charge = await givenCharge(db, r.tenancyId, { amount: 4500 });
  r.share = await givenShare(db, r.tenancyId, { amount: 300 });
  // ₱5,000 on the ₱4,500 charge: ₱500 credit, ₱300 pays the share, ₱200 left.
  r.pay = await recordPayment(db, { item_id: r.charge, amount: 5000 });
  await db.query(
    `insert into storage.objects (bucket_id, name) values ('receipts', $1)`,
    [`${r.id}/proof.png`],
  );
  return r;
}

async function tryQuery(sql, params) {
  try {
    const { rows } = await db.query(sql, params);
    return { rows };
  } catch (error) {
    return { error };
  }
}

beforeAll(async () => {
  db = await createDb();
  A = await seedRenter();
  B = await seedRenter();
  admin = await givenUser(db, { role: 'admin' });
  await db.query(`insert into public.inquiries (name, phone) values ('Prospect', '09171234567')`);
  await db.query(`insert into public.announcements (title, body) values ('Water interruption', 'Tomorrow 9–12')`);
  await db.query(
    `insert into public.notifications_log (tenancy_id, charge_id, type) values ($1, $2, 'due_today')`,
    [A.tenancyId, A.charge],
  );
});

describe('renter isolation (B4, R26, SC-11)', () => {
  it("with renter A's JWT, renter B's charges, shares, payments, ledger and tenancy are invisible", async () => {
    await asRole(db, 'authenticated', A.id, async () => {
      for (const [table, col, id] of [
        ['rent_charges', 'id', B.charge],
        ['bill_shares', 'id', B.share],
        ['payments', 'tenancy_id', B.tenancyId],
        ['credit_ledger', 'renter_id', B.id],
        ['tenancies', 'id', B.tenancyId],
        ['profiles', 'id', B.id],
        ['renter_credit_balances', 'renter_id', B.id],
      ]) {
        const { rows } = await db.query(`select * from public.${table} where ${col} = $1`, [id]);
        expect(rows, `${table} of renter B`).toHaveLength(0);
      }
    });
  });

  it('renter A sees exactly their own rows', async () => {
    await asRole(db, 'authenticated', A.id, async () => {
      const count = async (sql) => (await db.query(sql)).rows[0].n;
      expect(await count('select count(*)::int as n from public.rent_charges')).toBe(1);
      expect(await count('select count(*)::int as n from public.bill_shares')).toBe(1);
      expect(await count('select count(*)::int as n from public.utility_bills')).toBe(1);
      expect(await count('select count(*)::int as n from public.payments')).toBe(2); // gcash + credit application
      expect(await count('select count(*)::int as n from public.credit_ledger')).toBe(2);
      expect(await count('select count(*)::int as n from public.profiles')).toBe(1);
      expect(await count('select count(*)::int as n from public.beds')).toBe(1);
      expect(await count('select count(*)::int as n from public.announcements')).toBeGreaterThanOrEqual(1);
      const bal = await db.query('select renter_id, balance::text as b from public.renter_credit_balances');
      expect(bal.rows).toEqual([{ renter_id: A.id, b: '200.00' }]);
    });
  });

  it('renters cannot read admin-only tables', async () => {
    await asRole(db, 'authenticated', A.id, async () => {
      for (const table of ['inquiries', 'notifications_log', 'app_settings']) {
        const { rows } = await db.query(`select * from public.${table}`);
        expect(rows, table).toHaveLength(0);
      }
    });
  });

  it('the admin can select everything', async () => {
    await asRole(db, 'authenticated', admin.id, async () => {
      const { rows } = await db.query(
        'select count(*)::int as n from public.rent_charges where id = any($1::uuid[])',
        [[A.charge, B.charge]],
      );
      expect(rows[0].n).toBe(2);
      expect((await db.query('select * from public.inquiries')).rows.length).toBeGreaterThanOrEqual(1);
      expect((await db.query('select * from public.app_settings')).rows).toHaveLength(1);
      expect((await db.query('select * from public.credit_ledger where renter_id = $1', [B.id])).rows.length).toBe(2);
    });
  });
});

describe('anon (B4)', () => {
  it('anon can read no table rows', async () => {
    await asRole(db, 'anon', null, async () => {
      for (const table of [...TABLES, 'renter_credit_balances']) {
        const res = await tryQuery(`select * from public.${table}`);
        if (res.error) expect(String(res.error.message), table).toMatch(/permission denied/);
        else expect(res.rows, table).toHaveLength(0);
      }
    });
  });
});

describe('no client-side writes on money tables (B4)', () => {
  it('a renter cannot insert, update or delete money rows directly', async () => {
    await asRole(db, 'authenticated', A.id, async () => {
      const attempts = [
        [`insert into public.payments (tenancy_id, charge_id, amount, applied_amount, method, reference_no, verification)
          values ('${A.tenancyId}', '${A.charge}', 1, 1, 'gcash', 'HACK-1', 'confirmed')`],
        [`insert into public.credit_ledger (renter_id, entry_type, amount, payment_id)
          select '${A.id}', 'overpayment', 99999, id from public.payments limit 1`],
        [`update public.rent_charges set status = 'paid' where id = '${A.charge}'`],
        [`update public.profiles set role = 'admin' where id = '${A.id}'`],
        [`delete from public.payments where tenancy_id = '${A.tenancyId}'`],
        [`update public.beds set status = 'vacant'`],
      ];
      for (const [sql] of attempts) {
        const res = await tryQuery(sql);
        expect(res.error, sql).toBeDefined();
        expect(String(res.error.message)).toMatch(/permission denied|row-level security/);
      }
    });
    const { rows } = await db.query('select status from public.rent_charges where id = $1', [A.charge]);
    expect(rows[0].status).toBe('paid'); // unchanged: it was already paid by the ₱5,000 payment
    const role = await db.query('select role from public.profiles where id = $1', [A.id]);
    expect(role.rows[0].role).toBe('renter');
  });

  it('a renter can mark an announcement read for themselves only', async () => {
    const { rows } = await db.query('select id from public.announcements limit 1');
    const ann = rows[0].id;
    await asRole(db, 'authenticated', A.id, async () => {
      await db.query('insert into public.announcement_reads (announcement_id, renter_id) values ($1, $2)', [ann, A.id]);
      const res = await tryQuery('insert into public.announcement_reads (announcement_id, renter_id) values ($1, $2)', [ann, B.id]);
      expect(String(res.error?.message)).toMatch(/row-level security/);
    });
  });

  it('clients cannot execute the money RPCs or helpers', async () => {
    for (const role of ['authenticated', 'anon']) {
      await asRole(db, role, A.id, async () => {
        for (const sql of [
          `select public.record_payment('charge', '${B.charge}', 'gcash', 1, 'X-1')`,
          `select public.apply_credit('${A.id}', null)`,
          `select public.recalc_item_status('charge', '${A.charge}')`,
          `select public.credit_balance('${B.id}')`,
          `select public.payment_json('${A.pay.payment.id}')`,
        ]) {
          const res = await tryQuery(sql);
          expect(String(res.error?.message), `${role}: ${sql}`).toMatch(/permission denied/);
        }
      });
    }
  });
});

describe('append-only credit ledger (B4, BR-14)', () => {
  it('UPDATE and DELETE on credit_ledger fail for every role, including the service role', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await asRole(db, role, role === 'authenticated' ? admin.id : null, async () => {
        const upd = await tryQuery(`update public.credit_ledger set amount = 1 where renter_id = $1`, [A.id]);
        expect(String(upd.error?.message), `${role} update`).toMatch(/permission denied|append-only/);
        const del = await tryQuery(`delete from public.credit_ledger where renter_id = $1`, [A.id]);
        expect(String(del.error?.message), `${role} delete`).toMatch(/permission denied|append-only/);
      });
    }
    // Even the database owner is stopped by the trigger.
    const owner = await tryQuery(`delete from public.credit_ledger where renter_id = $1`, [A.id]);
    expect(String(owner.error?.message)).toMatch(/append-only/);
    const { rows } = await db.query('select count(*)::int as n from public.credit_ledger where renter_id = $1', [A.id]);
    expect(rows[0].n).toBe(2);
  });

  it('the service role can still append', async () => {
    await asRole(db, 'service_role', null, async () => {
      await db.query(
        `insert into public.credit_ledger (renter_id, entry_type, amount, refund_method) values ($1, 'refund', -1, 'cash')`,
        [A.id],
      );
    });
  });
});

describe('storage policies (B4)', () => {
  it('a renter cannot list or download objects in receipts, even their own', async () => {
    await asRole(db, 'authenticated', A.id, async () => {
      const { rows } = await db.query(`select * from storage.objects where bucket_id = 'receipts'`);
      expect(rows).toHaveLength(0);
      const ins = await tryQuery(`insert into storage.objects (bucket_id, name) values ('receipts', 'x/evil.png')`);
      expect(String(ins.error?.message)).toMatch(/row-level security/);
    });
  });

  it('public-media: anyone can read; only the admin can write', async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('public-media', 'beds/one.png')`);
    await asRole(db, 'anon', null, async () => {
      const { rows } = await db.query(`select name from storage.objects where bucket_id = 'public-media'`);
      expect(rows.map((r) => r.name)).toContain('beds/one.png');
      const ins = await tryQuery(`insert into storage.objects (bucket_id, name) values ('public-media', 'x.png')`);
      expect(ins.error).toBeDefined();
    });
    await asRole(db, 'authenticated', A.id, async () => {
      const ins = await tryQuery(`insert into storage.objects (bucket_id, name) values ('public-media', 'renter.png')`);
      expect(String(ins.error?.message)).toMatch(/row-level security/);
    });
    await asRole(db, 'authenticated', admin.id, async () => {
      await db.query(`insert into storage.objects (bucket_id, name) values ('public-media', 'admin.png')`);
      const del = await db.query(`delete from storage.objects where bucket_id = 'public-media' and name = 'admin.png' returning name`);
      expect(del.rows).toHaveLength(1);
      // the admin has no client access to receipts either (server only)
      const { rows } = await db.query(`select * from storage.objects where bucket_id = 'receipts'`);
      expect(rows).toHaveLength(0);
    });
  });
});
