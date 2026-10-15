/**
 * F1 acceptance: "Every endpoint in the API contract has an MSW handler returning the documented shape".
 * The endpoint list below is SPEC.md → API / Interfaces; the shapes are backend-task.md → API Contract.
 * Requests go through real fetch → MSW (node), exactly as the app's base query sends them.
 */
import { nodeFile, nodeFormData } from '../test/utils';
import { MOCK_PASSWORD } from './fixtures';
import { addDays } from '../lib/time';

const API = 'http://localhost:4000/api';
const AUTH = 'http://localhost:54321/auth/v1';

const KEYS = {
  item: ['type', 'id', 'period'],
  chargeRow: ['id', 'item', 'tenancy_id', 'amount', 'paid_total', 'paid_from_credit', 'remaining', 'due_date', 'status', 'is_overdue'],
  payment: ['id', 'item', 'method', 'amount', 'applied_amount', 'credit_amount', 'reference_no', 'has_proof', 'paid_at', 'notes', 'verification', 'rejection_reason', 'reviewed_at'],
  ledgerEntry: ['id', 'created_at', 'entry_type', 'amount'],
  renterRow: ['id', 'full_name', 'email', 'phone', 'language', 'status', 'invite_pending', 'tenancy', 'last_tenancy_id', 'outstanding', 'credit_balance', 'refund_due', 'birthday', 'unpaid_months', 'last_move_out'],
  bed: ['id', 'label', 'room', 'bunk_type', 'monthly_rate', 'status', 'photo_url', 'current_renter', 'has_history'],
  bill: ['id', 'type', 'period', 'total_amount', 'due_date', 'shares'],
  announcement: ['id', 'title', 'body', 'image_url', 'priority', 'pinned', 'emailed_at', 'created_at', 'updated_at', 'kind', 'starts_on', 'ends_on', 'start_time', 'end_time'],
  settings: ['reminders_enabled', 'reminder_types', 'payment_accounts', 'updated_at'],
  account: ['method', 'enabled', 'account_name', 'account_number', 'qr_url'],
  payResult: ['payment', 'item_status', 'remaining', 'credit_added', 'credit_applied', 'credit_balance'],
  rejectResult: ['payment', 'credit_reversed', 'items_reopened', 'credit_balance'],
  me: ['id', 'full_name', 'email', 'phone', 'role', 'language'],
  inquiry: ['id', 'name', 'phone', 'email', 'preferred_date', 'message', 'status', 'scheduled_at', 'schedule_note', 'created_at', 'updated_at'],
  tenancy: ['id', 'renter', 'bed', 'move_in', 'move_out', 'is_active'],
};

function hasKeys(obj: unknown, keys: string[]) {
  expect(obj).toBeTypeOf('object');
  for (const key of keys) expect(obj, `missing "${key}"`).toHaveProperty(key);
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${AUTH}/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: MOCK_PASSWORD }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

let adminToken = '';
let anaToken = '';
let benToken = '';

beforeEach(async () => {
  // setup.ts resets the mock db after each test, which also clears the tokens.
  [adminToken, anaToken, benToken] = await Promise.all([login('admin@irent.test'), login('ana@irent.test'), login('ben@irent.test')]);
});

async function call(method: string, path: string, options: { token?: string; json?: unknown; form?: FormData | Promise<FormData> } = {}) {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = await options.form;
  }
  const res = await fetch(`${API}${path}`, { method, headers, body });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const form = (fields: Record<string, string | File>) => nodeFormData(fields);
const png = (bytes = 2048) => nodeFile(bytes, 'proof.png', 'image/png');

describe('Supabase Auth mocks', () => {
  it('rejects a wrong password like Supabase does', async () => {
    const res = await fetch(`${AUTH}/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ana@irent.test', password: 'nope' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error_code: 'invalid_credentials' });
  });
});

describe('Public endpoints', () => {
  it('GET /health → { ok: true }', async () => {
    expect(await call('GET', '/health')).toEqual({ status: 200, body: { ok: true } });
  });

  it('GET /beds/available → grouped vacant beds (seed: 1 lower, 1 upper)', async () => {
    const { status, body } = await call('GET', '/beds/available');
    expect(status).toBe(200);
    expect(body).toEqual([
      { bunk_type: 'lower', monthly_rate: 4500, vacant_count: 1 },
      { bunk_type: 'upper', monthly_rate: 4000, vacant_count: 1 },
    ]);
  });

  it('POST /inquiries → 201 { id }, and 400 with field details', async () => {
    const ok = await call('POST', '/inquiries', { json: { name: 'Maria', phone: '0917 123 4567' } });
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ id: expect.any(String) });
    const bad = await call('POST', '/inquiries', { json: { name: 'M', phone: '123' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { name: expect.any(String), phone: expect.any(String) } });
  });

  it('POST /auth/forgot-password → 202 { ok: true } for known and unknown emails alike', async () => {
    const known = await call('POST', '/auth/forgot-password', { json: { email: 'ana@irent.test' } });
    const unknown = await call('POST', '/auth/forgot-password', { json: { email: 'nobody@irent.test' } });
    expect(known).toEqual({ status: 202, body: { ok: true } });
    expect(unknown).toEqual(known);
  });
});

describe('Any logged-in user', () => {
  it('GET /me → profile with the active tenancy', async () => {
    const { status, body } = await call('GET', '/me', { token: anaToken });
    expect(status).toBe(200);
    hasKeys(body, KEYS.me);
    expect(body.tenancy).toMatchObject({ id: 'ten-ana', move_in: '2026-08-05', bed: { label: 'Room A – Lower Bunk 1', room: 'Room A', bunk_type: 'lower', monthly_rate: 4500 } });
  });

  it('GET /me → tenancy: null for a moved-out renter (OQ-22)', async () => {
    const gil = await login('gil@irent.test');
    expect((await call('GET', '/me', { token: gil })).body.tenancy).toBeNull();
  });

  it('PATCH /me { language } → updated profile; an invalid language → 400', async () => {
    const ok = await call('PATCH', '/me', { token: anaToken, json: { language: 'fil' } });
    expect(ok.status).toBe(200);
    expect(ok.body.language).toBe('fil');
    expect((await call('PATCH', '/me', { token: anaToken, json: { language: 'xx' } })).status).toBe(400);
  });
});

describe('Renter endpoints', () => {
  it('GET /me/charges and /me/bills → ChargeRow[] / ShareRow[] without admin fields', async () => {
    const charges = await call('GET', '/me/charges', { token: benToken });
    expect(charges.status).toBe(200);
    expect(charges.body.length).toBeGreaterThan(0);
    for (const row of charges.body) {
      hasKeys(row, KEYS.chargeRow);
      hasKeys(row.item, KEYS.item);
      expect(row).not.toHaveProperty('renter');
    }
    const partial = charges.body.find((r: { id: string }) => r.id === 'chg-ben-2026-09');
    expect(partial).toMatchObject({ amount: 4000, paid_total: 1500, remaining: 2500, status: 'partial' });

    const bills = await call('GET', '/me/bills', { token: benToken });
    expect(bills.status).toBe(200);
    hasKeys(bills.body[0], [...KEYS.chargeRow, 'bill_id']);
    expect(bills.body[0].item).toMatchObject({ type: 'bill_share', bill_type: 'electricity', period: '2026-09-01' });
  });

  it('GET /me/balance → { outstanding, next_due_date, status, credit_balance } (BR-4)', async () => {
    const ana = await call('GET', '/me/balance', { token: anaToken });
    expect(ana).toEqual({ status: 200, body: { outstanding: 0, next_due_date: null, status: 'paid', credit_balance: 500 } });
    const hana = await login('hana@irent.test');
    const owes = await call('GET', '/me/balance', { token: hana });
    // ₱4,000 reopened by the rejection + ₱250 owed from the negative credit.
    expect(owes.body).toMatchObject({ outstanding: 4250, credit_balance: -250, status: 'overdue' });
  });

  it('GET /me/credit → { balance, entries[] } newest first, with item objects (D-12)', async () => {
    const { status, body } = await call('GET', '/me/credit', { token: anaToken });
    expect(status).toBe(200);
    expect(body.balance).toBe(500);
    body.entries.forEach((e: unknown) => hasKeys(e, KEYS.ledgerEntry));
    expect(body.entries.map((e: { entry_type: string; amount: number }) => [e.entry_type, e.amount])).toEqual([
      ['application', -300],
      ['overpayment', 800],
    ]);
    expect(body.entries[0].item).toMatchObject({ type: 'bill_share', bill_type: 'electricity' });
  });

  it('GET /me/payments → Payment[] newest first, including credit rows', async () => {
    const { status, body } = await call('GET', '/me/payments', { token: anaToken });
    expect(status).toBe(200);
    body.forEach((p: unknown) => hasKeys(p, KEYS.payment));
    expect(body[0]).toMatchObject({ method: 'credit', amount: 300, reference_no: null, has_proof: false });
    expect(body.find((p: { id: string }) => p.id === 'pay-ana-2')).toMatchObject({ amount: 5300, applied_amount: 4500, credit_amount: 800, source: 'renter' });
    // D-27 (R77): source is derived from who submitted it.
    expect(body.find((p: { id: string }) => p.id === 'pay-ana-0')).toMatchObject({ verification: 'rejected', source: 'renter', reviewed_at: expect.any(String) });
    expect(body.find((p: { id: string }) => p.id === 'pay-ana-3')).toMatchObject({ source: 'admin' });
    expect(body[0]).not.toHaveProperty('credit_already_used');
  });

  it('GET /me/payments/:id/proof → { url }; another renter\'s payment → 404 (SC-11)', async () => {
    const own = await call('GET', '/me/payments/pay-ana-2/proof', { token: anaToken });
    expect(own.status).toBe(200);
    expect(own.body.url).toEqual(expect.any(String));
    const other = await call('GET', '/me/payments/pay-ben-2/proof', { token: anaToken });
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('NOT_FOUND');
  });

  it('POST /me/payments (multipart) → 201 PayResult; the excess becomes credit and pays the open share (SC-59)', async () => {
    const res = await call('POST', '/me/payments', {
      token: benToken,
      form: form({ item_type: 'charge', item_id: 'chg-ben-2026-09', method: 'gcash', amount: '3000', reference_no: 'GC 7777 0001', proof: png() }),
    });
    expect(res.status).toBe(201);
    hasKeys(res.body, KEYS.payResult);
    hasKeys(res.body.payment, KEYS.payment);
    expect(res.body).toMatchObject({
      item_status: 'paid',
      remaining: 0,
      credit_added: 500,
      credit_applied: [{ item: { type: 'bill_share', id: 'shr-ben-elec-09', bill_type: 'electricity' }, amount: 300 }],
      credit_balance: 200,
    });
    expect(res.body.payment).toMatchObject({ verification: 'auto_verified', applied_amount: 2500, credit_amount: 500 });
  });

  it('POST /me/payments error codes: 409 duplicate / already paid, 413, 400 file type, 404 other renter\'s item', async () => {
    const base = { item_type: 'charge', item_id: 'chg-ben-2026-09', method: 'maya', amount: '100', reference_no: 'MY-3003-2026' };
    const dup = await call('POST', '/me/payments', { token: benToken, form: form({ ...base, reference_no: ' my-3003-2026 ', proof: png() }) });
    expect([dup.status, dup.body.error.code]).toEqual([409, 'DUPLICATE_REFERENCE']);

    const paid = await call('POST', '/me/payments', { token: anaToken, form: form({ ...base, item_id: 'chg-ana-2026-08', reference_no: 'NEW-REF-1', proof: png() }) });
    expect([paid.status, paid.body.error.code]).toEqual([409, 'ITEM_ALREADY_PAID']);

    const big = await call('POST', '/me/payments', { token: benToken, form: form({ ...base, reference_no: 'NEW-REF-2', proof: png(5 * 1024 * 1024 + 1) }) });
    expect([big.status, big.body.error.code]).toEqual([413, 'FILE_TOO_LARGE']);

    const heic = await call('POST', '/me/payments', {
      token: benToken,
      form: form({ ...base, reference_no: 'NEW-REF-3', proof: nodeFile(10, 'a.heic', 'image/heic') }),
    });
    expect([heic.status, heic.body.error.code]).toEqual([400, 'INVALID_FILE_TYPE']);

    const tampered = await call('POST', '/me/payments', { token: anaToken, form: form({ ...base, reference_no: 'NEW-REF-4', proof: png() }) });
    expect([tampered.status, tampered.body.error.code]).toEqual([404, 'NOT_FOUND']);
  });

  it('GET /me/payment-accounts → enabled accounts only', async () => {
    const { status, body } = await call('GET', '/me/payment-accounts', { token: anaToken });
    expect(status).toBe(200);
    expect(body.map((a: { method: string }) => a.method)).toEqual(['gcash', 'maya', 'bpi']);
    body.forEach((a: unknown) => hasKeys(a, KEYS.account));
  });

  it('GET /me/announcements → pinned, urgent, newest; unread_count; POST read is idempotent (R18)', async () => {
    const feed = await call('GET', '/me/announcements', { token: anaToken });
    expect(feed.status).toBe(200);
    // BR-17: the scheduled ann-5 and the ended maintenance notice ann-6 are left out; the current notice ann-4 is in.
    expect(feed.body.items.map((a: { id: string }) => a.id)).toEqual(['ann-1', 'ann-2', 'ann-4', 'ann-3', 'ann-14']);
    feed.body.items.forEach((a: unknown) => hasKeys(a, [...KEYS.announcement, 'is_read']));
    expect(feed.body.items[0]).not.toHaveProperty('publish_at');
    expect(feed.body.items[2]).toMatchObject({ kind: 'maintenance', start_time: '09:00', end_time: '17:00' });
    expect(feed.body.unread_count).toBe(4);

    expect((await call('POST', '/me/announcements/ann-1/read', { token: anaToken })).status).toBe(204);
    expect((await call('POST', '/me/announcements/ann-1/read', { token: anaToken })).status).toBe(204);
    expect((await call('GET', '/me/announcements', { token: anaToken })).body.unread_count).toBe(3);
    expect((await call('POST', '/me/announcements/nope/read', { token: anaToken })).status).toBe(404);
    expect((await call('POST', '/me/announcements/ann-5/read', { token: anaToken })).status).toBe(404); // scheduled
    expect((await call('POST', '/me/announcements/ann-6/read', { token: anaToken })).status).toBe(404); // ended
  });

  it('E63: a maintenance notice ending today is visible all day and gone from 00:00 Manila the next day', async () => {
    const { db } = await import('./db');
    const endsOn = db.announcements.find((a) => a.id === 'ann-4')!.ends_on!;
    const ids = async () => (await call('GET', '/me/announcements', { token: anaToken })).body.items.map((a: { id: string }) => a.id);
    db.today = () => endsOn;
    expect(await ids()).toContain('ann-4');
    db.today = () => addDays(endsOn, 1);
    expect(await ids()).not.toContain('ann-4');
  });
});

describe('Maintenance requests (D-26, R74, R75, BR-19)', () => {
  const MR = ['id', 'category', 'urgency', 'description', 'status', 'admin_note', 'decline_reason', 'photo_count', 'created_at', 'status_changed_at', 'updated_at'];
  const jpg = (bytes = 2048, name = 'leak.jpg', type = 'image/jpeg') => nodeFile(bytes, name, type);
  const request = (fields: Record<string, string>, photos: File[] = []) => {
    const body = nodeFormData(fields);
    photos.forEach((p) => body.append('photos', p));
    return body;
  };
  const valid = { category: 'plumbing', urgency: 'urgent', description: 'The sink in Room A leaks under the cabinet.' };

  it('renter: list own newest first, create with photos (admin email), validation, 409 moved out, 429 after 5 in 24 h, own photos only (SC-90)', async () => {
    const own = await call('GET', '/me/maintenance-requests', { token: anaToken });
    own.body.forEach((m: unknown) => hasKeys(m, MR));
    expect(own.body.map((m: { id: string }) => m.id)).toEqual(['mr-1', 'mr-2', 'mr-4', 'mr-3']);
    expect(own.body[0]).not.toHaveProperty('renter');

    const created = await call('POST', '/me/maintenance-requests', { token: anaToken, form: request(valid, [jpg(), jpg(2048, 'cabinet.png', 'image/png')]) });
    expect(created).toMatchObject({ status: 201, body: { status: 'submitted', photo_count: 2 } });
    const { db } = await import('./db');
    expect(db.outbox.at(-1)).toMatchObject({ to: 'admin@irent.test', subject: '[Admin] iRent: New maintenance request: Plumbing (Urgent)' });

    expect((await call('POST', '/me/maintenance-requests', { token: anaToken, form: request({ ...valid, description: 'Leak' }) })).body.error.details).toHaveProperty('description');
    expect((await call('POST', '/me/maintenance-requests', { token: anaToken, form: request(valid, [jpg(), jpg(), jpg(), jpg()]) })).body.error.details).toHaveProperty('photos');
    expect((await call('POST', '/me/maintenance-requests', { token: anaToken, form: request(valid, [jpg(2048, 'a.heic', 'image/heic')]) })).body.error.code).toBe('INVALID_FILE_TYPE');
    expect((await call('POST', '/me/maintenance-requests', { token: anaToken, form: request(valid, [jpg(6 * 1024 * 1024)]) })).status).toBe(413);

    // Up to 5 in 24 h (mr-1 counts only if it is less than 24 h old), then 429.
    const recent = db.maintenance.filter((m) => m.renter_id === 'usr-ana' && Date.parse(m.created_at) > Date.now() - 86_400_000).length;
    for (let i = recent; i < 5; i++) expect((await call('POST', '/me/maintenance-requests', { token: anaToken, form: request(valid) })).status).toBe(201);
    const limited = await call('POST', '/me/maintenance-requests', { token: anaToken, form: request(valid) });
    expect([limited.status, limited.body.error.code]).toEqual([429, 'RATE_LIMITED']);

    const gil = await login('gil@irent.test');
    expect((await call('GET', '/me/maintenance-requests', { token: gil })).body.map((m: { id: string }) => m.id)).toEqual(['mr-6']);
    expect((await call('POST', '/me/maintenance-requests', { token: gil, form: request(valid) })).body.error.code).toBe('NO_ACTIVE_TENANCY');

    expect((await call('GET', '/me/maintenance-requests/mr-1/photos', { token: anaToken })).body.urls).toHaveLength(2);
    expect((await call('GET', '/me/maintenance-requests/mr-1/photos', { token: benToken })).status).toBe(404);
    expect((await call('GET', '/maintenance-requests', { token: anaToken })).status).toBe(403);
  });

  it('admin: R75 order and filters, BR-19 transitions (409), decline needs a reason, renter emails, note visible to the renter (SC-91)', async () => {
    const open = await call('GET', '/maintenance-requests', { token: adminToken });
    expect(open.status).toBe(200);
    open.body.forEach((m: unknown) => hasKeys(m, [...MR, 'renter', 'bed']));
    expect((await call('GET', '/maintenance-requests?status=open', { token: adminToken })).body.map((m: { id: string }) => m.id)).toEqual(['mr-1', 'mr-5', 'mr-2']);
    expect((await call('GET', '/maintenance-requests?status=all&category=wifi', { token: adminToken })).body.map((m: { id: string }) => m.id)).toEqual(['mr-5', 'mr-4']);
    expect((await call('GET', '/maintenance-requests/mr-1/photos', { token: adminToken })).body.urls).toHaveLength(2);

    const started = await call('PATCH', '/maintenance-requests/mr-1', { token: adminToken, json: { status: 'in_progress', admin_note: 'Plumber on Thursday' } });
    expect(started.body).toMatchObject({ status: 'in_progress', admin_note: 'Plumber on Thursday', renter: { full_name: 'Ana Cruz' } });
    expect((await call('GET', '/dashboard', { token: adminToken })).body.new_maintenance).toBe(1);
    expect((await call('GET', '/me/maintenance-requests', { token: anaToken })).body[0]).toMatchObject({ admin_note: 'Plumber on Thursday' });

    expect((await call('PATCH', '/maintenance-requests/mr-1', { token: adminToken, json: { status: 'done' } })).body.status).toBe('done');
    const { db } = await import('./db');
    expect(db.outbox.at(-1)).toMatchObject({ to: 'ana@irent.test', subject: 'iRent: Your plumbing request is done' });
    expect((await call('PATCH', '/maintenance-requests/mr-1', { token: adminToken, json: { status: 'in_progress' } })).body.error.code).toBe('INVALID_STATUS_CHANGE');

    expect((await call('PATCH', '/maintenance-requests/mr-5', { token: adminToken, json: { status: 'declined' } })).body.error.details).toHaveProperty('decline_reason');
    const declined = await call('PATCH', '/maintenance-requests/mr-5', { token: adminToken, json: { status: 'declined', decline_reason: 'Wi-Fi provider outage' } });
    expect(declined.body).toMatchObject({ status: 'declined', decline_reason: 'Wi-Fi provider outage' });
    expect(db.outbox.at(-1)).toMatchObject({ to: 'ben@irent.test', template: 'maintenance_declined' });
  });
});

describe('Admin endpoints', () => {
  it('GET /dashboard → the documented shape', async () => {
    const { status, body } = await call('GET', '/dashboard', { token: adminToken });
    expect(status).toBe(200);
    expect(body).toEqual({
      beds: { occupied: 6, total: 8 },
      month: { collected: expect.any(Number), outstanding: expect.any(Number) },
      new_inquiries: 2,
      payments_to_review: 2,
      new_maintenance: 2,
    });
  });

  it('beds: GET, POST (multipart), PATCH, DELETE with BED_HAS_HISTORY and BED_OCCUPIED', async () => {
    const list = await call('GET', '/beds', { token: adminToken });
    expect(list.status).toBe(200);
    list.body.forEach((b: unknown) => hasKeys(b, KEYS.bed));
    expect(list.body[0]).toMatchObject({ current_renter: { id: 'usr-ana', full_name: 'Ana Cruz' }, has_history: true });

    const created = await call('POST', '/beds', { token: adminToken, form: form({ label: 'Room 3 – Lower', room: 'Room 3', bunk_type: 'lower', monthly_rate: '4500', status: 'vacant' }) });
    expect(created.status).toBe(201);
    hasKeys(created.body, KEYS.bed);

    const dupLabel = await call('POST', '/beds', { token: adminToken, form: form({ label: 'Room 3 – Lower', room: 'Room 3', bunk_type: 'lower', monthly_rate: '4500', status: 'vacant' }) });
    expect(dupLabel.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { label: expect.any(String) } });

    const patched = await call('PATCH', `/beds/${created.body.id}`, { token: adminToken, form: form({ status: 'reserved' }) });
    expect([patched.status, patched.body.status]).toEqual([200, 'reserved']);
    const occupied = await call('PATCH', '/beds/bed-1', { token: adminToken, form: form({ status: 'vacant' }) });
    expect([occupied.status, occupied.body.error.code]).toEqual([409, 'BED_OCCUPIED']);

    expect((await call('DELETE', '/beds/bed-4', { token: adminToken })).body.error.code).toBe('BED_HAS_HISTORY');
    expect((await call('DELETE', `/beds/${created.body.id}`, { token: adminToken })).status).toBe(204);
  });

  it('renters: GET with search, credit and refund-due fields', async () => {
    const all = await call('GET', '/renters', { token: adminToken });
    expect(all.status).toBe(200);
    all.body.forEach((r: unknown) => hasKeys(r, KEYS.renterRow));
    const byName = Object.fromEntries(all.body.map((r: { full_name: string }) => [r.full_name.split(' ')[0], r]));
    expect(byName.Ana).toMatchObject({ credit_balance: 500, outstanding: 0, status: 'active', tenancy: { due_day: 5 } });
    expect(byName.Cara).toMatchObject({ invite_pending: true });
    expect(byName.Gil).toMatchObject({ status: 'moved_out', tenancy: null, refund_due: 400, last_tenancy_id: 'ten-gil' });
    expect(byName.Hana).toMatchObject({ credit_balance: -250, refund_due: 0 });

    const search = await call('GET', '/renters?search=ana', { token: adminToken });
    expect(search.body.map((r: { full_name: string }) => r.full_name)).toEqual(['Ana Cruz', 'Hana Villanueva']);
  });

  it('POST /renters → 201 { renter, invite_sent }; EMAIL_EXISTS and BED_TAKEN', async () => {
    const input = { full_name: 'Dan Reyes', email: 'dan@irent.test', phone: '0917 222 3333', language: 'fil', bed_id: 'bed-5', move_in: new Date().toISOString().slice(0, 10), deposit: 4000 };
    const ok = await call('POST', '/renters', { token: adminToken, json: input });
    expect(ok.status).toBe(201);
    hasKeys(ok.body.renter, KEYS.renterRow);
    expect(ok.body).toMatchObject({ invite_sent: true, renter: { invite_pending: true, status: 'active' } });

    expect((await call('POST', '/renters', { token: adminToken, json: { ...input, bed_id: 'bed-5' } })).body.error.code).toBe('EMAIL_EXISTS');
    expect((await call('POST', '/renters', { token: adminToken, json: { ...input, email: 'eve@irent.test' } })).body.error.code).toBe('BED_TAKEN');
    const failedInvite = await call('POST', '/renters', { token: adminToken, json: { ...input, email: 'invitefail@irent.test', bed_id: 'bed-8' } });
    expect(failedInvite.body.invite_sent).toBe(false);
  });

  it('PATCH /renters/:id, resend-invite (202 / 409 ALREADY_ACTIVATED)', async () => {
    const patched = await call('PATCH', '/renters/usr-ana', { token: adminToken, json: { phone: '0917 999 8888' } });
    expect([patched.status, patched.body.phone]).toEqual([200, '09179998888']);
    expect((await call('PATCH', '/renters/usr-ana', { token: adminToken, json: { email: 'x@y.z' } })).status).toBe(400);

    expect(await call('POST', '/renters/usr-cara/resend-invite', { token: adminToken })).toEqual({ status: 202, body: { ok: true } });
    const activated = await call('POST', '/renters/usr-ana/resend-invite', { token: adminToken });
    expect([activated.status, activated.body.error.code]).toEqual([409, 'ALREADY_ACTIVATED']);
  });

  it('GET /renters/:id/credit and POST refunds (REFUND_EXCEEDS_CREDIT with the balance in the message)', async () => {
    const ledger = await call('GET', '/renters/usr-gil/credit', { token: adminToken });
    expect(ledger.body).toMatchObject({ balance: 400, entries: [{ entry_type: 'overpayment', amount: 400 }] });

    const tooMuch = await call('POST', '/renters/usr-gil/refunds', { token: adminToken, json: { amount: 500, method: 'cash', refunded_at: '2026-09-20' } });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error).toMatchObject({ code: 'REFUND_EXCEEDS_CREDIT', message: expect.stringContaining('400.00') });

    const refund = await call('POST', '/renters/usr-gil/refunds', { token: adminToken, json: { amount: 400, method: 'gcash', reference_no: 'GC-RF-1', refunded_at: '2026-09-20' } });
    expect(refund.status).toBe(201);
    expect(refund.body).toMatchObject({ entry_type: 'refund', amount: -400, refund_method: 'gcash' });
    expect((await call('GET', '/renters/usr-gil/credit', { token: adminToken })).body.balance).toBe(0);
  });

  it('tenancies: assign bed, move-out preview and move-out, active list (BR-5 order)', async () => {
    const assign = await call('POST', '/tenancies', { token: adminToken, json: { renter_id: 'usr-gil', bed_id: 'bed-5', move_in: '2026-10-01' } });
    expect(assign.status).toBe(201);
    hasKeys(assign.body, KEYS.tenancy);
    expect((await call('POST', '/tenancies', { token: adminToken, json: { renter_id: 'usr-gil', bed_id: 'bed-6', move_in: '2026-10-01' } })).body.error.code).toBe('RENTER_HAS_ACTIVE_TENANCY');
    expect((await call('POST', '/tenancies', { token: adminToken, json: { renter_id: 'usr-hana', bed_id: 'bed-1', move_in: '2026-10-01' } })).body.error.code).toBe('BED_TAKEN');

    const preview = await call('GET', '/tenancies/ten-ana/move-out-preview', { token: adminToken });
    expect(preview).toEqual({ status: 200, body: { credit_balance: 500, would_apply: 0, refund_due: 500 } });
    expect((await call('POST', '/tenancies/ten-ana/move-out', { token: adminToken, json: { move_out: '2026-08-01' } })).body.error.code).toBe('MOVE_OUT_BEFORE_MOVE_IN');
    expect((await call('POST', '/tenancies/ten-ana/move-out', { token: adminToken, json: { move_out: '2999-01-01' } })).body.error.code).toBe('MOVE_OUT_IN_FUTURE');
    const moved = await call('POST', '/tenancies/ten-ana/move-out', { token: adminToken, json: { move_out: '2026-09-30' } });
    expect(moved).toEqual({ status: 200, body: { credit_applied: 0, refund_due: 500 } });

    const active = await call('GET', '/tenancies?active=true', { token: adminToken });
    expect(active.body.map((t: { id: string }) => t.id)).toEqual(['ten-jomar', 'ten-ben', 'ten-cara', 'ten-marifel', 'ten-elena', assign.body.id]);
  });

  it('rent charges: list with filters, generate (idempotent), edit, delete', async () => {
    const list = await call('GET', '/rent-charges?period=2026-09-01&status=all', { token: adminToken });
    expect(list.status).toBe(200);
    list.body.forEach((r: unknown) => hasKeys(r, [...KEYS.chargeRow, 'renter', 'bed']));
    const partial = await call('GET', '/rent-charges?period=2026-09-01&status=partial', { token: adminToken });
    expect(partial.body.map((r: { id: string }) => r.id)).toEqual(['chg-ben-2026-09']);

    const gen = await call('POST', '/rent-charges/generate', { token: adminToken, json: { period: '2026-10-01' } });
    expect(gen.status).toBe(200);
    // ana's ₱500 credit is applied to her new October charge (SC-60).
    expect(gen.body).toEqual({ created: 6, skipped_existing: 0, skipped_not_moved_in: 0, credit_applied_total: 500 });
    expect((await call('POST', '/rent-charges/generate', { token: adminToken, json: { period: '2026-10-01' } })).body).toMatchObject({ created: 0, skipped_existing: 6 });

    const below = await call('PATCH', '/rent-charges/chg-ben-2026-09', { token: adminToken, json: { amount: 1000 } });
    expect([below.status, below.body.error.code]).toEqual([400, 'AMOUNT_BELOW_PAID']);
    const edited = await call('PATCH', '/rent-charges/chg-cara-2026-09', { token: adminToken, json: { amount: 4200, due_date: '2026-09-03' } });
    expect(edited.body).toMatchObject({ amount: 4200, due_date: '2026-09-03' });

    expect((await call('DELETE', '/rent-charges/chg-ben-2026-09', { token: adminToken })).body.error.code).toBe('CHARGE_HAS_PAYMENTS');
    expect((await call('DELETE', '/rent-charges/chg-cara-2026-09', { token: adminToken })).status).toBe(204);
  });

  it('payments: review list (oldest first, excess and already-used credit), record, proof', async () => {
    const list = await call('GET', '/payments?verification=auto_verified', { token: adminToken });
    expect(list.status).toBe(200);
    list.body.forEach((p: unknown) => hasKeys(p, [...KEYS.payment, 'renter', 'credit_already_used']));
    expect(list.body.map((p: { id: string }) => p.id)).toEqual(['pay-ana-2', 'pay-ben-2']);
    expect(list.body[0]).toMatchObject({ credit_amount: 800, credit_already_used: 300 });

    const recorded = await call('POST', '/payments', {
      token: adminToken,
      form: form({ item_type: 'charge', item_id: 'chg-cara-2026-09', method: 'cash', amount: '2000', paid_at: '2026-09-20' }),
    });
    expect(recorded.status).toBe(201);
    expect(recorded.body).toMatchObject({ item_status: 'partial', remaining: 2500, payment: { verification: 'confirmed', reference_no: null } });
    const noRef = await call('POST', '/payments', { token: adminToken, form: form({ item_type: 'charge', item_id: 'chg-cara-2026-09', method: 'gcash', amount: '100', paid_at: '2026-09-20' }) });
    expect(noRef.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { reference_no: expect.any(String) } });

    expect((await call('GET', '/payments/pay-ben-2/proof', { token: adminToken })).body.url).toEqual(expect.any(String));
  });

  it('PATCH /payments/:id/review: confirm; reject returns RejectResult and unwinds credit (SC-62); 409 and 400 NOT_REVIEWABLE', async () => {
    const confirmed = await call('PATCH', '/payments/pay-ben-2/review', { token: adminToken, json: { action: 'confirm' } });
    expect([confirmed.status, confirmed.body.verification]).toEqual([200, 'confirmed']);
    expect((await call('PATCH', '/payments/pay-ben-2/review', { token: adminToken, json: { action: 'confirm' } })).body.error.code).toBe('ALREADY_REVIEWED');
    expect((await call('PATCH', '/payments/pay-ana-3/review', { token: adminToken, json: { action: 'confirm' } })).body.error.code).toBe('NOT_REVIEWABLE');
    expect((await call('PATCH', '/payments/pay-ana-2/review', { token: adminToken, json: { action: 'reject' } })).status).toBe(400);

    const rejected = await call('PATCH', '/payments/pay-ana-2/review', { token: adminToken, json: { action: 'reject', reason: 'Not in our GCash history' } });
    expect(rejected.status).toBe(200);
    hasKeys(rejected.body, KEYS.rejectResult);
    expect(rejected.body.credit_reversed).toBe(800);
    expect(rejected.body.credit_balance).toBe(0);
    expect(rejected.body.items_reopened.map((r: { item: { id: string } }) => r.item.id).sort()).toEqual(['chg-ana-2026-09', 'shr-ana-elec-09']);
  });

  it('bills: equal split with BR-5 order, custom shares, SHARES_SUM_MISMATCH, edit shares', async () => {
    const created = await call('POST', '/bills', { token: adminToken, json: { type: 'water', period: '2026-09-01', total_amount: 1000, due_date: '2026-10-10' } });
    expect(created.status).toBe(201);
    hasKeys(created.body, KEYS.bill);
    // BR-5 order (move-in, then id): the first 4 shares get the leftover centavos; ana's credit pays her share at once (BR-10).
    expect(created.body.shares.map((s: { renter: { full_name: string }; amount: number }) => [s.renter.full_name, s.amount])).toEqual([
      ['Jomar Bautista', 166.67],
      ['Ben Dela Rosa', 166.67],
      ['Ana Cruz', 166.67],
      ['Cara Mendoza', 166.67],
      ['Marifel Garcia', 166.66],
      ['Elena Soriano', 166.66],
    ]);
    expect(created.body.shares[2]).toMatchObject({ status: 'paid', paid_from_credit: 166.67 });

    const mismatch = await call('POST', '/bills', { token: adminToken, json: { type: 'water', period: '2026-09-01', total_amount: 900, due_date: '2026-10-10', shares: [{ tenancy_id: 'ten-ben', amount: 100 }] } });
    expect(mismatch.body.error.code).toBe('SHARES_SUM_MISMATCH');

    const shares = created.body.shares.map((s: { id: string }) => s.id);
    const edited = await call('PUT', `/bills/${created.body.id}/shares`, { token: adminToken, json: { shares: [{ id: shares[0], amount: 200 }, { id: shares[1], amount: 133.34 }] } });
    expect(edited.status).toBe(200);
    const below = await call('PUT', `/bills/${created.body.id}/shares`, { token: adminToken, json: { shares: [{ id: shares[2], amount: 100 }, { id: shares[3], amount: 233.34 }] } });
    expect(below.body.error.code).toBe('AMOUNT_BELOW_PAID');

    const list = await call('GET', '/bills', { token: adminToken });
    expect(list.body[0].type).toBe('water');
  });

  it('inquiries: GET newest first with status filter, PATCH status', async () => {
    const list = await call('GET', '/inquiries', { token: adminToken });
    list.body.forEach((i: unknown) => hasKeys(i, KEYS.inquiry));
    expect(list.body.map((i: { id: string }) => i.id)).toEqual(['inq-1', 'inq-2', 'inq-3', 'inq-4', 'inq-5']);
    expect((await call('GET', '/inquiries?status=contacted', { token: adminToken })).body).toHaveLength(1);
    const patched = await call('PATCH', '/inquiries/inq-1', { token: adminToken, json: { status: 'scheduled' } });
    expect(patched.body.status).toBe('scheduled');
    expect((await call('PATCH', '/inquiries/inq-1', { token: adminToken, json: { status: 'lost' } })).status).toBe(400);
  });

  it('viewings: schedule, reschedule, cancel with emails to visitor (if any) and admin; validation; reminder job', async () => {
    const { db, sendViewingReminders } = await import('./db');
    db.today = () => '2026-10-15';
    db.outbox = [];
    db.inquiries = db.inquiries.filter((i) => !i.scheduled_at); // the seeded viewings move with the real clock
    // inq-1 has an email: confirmation to both.
    const s1 = await call('PATCH', '/inquiries/inq-1/schedule', { token: adminToken, json: { scheduled_at: '2026-10-18T10:00:00+08:00', note: 'Bring an ID' } });
    expect(s1.status).toBe(200);
    expect(s1.body).toMatchObject({ inquiry: { status: 'scheduled', scheduled_at: '2026-10-18T10:00:00+08:00', schedule_note: 'Bring an ID' }, notified: { visitor: true, admin: true } });
    expect(db.outbox.map((m) => [m.to, m.template])).toEqual([
      ['maria@example.com', 'viewing_confirmation'],
      ['admin@irent.test', 'viewing_confirmation'],
    ]);
    // Reschedule → reschedule template.
    await call('PATCH', '/inquiries/inq-1/schedule', { token: adminToken, json: { scheduled_at: '2026-10-19T14:30:00+08:00' } });
    expect(db.outbox.slice(2).map((m) => m.template)).toEqual(['viewing_reschedule', 'viewing_reschedule']);
    // inq-2 has no email: admin only.
    const s2 = await call('PATCH', '/inquiries/inq-2/schedule', { token: adminToken, json: { scheduled_at: '2026-10-16T09:00:00+08:00' } });
    expect(s2.body.notified).toEqual({ visitor: false, admin: true, visitor_skipped: 'no_email' });
    expect(s2.body.inquiry).not.toHaveProperty('visitor_emails_sent');
    expect(db.outbox.at(-1)!.to).toBe('admin@irent.test');
    expect(db.outbox.filter((m) => m.inquiry_id === 'inq-2')).toHaveLength(1);

    // Reminder job: tomorrow's viewings (inq-2 on Oct 16), once.
    expect(sendViewingReminders(db)).toBe(1);
    expect(sendViewingReminders(db)).toBe(0);
    expect(db.outbox.at(-1)).toMatchObject({ to: 'admin@irent.test', template: 'viewing_reminder' });

    // Validation: past date, off-slot time, missing offset.
    for (const scheduled_at of ['2026-10-14T10:00:00+08:00', '2026-10-18T10:15:00+08:00', '2026-10-18T20:00:00+08:00', '2026-10-18T10:00:00Z']) {
      expect((await call('PATCH', '/inquiries/inq-1/schedule', { token: adminToken, json: { scheduled_at } })).status).toBe(400);
    }

    // Cancel → back to contacted, cancellation to both; a second cancel is a 409.
    const c = await call('DELETE', '/inquiries/inq-1/schedule', { token: adminToken });
    expect(c.body).toMatchObject({ inquiry: { status: 'contacted', scheduled_at: null }, notified: { visitor: true, admin: true } });
    expect(db.outbox.slice(-2).map((m) => m.template)).toEqual(['viewing_cancellation', 'viewing_cancellation']);
    expect((await call('DELETE', '/inquiries/inq-1/schedule', { token: adminToken })).body.error.code).toBe('NOT_SCHEDULED');
    expect((await call('PATCH', '/inquiries/inq-1/schedule', { token: anaToken, json: { scheduled_at: '2026-10-18T10:00:00+08:00' } })).status).toBe(403);
  });

  it('R69 cap: at most 6 visitor emails per inquiry, then admin only with visitor_skipped "cap"', async () => {
    const { db } = await import('./db');
    db.today = () => '2026-10-15';
    db.outbox = [];
    const results = [];
    for (let n = 0; n < 4; n++) {
      results.push((await call('PATCH', '/inquiries/inq-1/schedule', { token: adminToken, json: { scheduled_at: `2026-10-2${n}T10:00:00+08:00` } })).body.notified);
      results.push((await call('DELETE', '/inquiries/inq-1/schedule', { token: adminToken })).body.notified);
    }
    expect(results.slice(0, 6).every((r) => r.visitor)).toBe(true);
    expect(results.slice(6)).toEqual([
      { visitor: false, admin: true, visitor_skipped: 'cap' },
      { visitor: false, admin: true, visitor_skipped: 'cap' },
    ]);
    expect(db.outbox.filter((m) => m.to === 'maria@example.com')).toHaveLength(6);
    expect(db.outbox.filter((m) => m.to === 'admin@irent.test')).toHaveLength(8);
  });

  it('announcements: GET, POST, PATCH (multipart), DELETE', async () => {
    const list = await call('GET', '/announcements', { token: adminToken });
    list.body.forEach((a: unknown) => hasKeys(a, [...KEYS.announcement, 'publish_at', 'status', 'email_pending']));
    expect(list.body[0]).not.toHaveProperty('is_read');
    const statusOf = (id: string) => list.body.find((a: { id: string }) => a.id === id).status;
    expect([statusOf('ann-1'), statusOf('ann-4'), statusOf('ann-5'), statusOf('ann-6')]).toEqual(['published', 'published', 'scheduled', 'ended']);

    const created = await call('POST', '/announcements', { token: adminToken, form: form({ title: 'Pest control', body: '<b>Friday</b> 9 AM', priority: 'urgent', pinned: 'false', send_email: 'true' }) });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ priority: 'urgent', body: '<b>Friday</b> 9 AM', emailed_at: expect.any(String) });
    const tooLong = await call('POST', '/announcements', { token: adminToken, form: form({ title: 'x'.repeat(121), body: 'b', priority: 'normal', pinned: 'false', send_email: 'false' }) });
    expect(tooLong.body.error.details).toHaveProperty('title');

    const patched = await call('PATCH', `/announcements/${created.body.id}`, { token: adminToken, form: form({ title: 'Pest control (moved)', body: 'Saturday', priority: 'normal', pinned: 'true', send_email: 'false' }) });
    expect(patched.body).toMatchObject({ title: 'Pest control (moved)', pinned: true });
    expect((await call('DELETE', `/announcements/${created.body.id}`, { token: adminToken })).status).toBe(204);
  });

  it('announcements D-30: PUT /announcements/order (exact set, pinned first), new and newly pinned posts on top of their group, renter feed follows', async () => {
    const ids = (await call('GET', '/announcements', { token: adminToken })).body.map((a: { id: string; position: number }) => a.id);
    expect(ids.slice(0, 2)).toEqual(['ann-1', 'ann-2']);
    const order = (body: { id: string }[]) => body.map((a) => a.id);

    expect((await call('PUT', '/announcements/order', { token: adminToken, json: { ids: ids.slice(1) } })).status).toBe(400); // stale (E75)
    expect((await call('PUT', '/announcements/order', { token: adminToken, json: { ids: [ids[1], ids[0], ...ids.slice(2)] } })).status).toBe(400); // pinned after unpinned

    const next = ['ann-1', 'ann-4', ...ids.filter((id: string) => id !== 'ann-1' && id !== 'ann-4')];
    const saved = await call('PUT', '/announcements/order', { token: adminToken, json: { ids: next } });
    expect(order(saved.body)).toEqual(next);
    saved.body.forEach((a: unknown) => hasKeys(a, ['position']));
    // Renters: pinned, then the custom order; the urgent ann-2 is not moved ahead (D-30); hidden ones stay hidden.
    expect(order((await call('GET', '/me/announcements', { token: anaToken })).body.items)).toEqual(['ann-1', 'ann-4', 'ann-2', 'ann-3', 'ann-14']);
    expect((await call('GET', '/me/announcements', { token: anaToken })).body.items[0]).not.toHaveProperty('position');

    const base = { body: 'b', priority: 'normal', send_email: 'false' };
    const created = await call('POST', '/announcements', { token: adminToken, form: form({ ...base, title: 'E', pinned: 'false' }) });
    await call('PATCH', '/announcements/ann-2', { token: adminToken, form: form({ ...base, title: 'New gate code from Monday', priority: 'urgent', pinned: 'true' }) });
    const after = order((await call('GET', '/announcements', { token: adminToken })).body);
    expect(after.slice(0, 3)).toEqual(['ann-2', 'ann-1', created.body.id]);
  });

  it('announcements D-25: maintenance validation, scheduled publish with a pending email sent once (BR-18), publish_at locked after publishing', async () => {
    const { db, publishAnnouncements } = await import('./db');
    const base = { title: 'Water', body: 'Off', priority: 'normal', pinned: 'false' };
    const bad = await call('POST', '/announcements', { token: adminToken, form: form({ ...base, send_email: 'false', kind: 'maintenance', starts_on: '2999-01-10', start_time: '09:00' }) });
    expect(bad.body.error.details).toMatchObject({ ends_on: expect.any(String), end_time: expect.any(String) });

    const at = new Date(Date.now() + 3_600_000).toISOString();
    const scheduled = await call('POST', '/announcements', { token: adminToken, form: form({ ...base, send_email: 'true', publish_at: at }) });
    expect(scheduled.body).toMatchObject({ status: 'scheduled', email_pending: true, emailed_at: null });
    expect((await call('GET', '/me/announcements', { token: anaToken })).body.items.map((a: { id: string }) => a.id)).not.toContain(scheduled.body.id);

    const rec = db.announcements.find((a) => a.id === scheduled.body.id)!;
    rec.publish_at = new Date(Date.now() - 1000).toISOString(); // its time has come
    expect(publishAnnouncements(db)).toBe(1);
    expect(publishAnnouncements(db)).toBe(0); // the claim: never twice (E65)
    expect(rec).toMatchObject({ email_pending: false, emailed_at: expect.any(String) });

    const locked = await call('PATCH', `/announcements/${rec.id}`, { token: adminToken, form: form({ ...base, send_email: 'false', publish_at: at }) });
    expect(locked.body.error.details).toHaveProperty('publish_at');

    // E66: unticking email on a scheduled one cancels it; "" publishes it now.
    const second = await call('POST', '/announcements', { token: adminToken, form: form({ ...base, send_email: 'true', publish_at: at }) });
    const unticked = await call('PATCH', `/announcements/${second.body.id}`, { token: adminToken, form: form({ ...base, send_email: 'false' }) });
    expect(unticked.body).toMatchObject({ status: 'scheduled', email_pending: false });
    const now = await call('PATCH', `/announcements/${second.body.id}`, { token: adminToken, form: form({ ...base, send_email: 'false', publish_at: '' }) });
    expect(now.body).toMatchObject({ status: 'published', email_pending: false, emailed_at: null });
  });

  it('settings: GET and PUT (multipart); disabling every account empties /me/payment-accounts (SC-25)', async () => {
    const current = await call('GET', '/settings', { token: adminToken });
    hasKeys(current.body, KEYS.settings);
    current.body.payment_accounts.forEach((a: unknown) => hasKeys(a, KEYS.account));

    const accounts = current.body.payment_accounts.map(({ qr_url: _qr, ...a }: { qr_url: string }) => ({ ...a, enabled: false }));
    const saved = await call('PUT', '/settings', {
      token: adminToken,
      form: form({ reminders_enabled: 'false', reminder_types: JSON.stringify(['due_today']), payment_accounts: JSON.stringify(accounts) }),
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ reminders_enabled: false, reminder_types: ['due_today'] });
    expect((await call('GET', '/me/payment-accounts', { token: anaToken })).body).toEqual([]);
  });
});

describe('Proposed endpoints (dashboard design pass, mock-only)', () => {
  it('PATCH /renters/:id birthday: set, clear with null, future date → 400; absent keeps it', async () => {
    expect((await call('PATCH', '/renters/usr-ben', { token: adminToken, json: { birthday: '1999-05-06' } })).body.birthday).toBe('1999-05-06');
    expect((await call('PATCH', '/renters/usr-ben', { token: adminToken, json: { phone: '09182223333' } })).body.birthday).toBe('1999-05-06');
    expect((await call('PATCH', '/renters/usr-ben', { token: adminToken, json: { birthday: null } })).body.birthday).toBeNull();
    expect((await call('PATCH', '/renters/usr-ben', { token: adminToken, json: { birthday: '2999-01-01' } })).status).toBe(400);
  });

  it('pay toward a total needs no new rule: POST /payments on the oldest item, the excess pays the rest oldest first, then credit', async () => {
    await call('POST', '/rent-charges/generate', { token: adminToken, json: { period: '2026-10-01' } });
    const cara = async () => (await call('GET', '/renters?search=cara', { token: adminToken })).body[0];
    expect(await cara()).toMatchObject({ outstanding: 9300, unpaid_months: 2 });

    const pay = (amount: string, ref: string) =>
      call('POST', '/payments', { token: adminToken, form: form({ item_type: 'charge', item_id: 'chg-cara-2026-09', method: 'gcash', amount, reference_no: ref, paid_at: '2026-10-14' }) });
    const first = await pay('4800', 'GC 7001 2026');
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ item_status: 'paid', credit_added: 300, credit_balance: 0 });
    expect(first.body.credit_applied.map((a: { item: { type: string }; amount: number }) => [a.item.type, a.amount])).toEqual([['bill_share', 300]]);
    expect(await cara()).toMatchObject({ outstanding: 4500, unpaid_months: 1 });
  });

  it('promotions: public GET shows visible in-date promos only ([] when the section is off); admin CRUD, order, 403', async () => {
    const { db } = await import('./db');
    db.today = () => '2026-10-14';
    const active = await call('GET', '/promotions/active');
    expect(active.body.map((p: { id: string }) => p.id)).toEqual(['promo-1', 'promo-2']);
    expect(active.body[0]).not.toHaveProperty('visible');

    expect((await call('GET', '/promotions', { token: anaToken })).status).toBe(403);
    const created = await call('POST', '/promotions', { token: adminToken, form: form({ title: 'Locker', cta_action: 'none', visible: 'true', image_url: '/images/demo/room-5-1200.webp' }) });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ position: 5, image_url: '/images/demo/room-5-1200.webp', cta_label: null });
    expect((await call('POST', '/promotions', { token: adminToken, form: form({ title: 'x', cta_action: 'section', cta_label: 'Go', cta_section: 'https://evil.example', visible: 'true' }) })).status).toBe(400);
    expect((await call('POST', '/promotions', { token: adminToken, form: form({ title: 'x', cta_action: 'link', cta_label: 'Go', visible: 'true' }) })).status).toBe(400);
    const toFaq = await call('POST', '/promotions', { token: adminToken, form: form({ title: 'FAQ promo', cta_action: 'section', cta_label: 'Read the FAQ', cta_section: 'faq', visible: 'false' }) });
    expect(toFaq.body).toMatchObject({ cta_action: 'section', cta_section: 'faq' });
    expect(toFaq.body).not.toHaveProperty('cta_url');
    expect((await call('POST', '/promotions', { token: adminToken, form: form({ title: 'x', cta_action: 'none', visible: 'true', image_url: 'https://evil.example/x.png' }) })).status).toBe(400);

    const order = await call('PUT', '/promotions/order', { token: adminToken, json: { ids: [created.body.id, 'promo-1', 'promo-2', 'promo-3', 'promo-4', toFaq.body.id] } });
    expect(order.body.items[0].id).toBe(created.body.id);
    expect((await call('PUT', '/promotions/order', { token: adminToken, json: { ids: ['promo-1'] } })).status).toBe(400);

    expect((await call('PUT', '/promotions/section', { token: adminToken, json: { visible: false } })).body.section_visible).toBe(false);
    expect((await call('GET', '/promotions/active')).body).toEqual([]);
    expect((await call('DELETE', '/promotions/promo-4', { token: adminToken })).status).toBe(204);
    expect((await call('DELETE', '/promotions/promo-4', { token: adminToken })).status).toBe(404);
  });

  it('birthday greeting: renter gets the rendered greeting only on their birthday (never the date); admin GET/PUT, http(s) links only, 403', async () => {
    const greetingKeys = ['title', 'message', 'link_label', 'link_url', 'image_url'];
    const mine = await call('GET', '/me/greeting', { token: anaToken }); // Ana's fixture birthday is today
    expect(mine.status).toBe(200);
    hasKeys(mine.body, greetingKeys);
    expect(Object.keys(mine.body).sort()).toEqual([...greetingKeys].sort());
    expect(mine.body.title).toBe('Happy birthday, Ana!');
    expect((await call('GET', '/me/greeting', { token: benToken })).body).toBeNull(); // Ben's is in 9 days
    expect((await call('GET', '/me/greeting', { token: adminToken })).status).toBe(403);

    expect((await call('GET', '/settings/birthday-greeting', { token: anaToken })).status).toBe(403);
    hasKeys((await call('GET', '/settings/birthday-greeting', { token: adminToken })).body, ['enabled', ...greetingKeys, 'updated_at']);
    const save = (fields: Record<string, string>) => call('PUT', '/settings/birthday-greeting', { token: adminToken, form: form({ enabled: 'true', title: 'Hi {name}', message: 'Enjoy, {name}.', ...fields }) });
    expect((await save({ link_label: 'Go', link_url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await save({ link_label: 'Go' })).status).toBe(400); // label without a link
    const saved = await save({ link_label: '', link_url: '', remove_image: 'true' });
    expect(saved.body).toMatchObject({ title: 'Hi {name}', link_label: null, link_url: null, image_url: null });
    expect((await call('GET', '/me/greeting', { token: anaToken })).body).toMatchObject({ title: 'Hi Ana', message: 'Enjoy, Ana.' });
    await save({ enabled: 'false' });
    expect((await call('GET', '/me/greeting', { token: anaToken })).body).toBeNull();
  });

  /** Re-seeds the recurring postings as if the job had first run on `today` (the seed itself runs on the real clock). */
  async function freshRecurring(today: string) {
    const mod = await import('./db');
    mod.db.today = () => today;
    mod.db.expenses = mod.db.expenses.filter((e) => !e.recurring_id);
    for (const r of mod.db.recurring) r.last_posted_period = null;
    mod.postRecurringExpenses(mod.db);
    return mod;
  }
  const postedMonths = (expenses: { recurring_id: string | null; period?: string | null }[], id: string) =>
    expenses.filter((e) => e.recurring_id === id).map((e) => e.period!.slice(0, 7)).sort();

  it('recurring expenses: seeded history, idempotent posting, edit = future only, PATCH one entry, delete keeps entries', async () => {
    const { db, postRecurringExpenses } = await freshRecurring('2026-10-15');
    const list = await call('GET', '/recurring-expenses', { token: adminToken });
    expect(list.body.map((r: { name: string; amount: number; due_day: number; last_posted_period: string }) => [r.name, r.amount, r.due_day, r.last_posted_period])).toEqual([
      ['Condo dues', 2500, 5, '2026-10-01'],
      ['Internet (PLDT)', 1699, 15, '2026-10-01'],
      ['Netflix', 549, 20, '2026-09-01'], // Oct 20 hasn't come yet
    ]);
    expect(postedMonths(db.expenses, 'rec-condo')).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(postRecurringExpenses(db)).toBe(0); // reruns never duplicate

    // Edit: future months only (September's entry keeps ₱2,500).
    const edited = await call('PATCH', '/recurring-expenses/rec-condo', { token: adminToken, json: { name: 'Condo dues', category: 'other', amount: 2800, due_day: 5, starts_on: '2026-07-01', active: true } });
    expect(edited.body.amount).toBe(2800);
    expect(db.expenses.find((e) => e.id === 'exp-rec-condo-2026-09')!.amount).toBe(250000);
    db.today = () => '2026-11-06';
    postRecurringExpenses(db); // a missed run catches up: Netflix October and condo November
    expect(db.expenses.find((e) => e.id === 'exp-rec-condo-2026-11')!.amount).toBe(280000);
    expect(postedMonths(db.expenses, 'rec-netflix')).toContain('2026-10');

    const one = await call('PATCH', '/expenses/exp-rec-internet-2026-09', { token: adminToken, json: { spent_on: '2026-09-15', category: 'utilities', description: 'Internet (PLDT)', amount: 1899 } });
    expect(one.body).toMatchObject({ amount: 1899, recurring_id: 'rec-internet' });
    expect((await call('GET', '/recurring-expenses', { token: adminToken })).body[1].amount).toBe(1699);

    expect((await call('POST', '/recurring-expenses', { token: adminToken, json: { name: 'x', category: 'car', amount: 0, due_day: 40, starts_on: '2026-07-15', active: true } })).status).toBe(400);
    expect((await call('DELETE', '/recurring-expenses/rec-condo', { token: adminToken })).status).toBe(204);
    expect(db.expenses.find((e) => e.id === 'exp-rec-condo-2026-09')).toMatchObject({ recurring_id: null, amount: 250000 });
  });

  it('BR-16: a deleted posted entry is never posted again', async () => {
    const { db, postRecurringExpenses } = await freshRecurring('2026-10-15');
    expect((await call('DELETE', '/expenses/exp-rec-condo-2026-09', { token: adminToken })).status).toBe(204);
    expect(postRecurringExpenses(db)).toBe(0);
    await call('GET', '/expenses?from=2026-09-01&to=2026-09-30', { token: adminToken }); // the request runs the job too
    expect(postedMonths(db.expenses, 'rec-condo')).toEqual(['2026-07', '2026-08', '2026-10']);
  });

  it('BR-16: resume posts the current month but never back-fills the earlier paused months', async () => {
    const { db, postRecurringExpenses } = await freshRecurring('2026-10-15');
    const netflix = { name: 'Netflix', category: 'subscriptions', amount: 549, due_day: 20, starts_on: '2026-07-01' };
    await call('PATCH', '/recurring-expenses/rec-netflix', { token: adminToken, json: { ...netflix, active: false } });
    db.today = () => '2026-12-25';
    postRecurringExpenses(db);
    const resumed = await call('PATCH', '/recurring-expenses/rec-netflix', { token: adminToken, json: { ...netflix, active: true } });
    // Resume sets the watermark to November, and the request's posting run then posts December at once (Dec 20 passed while
    // paused); October and November never post.
    expect(resumed.body.last_posted_period).toBe('2026-12-01');
    expect(postedMonths(db.expenses, 'rec-netflix')).toEqual(['2026-07', '2026-08', '2026-09', '2026-12']);
    db.today = () => '2027-01-20';
    postRecurringExpenses(db);
    expect(postedMonths(db.expenses, 'rec-netflix')).toEqual(['2026-07', '2026-08', '2026-09', '2026-12', '2027-01']);
  });

  it('BR-16: a new template with a past start month posts those months, with the day-31 clamp', async () => {
    const { db } = await freshRecurring('2026-10-15');
    const created = await call('POST', '/recurring-expenses', { token: adminToken, json: { name: 'Water filter rental', category: 'supplies', amount: 350, due_day: 31, starts_on: '2026-05-01', active: true } });
    expect(created.status).toBe(201);
    expect(created.body.last_posted_period).toBe('2026-09-01'); // Oct 31 hasn't come yet
    const dates = db.expenses.filter((e) => e.recurring_id === created.body.id).map((e) => e.spent_on).sort();
    expect(dates).toEqual(['2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30']);

    db.today = () => '2027-03-01';
    const feb = await call('POST', '/recurring-expenses', { token: adminToken, json: { name: 'Feb test', category: 'other', amount: 1, due_day: 31, starts_on: '2027-02-01', active: true } });
    expect(db.expenses.filter((e) => e.recurring_id === feb.body.id).map((e) => e.spent_on)).toEqual(['2027-02-28']);
  });

  it('GET /dashboard/analytics → range totals, monthly series, items and open items; 400 on a bad period', async () => {
    const month = await call('GET', '/dashboard/analytics?range=month&period=2026-09-01', { token: adminToken });
    expect(month.status).toBe(200);
    expect(month.body).toMatchObject({ range: 'month', from: '2026-09-01', to: '2026-09-01', revenue: 19200, expenses: 20563, occupancy: { occupied: 6, total: 8 } });
    expect(month.body.series.map((p: { period: string }) => p.period)).toEqual(['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']);
    hasKeys(month.body.series[0], ['period', 'revenue', 'expenses', 'billed', 'collected', 'occupied', 'total_beds']);
    month.body.items.forEach((r: unknown) => hasKeys(r, KEYS.chargeRow));
    expect(month.body.items).toHaveLength(10);
    expect(month.body.open_items.map((r: { renter: { full_name: string } }) => r.renter.full_name)).toEqual(['Jomar Bautista', 'Hana Villanueva', 'Jomar Bautista', 'Cara Mendoza', 'Jomar Bautista', 'Ben Dela Rosa', 'Ben Dela Rosa', 'Cara Mendoza']);

    expect((await call('GET', '/dashboard/analytics?range=month&period=2026-09-15', { token: adminToken })).status).toBe(400);
    expect((await call('GET', '/dashboard/analytics?range=month', { token: anaToken })).status).toBe(403);
  });

  it('expenses: GET by date range (newest first), POST 201 / 400, DELETE 204 / 404', async () => {
    const sep = await call('GET', '/expenses?from=2026-09-01&to=2026-09-30', { token: adminToken });
    // Recurring entries (condo 2,500, internet 1,699, Netflix 549) are posted alongside the one-off expenses.
    expect(sep.body.map((e: { id: string }) => e.id)).toEqual(['exp-rec-netflix-2026-09', 'exp-10', 'exp-rec-internet-2026-09', 'exp-9', 'exp-rec-condo-2026-09']);
    hasKeys(sep.body[0], ['id', 'recurring_id', 'spent_on', 'category', 'description', 'amount', 'note', 'created_at']);

    const created = await call('POST', '/expenses', { token: adminToken, json: { spent_on: '2026-09-02', category: 'utilities', description: 'Water tank refill', amount: 450.5 } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ category: 'utilities', amount: 450.5, note: null });
    const bad = await call('POST', '/expenses', { token: adminToken, json: { spent_on: '2999-01-01', category: 'car', description: 'x', amount: 0 } });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details).sort()).toEqual(['amount', 'category', 'description', 'spent_on']);

    expect((await call('DELETE', `/expenses/${created.body.id}`, { token: adminToken })).status).toBe(204);
    expect((await call('DELETE', `/expenses/${created.body.id}`, { token: adminToken })).status).toBe(404);
  });

  it('schedule-events "Post to renters": a linked maintenance notice created, synced, unlinked and removed with the item', async () => {
    const { db } = await import('./db');
    const day = addDays(db.today(), 3);
    const at = (time: string) => `${day}T${time}:00+08:00`;
    const base = { type: 'other', title: 'Water interruption', starts_at: at('09:00'), ends_at: at('11:00'), all_day: false, note: 'Store water.', notify_renter: false };
    const feed = async () => (await call('GET', '/me/announcements', { token: anaToken })).body.items as { id: string; title: string }[];
    const notice = (id: string | null) => db.announcements.find((a) => a.id === id);

    // Seed: ev-5 is linked to ann-14 both ways; the renter row hides the link.
    const seeded = (await call('GET', `/schedule?from=${addDays(db.today(), 2)}&to=${addDays(db.today(), 2)}`, { token: adminToken })).body.events;
    expect(seeded.find((e: { id: string }) => e.id === 'ev-5')).toMatchObject({ announcement_id: 'ann-14' });
    expect((await feed()).find((a) => a.id === 'ann-14')).not.toHaveProperty('schedule_event_id');

    // Validation: the notice needs a note, and a timed item needs an end time.
    const bad = await call('POST', '/schedule-events', { token: adminToken, json: { ...base, note: undefined, ends_at: null, post_to_renters: true } });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.details).sort()).toEqual(['ends_at', 'note']);

    // Off by default: no notice.
    const plain = await call('POST', '/schedule-events', { token: adminToken, json: base });
    expect(plain.body).toMatchObject({ event: { announcement_id: null }, notified: { renter: false, renters: false } });

    // On + email: a published maintenance notice with the item's window, emailed once.
    const created = await call('POST', '/schedule-events', { token: adminToken, json: { ...base, post_to_renters: true, email_renters: true } });
    expect(created.status).toBe(201);
    expect(created.body.notified).toEqual({ renter: false, renters: true });
    const id = created.body.event.announcement_id as string;
    expect(notice(id)).toMatchObject({ kind: 'maintenance', title: 'Water interruption', body: 'Store water.', starts_on: day, ends_on: day, start_time: '09:00', end_time: '11:00', schedule_event_id: created.body.event.id, emailed_at: expect.any(String) });
    expect((await call('GET', '/announcements', { token: adminToken })).body.find((a: { id: string }) => a.id === id)).toMatchObject({ schedule_event_id: created.body.event.id, status: 'published' });
    expect((await feed()).map((a) => a.id)).toContain(id);
    const emailedAt = notice(id)!.emailed_at;

    // Edit → the notice follows (all day → date-only window); renters are not emailed again.
    const evId = created.body.event.id;
    const edited = await call('PATCH', `/schedule-events/${evId}`, { token: adminToken, json: { ...base, title: 'Water interruption (all day)', all_day: true, ends_at: null, post_to_renters: true, email_renters: true } });
    expect(edited.body.notified.renters).toBe(false);
    expect(notice(id)).toMatchObject({ title: 'Water interruption (all day)', start_time: null, end_time: null, emailed_at: emailedAt });

    // Toggle off → the notice is removed; back on → a new one.
    await call('PATCH', `/schedule-events/${evId}`, { token: adminToken, json: { ...base, post_to_renters: false } });
    expect(notice(id)).toBeUndefined();
    const again = await call('PATCH', `/schedule-events/${evId}`, { token: adminToken, json: { ...base, post_to_renters: true } });
    const id2 = again.body.event.announcement_id as string;
    expect(id2).not.toBe(id);

    // Deleting the notice from Announcements unlinks the item (the item stays).
    expect((await call('DELETE', `/announcements/${id2}`, { token: adminToken })).status).toBe(204);
    expect(db.scheduleEvents.find((e) => e.id === evId)).toMatchObject({ announcement_id: null });

    // Deleting the item removes its notice.
    const third = await call('PATCH', `/schedule-events/${evId}`, { token: adminToken, json: { ...base, post_to_renters: true } });
    expect((await call('DELETE', `/schedule-events/${evId}`, { token: adminToken })).body.notified).toEqual({ renter: false, renters: false });
    expect(notice(third.body.event.announcement_id)).toBeUndefined();

    // Renter items never post (the flag is ignored).
    const renterItem = await call('POST', '/schedule-events', { token: adminToken, json: { ...base, type: 'renter', renter_id: 'usr-ana', post_to_renters: true } });
    expect(renterItem.body.event.announcement_id).toBeNull();
  });

  it('schedule-events "Schedule fix": links an open request (Submitted → In progress), renters see the date, delete unlinks', async () => {
    const { db } = await import('./db');
    const day = addDays(db.today(), 4);
    const base = { type: 'other', title: 'Plumbing fix: Ana Cruz', starts_at: `${day}T09:00:00+08:00`, ends_at: null, all_day: false, note: 'Leak under the sink.', notify_renter: false };
    const mine = async () => (await call('GET', '/me/maintenance-requests', { token: anaToken })).body as { id: string; status: string; scheduled_fix: unknown }[];

    // Seed: ana's aircon request mr-2 already has a fix (ev-6); the others have none.
    expect((await mine()).find((r) => r.id === 'mr-2')!.scheduled_fix).toEqual({ starts_at: `${addDays(db.today(), 5)}T09:00:00+08:00`, all_day: false });
    expect((await mine()).find((r) => r.id === 'mr-1')!.scheduled_fix).toBeNull();

    // Unknown request → 400 on the field; closed (mr-3 done) or already scheduled (mr-2) → 409.
    const unknown = await call('POST', '/schedule-events', { token: adminToken, json: { ...base, maintenance_request_id: 'mr-x' } });
    expect(unknown.status).toBe(400);
    expect(Object.keys(unknown.body.error.details)).toEqual(['maintenance_request_id']);
    expect((await call('POST', '/schedule-events', { token: adminToken, json: { ...base, maintenance_request_id: 'mr-3' } })).status).toBe(409);
    expect((await call('POST', '/schedule-events', { token: adminToken, json: { ...base, maintenance_request_id: 'mr-2' } })).body.error.code).toBe('FIX_NOT_SCHEDULABLE');

    // mr-1 (Submitted): the item links it and the request moves to In progress; admin and renter see the date.
    const created = await call('POST', '/schedule-events', { token: adminToken, json: { ...base, maintenance_request_id: 'mr-1' } });
    expect(created.status).toBe(201);
    expect(created.body.event).toMatchObject({ type: 'other', maintenance_request_id: 'mr-1', announcement_id: null });
    expect((await mine()).find((r) => r.id === 'mr-1')).toMatchObject({ status: 'in_progress', scheduled_fix: { starts_at: base.starts_at, all_day: false } });
    const adminRow = (await call('GET', '/maintenance-requests?status=open', { token: adminToken })).body.find((r: { id: string }) => r.id === 'mr-1');
    expect(adminRow.scheduled_fix).toEqual({ starts_at: base.starts_at, all_day: false });

    // An edit keeps the link (PATCH ignores maintenance_request_id) and moves the date.
    const evId = created.body.event.id;
    const moved = await call('PATCH', `/schedule-events/${evId}`, { token: adminToken, json: { ...base, all_day: true, maintenance_request_id: null } });
    expect(moved.body.event.maintenance_request_id).toBe('mr-1');
    expect((await mine()).find((r) => r.id === 'mr-1')!.scheduled_fix).toEqual({ starts_at: `${day}T00:00:00+08:00`, all_day: true });

    // Delete unlinks; the request keeps its status.
    expect((await call('DELETE', `/schedule-events/${evId}`, { token: adminToken })).status).toBe(200);
    expect((await mine()).find((r) => r.id === 'mr-1')).toMatchObject({ status: 'in_progress', scheduled_fix: null });

    // Renter items never link a request.
    const renterItem = await call('POST', '/schedule-events', { token: adminToken, json: { ...base, type: 'renter', renter_id: 'usr-ana', maintenance_request_id: 'mr-5' } });
    expect(renterItem.body.event.maintenance_request_id).toBeNull();
    expect(db.maintenance.find((m) => m.id === 'mr-5')!.status).toBe('submitted');
  });
});

describe('Auth and role guards (SC-10, SC-67)', () => {
  it('no token → 401; wrong role → 403 with the NFR2 shape', async () => {
    const none = await call('GET', '/me');
    expect(none).toEqual({ status: 401, body: { error: { code: 'UNAUTHENTICATED', message: expect.any(String) } } });
    for (const path of ['/dashboard', '/renters', '/payments', '/settings']) {
      expect((await call('GET', path, { token: anaToken })).status).toBe(403);
    }
    for (const path of ['/me/charges', '/me/balance']) {
      expect((await call('GET', path, { token: adminToken })).status).toBe(403);
    }
  });
});
