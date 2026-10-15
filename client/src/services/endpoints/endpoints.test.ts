/**
 * Drives every RTK Query endpoint through the real base query and supabase-js session against the MSW mocks,
 * so a wrong path, method or param in the API layer fails here rather than on a screen.
 */
import { makeStore } from '../../app/store';
import { getSupabase } from '../../lib/supabase';
import { MOCK_PASSWORD } from '../../mocks/fixtures';
import { publicApi } from './public';
import { renterApi } from './renter';
import { adminApi } from './admin';

async function signIn(email: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password: MOCK_PASSWORD });
  expect(error).toBeNull();
}

afterEach(async () => {
  await getSupabase().auth.signOut({ scope: 'local' });
});

function png() {
  return new File([new Uint8Array(100)], 'proof.png', { type: 'image/png' });
}

describe('public endpoints', () => {
  it('work without a session', async () => {
    const store = makeStore();
    expect((await store.dispatch(publicApi.endpoints.getHealth.initiate())).data).toEqual({ ok: true });
    expect((await store.dispatch(publicApi.endpoints.getAvailableBeds.initiate())).data).toHaveLength(2);
    expect((await store.dispatch(publicApi.endpoints.createInquiry.initiate({ name: 'Maria', phone: '09171234567' }))).data).toHaveProperty('id');
    expect((await store.dispatch(publicApi.endpoints.forgotPassword.initiate({ email: 'x@y.io' }))).data).toEqual({ ok: true });
  });
});

describe('renter endpoints', () => {
  it('every query resolves for a signed-in renter', async () => {
    await signIn('ana@irent.test');
    const store = makeStore();
    const e = renterApi.endpoints;
    const results = await Promise.all([
      store.dispatch(publicApi.endpoints.getMe.initiate()),
      store.dispatch(e.getMyCharges.initiate()),
      store.dispatch(e.getMyBills.initiate()),
      store.dispatch(e.getMyBalance.initiate()),
      store.dispatch(e.getMyCredit.initiate()),
      store.dispatch(e.getMyPayments.initiate()),
      store.dispatch(e.getMyPaymentProof.initiate('pay-ana-2')),
      store.dispatch(e.getMyPaymentAccounts.initiate()),
      store.dispatch(e.getMyAnnouncements.initiate()),
    ]);
    results.forEach((r) => expect(r.error).toBeUndefined());
  });

  it('markAnnouncementRead updates the unread count at once (optimistic, R18)', async () => {
    await signIn('ana@irent.test');
    const store = makeStore();
    const feed = store.dispatch(renterApi.endpoints.getMyAnnouncements.initiate());
    await feed;
    const select = renterApi.endpoints.getMyAnnouncements.select();
    expect(select(store.getState()).data?.unread_count).toBe(3);

    const pending = store.dispatch(renterApi.endpoints.markAnnouncementRead.initiate('ann-1'));
    // Before the server answers:
    expect(select(store.getState()).data?.unread_count).toBe(2);
    expect(select(store.getState()).data?.items.find((a) => a.id === 'ann-1')?.is_read).toBe(true);
    await pending;
    feed.unsubscribe();
  });

  it('rolls the optimistic read back when the request fails', async () => {
    await signIn('ana@irent.test');
    const { mockControl } = await import('../../mocks/control');
    const store = makeStore();
    const feed = store.dispatch(renterApi.endpoints.getMyAnnouncements.initiate());
    await feed;
    mockControl.failNext('POST', '/me/announcements/ann-2/read', 500, 'INTERNAL');
    await store.dispatch(renterApi.endpoints.markAnnouncementRead.initiate('ann-2'));
    expect(renterApi.endpoints.getMyAnnouncements.select()(store.getState()).data?.unread_count).toBe(3);
    feed.unsubscribe();
  });

  it('submitPayment sends multipart and returns a PayResult', async () => {
    await signIn('ben@irent.test');
    const store = makeStore();
    const result = await store.dispatch(
      renterApi.endpoints.submitPayment.initiate({ item_type: 'charge', item_id: 'chg-ben-2026-09', method: 'gcash', amount: 2500, reference_no: 'GC 1111 2222', proof: png() }),
    );
    expect(result.data).toMatchObject({ item_status: 'paid', remaining: 0, credit_added: 0 });
  });
});

describe('admin endpoints', () => {
  it('every query resolves for the admin', async () => {
    await signIn('admin@irent.test');
    const store = makeStore();
    const e = adminApi.endpoints;
    const results = await Promise.all([
      store.dispatch(e.getDashboard.initiate()),
      store.dispatch(e.getBeds.initiate()),
      store.dispatch(e.getRenters.initiate({ search: 'a' })),
      store.dispatch(e.getRenterCredit.initiate('usr-gil')),
      store.dispatch(e.getMoveOutPreview.initiate('ten-ana')),
      store.dispatch(e.getActiveTenancies.initiate()),
      store.dispatch(e.getRentCharges.initiate({ period: '2026-09-01', status: 'overdue' })),
      store.dispatch(e.getPayments.initiate({ verification: 'auto_verified' })),
      store.dispatch(e.getPaymentProof.initiate('pay-ben-2')),
      store.dispatch(e.getBills.initiate()),
      store.dispatch(e.getInquiries.initiate({ status: 'new' })),
      store.dispatch(e.getAnnouncements.initiate()),
      store.dispatch(e.getSettings.initiate()),
    ]);
    results.forEach((r) => expect(r.error).toBeUndefined());
    expect(results[7].data).toHaveLength(2);
  });

  it('every mutation reaches its handler', async () => {
    await signIn('admin@irent.test');
    const store = makeStore();
    const e = adminApi.endpoints;
    const run = async (action: PromiseLike<{ error?: unknown; data?: unknown }>) => {
      const result = await action;
      expect(result.error).toBeUndefined();
      return result.data as Record<string, unknown>;
    };

    const bed = await run(store.dispatch(e.createBed.initiate({ label: 'Room 9 – Lower', room: 'Room 9', bunk_type: 'lower', monthly_rate: 4500, status: 'vacant' })));
    await run(store.dispatch(e.updateBed.initiate({ id: String(bed.id), status: 'reserved' })));
    await run(store.dispatch(e.deleteBed.initiate(String(bed.id))));

    const created = await run(store.dispatch(e.createRenter.initiate({ full_name: 'Dan Reyes', email: 'dan@irent.test', phone: '09172223333', language: 'fil', bed_id: 'bed-5', move_in: new Date().toISOString().slice(0, 10) })));
    const renterId = String((created.renter as { id: string }).id);
    await run(store.dispatch(e.updateRenter.initiate({ id: renterId, phone: '09172224444' })));
    await run(store.dispatch(e.resendInvite.initiate(renterId)));
    await run(store.dispatch(e.recordRefund.initiate({ renterId: 'usr-gil', amount: 100, method: 'cash', refunded_at: '2026-09-20' })));
    await run(store.dispatch(e.assignBed.initiate({ renter_id: 'usr-gil', bed_id: 'bed-8', move_in: '2026-09-25' })));
    await run(store.dispatch(e.moveOut.initiate({ tenancyId: 'ten-cara', move_out: '2026-09-30' })));

    await run(store.dispatch(e.generateRent.initiate({ period: '2026-10-01' })));
    await run(store.dispatch(e.updateCharge.initiate({ id: 'chg-cara-2026-09', due_date: '2026-09-02' })));
    await run(store.dispatch(e.recordPayment.initiate({ item_type: 'charge', item_id: 'chg-cara-2026-09', method: 'cash', amount: 100, paid_at: '2026-09-20' })));
    await run(store.dispatch(e.reviewPayment.initiate({ id: 'pay-ben-2', action: 'confirm' })));

    const bill = await run(store.dispatch(e.createBill.initiate({ type: 'internet', period: '2026-09-01', total_amount: 1500, due_date: '2026-10-05' })));
    const shares = bill.shares as { id: string; amount: number }[];
    await run(store.dispatch(e.updateBillShares.initiate({ billId: String(bill.id), shares: shares.map((s) => ({ id: s.id, amount: s.amount })) })));

    await run(store.dispatch(e.updateInquiry.initiate({ id: 'inq-1', status: 'contacted' })));
    const ann = await run(store.dispatch(e.createAnnouncement.initiate({ title: 'Hi', body: 'There', priority: 'normal', pinned: false, send_email: false })));
    await run(store.dispatch(e.updateAnnouncement.initiate({ id: String(ann.id), title: 'Hi!', body: 'There', priority: 'urgent', pinned: true, send_email: false })));
    await run(store.dispatch(e.deleteAnnouncement.initiate(String(ann.id))));
    await run(
      store.dispatch(
        e.updateSettings.initiate({
          reminders_enabled: true,
          reminder_types: ['due_today'],
          payment_accounts: [{ method: 'gcash', enabled: true, account_name: 'B. Placeholder', account_number: '0917 000 0000' }],
        }),
      ),
    );
    const blocked = await store.dispatch(e.deleteCharge.initiate('chg-ana-2026-08'));
    expect(blocked.error).toMatchObject({ status: 409, code: 'CHARGE_HAS_PAYMENTS' });
  });
});
