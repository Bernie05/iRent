/**
 * B3, B4, B6 against local Supabase: seed, constraint mapping through the API's RPC wrapper,
 * RLS with real renter JWTs, receipts bucket privacy, append-only ledger, and true
 * concurrency for record_payment (SC-22).
 */
import { it, expect, beforeAll } from 'vitest';
import { describeLive, serviceClient, anonClient, liveUser, liveTenancy, liveCharge, uniqueRef } from '../helpers/live.js';
import { callRpc } from '../../src/lib/rpc.js';

const pay = (sb, itemId, amount, extra = {}) =>
  callRpc(
    'record_payment',
    {
      p_item_type: 'charge', p_item_id: itemId, p_method: 'gcash', p_amount: amount,
      p_reference_no: uniqueRef(), p_verification: 'auto_verified', ...extra,
    },
    sb,
  );

describeLive('database on local Supabase (B3, B4, B6)', () => {
  let sb;
  let A;
  let B;

  beforeAll(async () => {
    sb = serviceClient();
    A = await liveUser(sb);
    B = await liveUser(sb);
    A.t = await liveTenancy(sb, A.id);
    B.t = await liveTenancy(sb, B.id);
    A.charge = await liveCharge(sb, A.t.tenancyId);
    B.charge = await liveCharge(sb, B.t.tenancyId);
    await pay(sb, B.charge, 5000); // B: paid + ₱500 credit
    await sb.storage.from('receipts').upload(`${B.id}/proof.png`, Buffer.from('x'), { contentType: 'image/png', upsert: true });
  });

  it('B3: the seed has the 6 DESIGN.md beds and one app_settings row', async () => {
    const { data: beds } = await sb.from('beds').select('bunk_type, monthly_rate').like('label', 'Room _ –%');
    expect(beds.filter((b) => b.bunk_type === 'lower' && Number(b.monthly_rate) === 4500)).toHaveLength(3);
    expect(beds.filter((b) => b.bunk_type === 'upper' && Number(b.monthly_rate) === 4000)).toHaveLength(3);
    const { count } = await sb.from('app_settings').select('*', { count: 'exact', head: true });
    expect(count).toBe(1);
  });

  it('B3/B1: a duplicate reference (other case, spaces) surfaces as 409 DUPLICATE_REFERENCE', async () => {
    const ref = uniqueRef('DUP');
    await pay(sb, A.charge, 100, { p_reference_no: ref });
    await expect(pay(sb, A.charge, 100, { p_reference_no: ` ${ref.toLowerCase()} ` })).rejects.toMatchObject({
      code: 'DUPLICATE_REFERENCE', status: 409,
    });
  });

  it('B3/B1: a second active tenancy maps to RENTER_HAS_ACTIVE_TENANCY / BED_TAKEN', async () => {
    const { mapDbError } = await import('../../src/lib/dbErrors.js');
    const r1 = await sb.from('tenancies').insert({ renter_id: A.id, bed_id: B.t.bedId, move_in: '2026-09-01' });
    expect(['RENTER_HAS_ACTIVE_TENANCY', 'BED_TAKEN']).toContain(mapDbError(r1.error).code);
  });

  it("B4: with renter A's JWT, B's charges, payments and ledger return 0 rows", async () => {
    const asA = anonClient(A.token);
    for (const [table, col, val] of [
      ['rent_charges', 'id', B.charge],
      ['payments', 'tenancy_id', B.t.tenancyId],
      ['credit_ledger', 'renter_id', B.id],
      ['profiles', 'id', B.id],
    ]) {
      const { data, error } = await asA.from(table).select('*').eq(col, val);
      expect(error).toBeNull();
      expect(data, table).toHaveLength(0);
    }
    const own = await asA.from('rent_charges').select('id');
    expect(own.data.map((r) => r.id)).toContain(A.charge);
  });

  it('B4: anon can read no table rows', async () => {
    const anon = anonClient();
    for (const table of ['profiles', 'beds', 'rent_charges', 'payments', 'credit_ledger', 'inquiries', 'app_settings', 'announcements']) {
      const { data, error } = await anon.from(table).select('*').limit(1);
      if (error) expect(error.message).toMatch(/permission denied/);
      else expect(data, table).toHaveLength(0);
    }
  });

  it('B4: UPDATE / DELETE on credit_ledger fail even for the service role', async () => {
    const upd = await sb.from('credit_ledger').update({ note: 'x' }).eq('renter_id', B.id).select();
    expect(upd.error?.message).toMatch(/permission denied|append-only/);
    const del = await sb.from('credit_ledger').delete().eq('renter_id', B.id).select();
    expect(del.error?.message).toMatch(/permission denied|append-only/);
  });

  it('B4: a renter JWT cannot list or download objects in receipts', async () => {
    const asB = anonClient(B.token);
    const list = await asB.storage.from('receipts').list(B.id);
    expect(list.data ?? []).toHaveLength(0);
    const dl = await asB.storage.from('receipts').download(`${B.id}/proof.png`);
    expect(dl.error).toBeTruthy();
  });

  it('B4: clients cannot call the money RPCs', async () => {
    const { error } = await anonClient(A.token).rpc('record_payment', {
      p_item_type: 'charge', p_item_id: A.charge, p_method: 'gcash', p_amount: 1, p_reference_no: uniqueRef(),
    });
    expect(error?.message).toMatch(/permission denied/);
  });

  it('B6 / SC-22: two concurrent ₱3,000 payments on one ₱4,500 charge', async () => {
    const r = await liveUser(sb);
    const { tenancyId } = await liveTenancy(sb, r.id);
    const charge = await liveCharge(sb, tenancyId);
    const results = await Promise.all([pay(sb, charge, 3000), pay(sb, charge, 3000)]);
    const splits = results.map((x) => [Number(x.payment.applied_amount), Number(x.payment.credit_amount)]).sort((a, b) => b[0] - a[0]);
    expect(splits).toEqual([[3000, 0], [1500, 1500]]);
    const { data: c } = await sb.from('rent_charges').select('status').eq('id', charge).single();
    expect(c.status).toBe('paid');
    const { data: bal } = await sb.from('renter_credit_balances').select('balance').eq('renter_id', r.id).single();
    expect(Number(bal.balance)).toBe(1500);
  });

  it('B6: many concurrent payments never over-apply (Σ applied = amount)', async () => {
    const r = await liveUser(sb);
    const { tenancyId } = await liveTenancy(sb, r.id);
    const charge = await liveCharge(sb, tenancyId, { amount: 1000 });
    const settled = await Promise.allSettled(Array.from({ length: 8 }, () => pay(sb, charge, 300)));
    const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
    const failed = settled.filter((s) => s.status === 'rejected').map((s) => s.reason.code);
    const applied = ok.reduce((a, x) => a + Math.round(Number(x.payment.applied_amount) * 100), 0);
    expect(applied).toBe(100000);
    failed.forEach((code) => expect(code).toBe('ITEM_ALREADY_PAID'));
  });
});
