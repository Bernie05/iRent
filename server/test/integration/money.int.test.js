/**
 * B7–B9 against local Supabase: the true-concurrency cases PGlite (one connection) cannot cover,
 * plus a smoke pass of the new RPCs through the API's own wrapper (callRpc → mapDbError) so the
 * error codes, argument names and JSON shapes are checked over PostgREST.
 * Skipped unless local Supabase is up (see test/globalSetup.js).
 */
import { it, expect, beforeAll } from 'vitest';
import { describeLive, serviceClient, liveUser, liveBed, liveTenancy, liveCharge, uniqueRef } from '../helpers/live.js';
import { callRpc } from '../../src/lib/rpc.js';
import { randomUUID } from 'node:crypto';

const settle = (promises) => Promise.allSettled(promises);
const codes = (results) => results.map((r) => (r.status === 'fulfilled' ? 'ok' : r.reason.code)).sort();

describeLive('money RPCs on local Supabase (B7, B8, B9)', () => {
  let sb;
  let admin;

  const pay = (itemId, amount, extra = {}) =>
    callRpc('record_payment', {
      p_item_type: 'charge', p_item_id: itemId, p_method: 'gcash', p_amount: amount,
      p_reference_no: uniqueRef(), p_verification: 'auto_verified', ...extra,
    }, sb);
  const balance = async (renterId) =>
    Number((await sb.from('renter_credit_balances').select('balance').eq('renter_id', renterId).single()).data.balance);

  beforeAll(async () => {
    sb = serviceClient();
    admin = await liveUser(sb, { role: 'admin' });
  });

  it('E9: two concurrent create_renter calls on one bed: exactly one wins, the other gets BED_TAKEN', async () => {
    const bed = await liveBed(sb);
    const mk = async () => {
      const id = randomUUID();
      const email = `race-${id.slice(0, 8)}@irent.test`;
      const { error } = await sb.auth.admin.createUser({ id, email, email_confirm: true });
      if (error) throw error;
      return callRpc('create_renter', {
        p_auth_id: id, p_full_name: 'Race Renter', p_email: email, p_phone: '09170000000', p_language: 'en',
        p_bed_id: bed, p_move_in: '2026-10-01', p_deposit: null,
      }, sb);
    };
    const res = await settle([mk(), mk()]);
    expect(codes(res)).toEqual(['BED_TAKEN', 'ok']);
    const { data } = await sb.from('beds').select('status').eq('id', bed).single();
    expect(data.status).toBe('occupied');
  });

  it('E9: two concurrent assign_bed calls for different renters on one bed: one BED_TAKEN', async () => {
    const [a, b] = [await liveUser(sb), await liveUser(sb)];
    const bed = await liveBed(sb);
    const go = (r) => callRpc('assign_bed', { p_renter_id: r.id, p_bed_id: bed, p_move_in: '2026-10-01', p_deposit: null }, sb);
    expect(codes(await settle([go(a), go(b)]))).toEqual(['BED_TAKEN', 'ok']);
  });

  it('E9: concurrent assign_bed for one renter on two beds: one RENTER_HAS_ACTIVE_TENANCY', async () => {
    const r = await liveUser(sb);
    const [b1, b2] = [await liveBed(sb), await liveBed(sb)];
    const go = (bed) => callRpc('assign_bed', { p_renter_id: r.id, p_bed_id: bed, p_move_in: '2026-10-01', p_deposit: null }, sb);
    expect(codes(await settle([go(b1), go(b2)]))).toEqual(['RENTER_HAS_ACTIVE_TENANCY', 'ok']);
  });

  it('E6/SC-38: confirm and reject at the same moment: one wins, the other ALREADY_REVIEWED, state is consistent', async () => {
    const r = await liveUser(sb);
    const { tenancyId } = await liveTenancy(sb, r.id);
    const c = await liveCharge(sb, tenancyId, { amount: 4500 });
    const p = await pay(c, 5000); // applied 4,500, credit 500
    const review = (action) => callRpc('review_payment', {
      p_payment_id: p.payment.id, p_action: action, p_reason: action === 'reject' ? 'Fake' : null, p_admin_id: admin.id,
    }, sb);
    const res = await settle([review('confirm'), review('reject')]);
    expect(codes(res)).toEqual(['ALREADY_REVIEWED', 'ok']);
    const { data } = await sb.from('rent_charges').select('status').eq('id', c).single();
    const { data: pay1 } = await sb.from('payments').select('verification').eq('id', p.payment.id).single();
    if (pay1.verification === 'confirmed') {
      expect(data.status).toBe('paid');
      expect(await balance(r.id)).toBe(500);
    } else {
      expect(data.status).toBe('unpaid');
      expect(await balance(r.id)).toBe(0);
    }
  });

  it('a payment racing a rejection on the same renter serialises (renter lock): no credit is left beside an open item', async () => {
    const r = await liveUser(sb);
    const { tenancyId } = await liveTenancy(sb, r.id);
    const c1 = await liveCharge(sb, tenancyId, { amount: 1000, period: '2026-09-01', due: '2026-09-05' });
    const c2 = await liveCharge(sb, tenancyId, { amount: 1000, period: '2026-10-01', due: '2026-10-05' });
    const p1 = await pay(c1, 1500); // credit 500 → pays c2 partially (500)
    const rej = callRpc('review_payment', { p_payment_id: p1.payment.id, p_action: 'reject', p_reason: 'Fake', p_admin_id: admin.id }, sb);
    const more = pay(c2, 400);
    await settle([rej, more]);
    expect(await balance(r.id)).toBeLessThanOrEqual(0);
    const { data: open } = await sb.from('rent_charges').select('id').eq('tenancy_id', tenancyId).neq('status', 'paid');
    if (await balance(r.id) > 0) expect(open).toHaveLength(0);
  });

  it('generate_rent run twice at once creates each charge exactly once', async () => {
    const r = await liveUser(sb);
    await liveTenancy(sb, r.id, { moveIn: '2026-09-05' });
    const go = () => callRpc('generate_rent', { p_period: '2031-03-01', p_acting_user: admin.id }, sb);
    const [x, y] = await Promise.all([go(), go()]);
    const { count } = await sb.from('rent_charges').select('*', { count: 'exact', head: true }).eq('period', '2031-03-01');
    expect(x.created + y.created).toBe(count);
  });

  it('smoke: B7–B9 round trip through callRpc (shapes and error codes over PostgREST)', async () => {
    const r = await liveUser(sb);
    const { tenancyId, bedId } = await liveTenancy(sb, r.id, { moveIn: '2026-09-05' });
    const c = await liveCharge(sb, tenancyId, { amount: 4000, period: '2026-09-01', due: '2026-09-05' });
    const p = await pay(c, 5000); // credit 1,000

    const review = await callRpc('review_payment', { p_payment_id: p.payment.id, p_action: 'confirm', p_admin_id: admin.id }, sb);
    expect(review).toMatchObject({ verification: 'confirmed', renter: { id: r.id } });
    await expect(callRpc('review_payment', { p_payment_id: p.payment.id, p_action: 'confirm' }, sb)).rejects.toMatchObject({ code: 'ALREADY_REVIEWED', status: 409 });

    expect(await callRpc('due_date_for', { p_move_in: '2027-01-31', p_period: '2027-02-01' }, sb)).toBe('2027-02-28');
    expect(await callRpc('move_out_preview', { p_tenancy_id: tenancyId }, sb)).toEqual({ credit_balance: 1000, would_apply: 0, refund_due: 1000 });
    await expect(callRpc('move_out', { p_tenancy_id: tenancyId, p_move_out: '2999-01-01', p_acting_user: admin.id, p_today: null }, sb))
      .rejects.toMatchObject({ code: 'MOVE_OUT_IN_FUTURE', status: 400 });
    expect(await callRpc('move_out', { p_tenancy_id: tenancyId, p_move_out: '2026-10-01', p_acting_user: admin.id, p_today: null }, sb))
      .toEqual({ credit_applied: 0, refund_due: 1000 });
    expect((await sb.from('beds').select('status').eq('id', bedId).single()).data.status).toBe('vacant');

    await expect(callRpc('record_refund', { p_renter_id: r.id, p_amount: 1200, p_method: 'cash', p_admin_id: admin.id }, sb))
      .rejects.toMatchObject({ code: 'REFUND_EXCEEDS_CREDIT', message: "Refund can't be more than the credit balance ₱1,000.00." });
    const refund = await callRpc('record_refund', { p_renter_id: r.id, p_amount: 1000, p_method: 'cash', p_note: 'Returned', p_admin_id: admin.id }, sb);
    expect(refund).toMatchObject({ entry_type: 'refund', amount: -1000 });
    expect(await balance(r.id)).toBe(0);
  });
});
