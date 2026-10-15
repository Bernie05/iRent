import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createRequireAuth, requireRole, loadOwned } from '../../src/middleware/auth.js';
import { createMockSupabase } from '../helpers/mockSupabase.js';

const config = loadConfig(process.env);

const RENTER = '11111111-1111-4111-8111-111111111111';
const PENDING = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const MOVED_OUT = '44444444-4444-4444-8444-444444444444';
const ORPHAN = '55555555-5555-4555-8555-555555555555';
const BED = '66666666-6666-4666-8666-666666666666';

function fixtures() {
  return {
    tokens: { 'renter-token': RENTER, 'pending-token': PENDING, 'admin-token': ADMIN, 'moved-token': MOVED_OUT, 'orphan-token': ORPHAN },
    tables: {
      profiles: [
        { id: RENTER, full_name: 'Ana Cruz', email: 'ana@irent.test', phone: '09170000001', role: 'renter', language: 'en', is_active: true, invited_at: '2026-09-01T00:00:00Z', activated_at: '2026-09-02T00:00:00Z' },
        { id: PENDING, full_name: 'Dan Reyes', email: 'dan@irent.test', phone: '09170000002', role: 'renter', language: 'fil', is_active: true, invited_at: '2026-09-20T00:00:00Z', activated_at: null },
        { id: ADMIN, full_name: 'Bernie', email: 'owner@irent.test', phone: null, role: 'admin', language: 'en', is_active: true, invited_at: null, activated_at: null },
        { id: MOVED_OUT, full_name: 'Cai Santos', email: 'cai@irent.test', phone: '09170000003', role: 'renter', language: 'en', is_active: true, invited_at: null, activated_at: '2026-01-01T00:00:00Z' },
      ],
      beds: [{ id: BED, label: 'Room 1 – Lower Bunk A', room: 'Room 1', bunk_type: 'lower', monthly_rate: 4500, status: 'occupied' }],
      tenancies: [
        { id: 'aaaaaaaa-0000-4000-8000-000000000001', renter_id: RENTER, bed_id: BED, move_in: '2026-09-05', is_active: true },
        { id: 'aaaaaaaa-0000-4000-8000-000000000002', renter_id: MOVED_OUT, bed_id: BED, move_in: '2026-01-10', is_active: false },
      ],
    },
  };
}

function setup(extra) {
  const supabase = createMockSupabase({ ...fixtures(), ...extra });
  const app = createApp({ config, supabase });
  return { app, supabase };
}

describe('requireAuth (B5)', () => {
  it('no token, a garbage token, a non-Bearer header or an expired token → 401 UNAUTHENTICATED', async () => {
    const { app } = setup();
    const cases = [
      undefined,
      'Bearer',
      'Bearer not.a.valid.token',
      'Basic dXNlcjpwYXNz',
      'Bearer expired-token',
      'Bearer <script>',
    ];
    for (const header of cases) {
      const req = request(app).get('/api/me');
      if (header) req.set('Authorization', header);
      const res = await req;
      expect(res.status, String(header)).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(typeof res.body.error.message).toBe('string');
    }
  });

  it('a valid token without a profile → 401', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer orphan-token');
    expect(res.status).toBe(401);
  });

  it('a disabled profile → 403', async () => {
    const f = fixtures();
    f.tables.profiles[0].is_active = false;
    const supabase = createMockSupabase(f);
    const res = await request(createApp({ config, supabase })).get('/api/me').set('Authorization', 'Bearer renter-token');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('an Auth outage is a 500, not a false logout', async () => {
    const { app } = setup({ getUserError: { status: 503, message: 'upstream down' } });
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer renter-token');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
  });

  it("sets activated_at on a pending renter's first request, and never changes it afterwards (R15)", async () => {
    const { app, supabase } = setup();
    const first = await request(app).get('/api/me').set('Authorization', 'Bearer pending-token');
    expect(first.status).toBe(200);
    const row = () => supabase._db.profiles.find((p) => p.id === PENDING);
    const activatedAt = row().activated_at;
    expect(activatedAt).toEqual(expect.any(String));

    await new Promise((r) => setTimeout(r, 5));
    await request(app).get('/api/me').set('Authorization', 'Bearer pending-token');
    expect(row().activated_at).toBe(activatedAt);
    expect(supabase._calls.filter((c) => c.table === 'profiles' && 'activated_at' in c.patch)).toHaveLength(1);
  });

  it('does not touch activated_at for admins or already-activated renters', async () => {
    const { app, supabase } = setup();
    await request(app).get('/api/me').set('Authorization', 'Bearer admin-token');
    await request(app).get('/api/me').set('Authorization', 'Bearer renter-token');
    expect(supabase._calls).toHaveLength(0);
    expect(supabase._db.profiles.find((p) => p.id === ADMIN).activated_at).toBeNull();
  });

  it('passes the bare token to auth.getUser', async () => {
    const { app, supabase } = setup();
    await request(app).get('/api/me').set('Authorization', 'bearer   renter-token  ');
    expect(supabase.auth.getUser).toHaveBeenCalledWith('renter-token');
  });
});

describe('requireRole (B5)', () => {
  it('a renter calling /api/dashboard or any other admin route → 403 FORBIDDEN', async () => {
    const { app } = setup();
    for (const path of ['/api/dashboard', '/api/beds', '/api/renters', '/api/payments?verification=auto_verified', '/api/settings', '/api/inquiries']) {
      const res = await request(app).get(path).set('Authorization', 'Bearer renter-token');
      expect(res.status, path).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('an admin calling /api/me/charges (or any renter /me/* route) → 403', async () => {
    const { app } = setup();
    for (const path of ['/api/me/charges', '/api/me/balance', '/api/me/payments']) {
      const res = await request(app).get(path).set('Authorization', 'Bearer admin-token');
      expect(res.status, path).toBe(403);
    }
  });

  it('unauthenticated calls to admin and renter routes → 401', async () => {
    const { app } = setup();
    for (const path of ['/api/dashboard', '/api/me/charges', '/api/beds']) {
      expect((await request(app).get(path)).status, path).toBe(401);
    }
  });

  it('the guard itself: missing user → 401, wrong role → 403, right role → next()', () => {
    const next = vi.fn();
    requireRole('admin')({}, {}, next);
    expect(next.mock.calls[0][0].code).toBe('UNAUTHENTICATED');
    requireRole('admin')({ user: { role: 'renter' } }, {}, next);
    expect(next.mock.calls[1][0].code).toBe('FORBIDDEN');
    requireRole('admin', 'renter')({ user: { role: 'renter' } }, {}, next);
    expect(next.mock.calls[2]).toEqual([]);
  });

  it('createRequireAuth sets req.user and req.profile', async () => {
    const supabase = createMockSupabase(fixtures());
    const req = { get: (h) => (h.toLowerCase() === 'authorization' ? 'Bearer renter-token' : undefined) };
    await new Promise((resolve) => createRequireAuth({ supabase })(req, {}, resolve));
    expect(req.user).toEqual({ id: RENTER, role: 'renter', language: 'en', email: 'ana@irent.test' });
    expect(req.profile.full_name).toBe('Ana Cruz');
  });
});

describe('GET /api/me and PATCH /api/me (B5)', () => {
  it('returns the profile and the active tenancy', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer renter-token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: RENTER,
      full_name: 'Ana Cruz',
      email: 'ana@irent.test',
      phone: '09170000001',
      role: 'renter',
      language: 'en',
      tenancy: {
        id: 'aaaaaaaa-0000-4000-8000-000000000001',
        bed: { label: 'Room 1 – Lower Bunk A', room: 'Room 1', bunk_type: 'lower', monthly_rate: 4500 },
        move_in: '2026-09-05',
      },
    });
  });

  it('a moved-out renter keeps access with tenancy: null (OQ-6 = A)', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer moved-token');
    expect(res.status).toBe(200);
    expect(res.body.tenancy).toBeNull();
  });

  it('the admin gets their profile with tenancy: null', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer admin-token');
    expect(res.body).toMatchObject({ role: 'admin', tenancy: null });
  });

  it('PATCH { language: "fil" } persists and returns the updated profile', async () => {
    const { app, supabase } = setup();
    const res = await request(app).patch('/api/me').set('Authorization', 'Bearer renter-token').send({ language: 'fil' });
    expect(res.status).toBe(200);
    expect(res.body.language).toBe('fil');
    expect(res.body.tenancy).not.toBeNull();
    expect(supabase._db.profiles.find((p) => p.id === RENTER).language).toBe('fil');
    const again = await request(app).get('/api/me').set('Authorization', 'Bearer renter-token');
    expect(again.body.language).toBe('fil');
  });

  it('PATCH { language: "xx" }, a missing language or extra fields → 400 with details', async () => {
    const { app, supabase } = setup();
    for (const body of [{ language: 'xx' }, {}, { language: 'en', role: 'admin' }, { language: 'en', email: 'x@y.z' }]) {
      const res = await request(app).patch('/api/me').set('Authorization', 'Bearer renter-token').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
    }
    expect(supabase._db.profiles.find((p) => p.id === RENTER)).toMatchObject({ role: 'renter', language: 'en' });
  });

  it('PATCH works for the admin too', async () => {
    const { app } = setup();
    const res = await request(app).patch('/api/me').set('Authorization', 'Bearer admin-token').send({ language: 'fil' });
    expect(res.status).toBe(200);
    expect(res.body.language).toBe('fil');
  });
});

describe('loadOwned (B5, D-8)', () => {
  function supabaseWith(result) {
    const calls = [];
    const builder = {
      select: (cols) => (calls.push(['select', cols]), builder),
      eq: (c, v) => (calls.push(['eq', c, v]), builder),
      maybeSingle: async () => result,
    };
    return { from: (t) => (calls.push(['from', t]), builder), calls };
  }

  it('returns the row when it belongs to the renter, filtering through tenancies', async () => {
    const sb = supabaseWith({ data: { id: 'x', amount: 1, owner_tenancy: { renter_id: RENTER } }, error: null });
    const row = await loadOwned(sb, 'rent_charges', 'aaaaaaaa-0000-4000-8000-000000000009', RENTER, 'id, amount');
    expect(row).toEqual({ id: 'x', amount: 1 });
    expect(sb.calls).toContainEqual(['eq', 'owner_tenancy.renter_id', RENTER]);
    expect(sb.calls).toContainEqual(['select', 'id, amount, owner_tenancy:tenancies!inner(renter_id)']);
  });

  it("another renter's row, an unknown id and a malformed id → 404 NOT_FOUND", async () => {
    const sb = supabaseWith({ data: null, error: null });
    await expect(loadOwned(sb, 'payments', 'aaaaaaaa-0000-4000-8000-000000000009', RENTER)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await expect(loadOwned(sb, 'payments', '1 or 1=1', RENTER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Only the first lookup reached the database (from, select, eq id, eq owner); the malformed id did not.
    expect(sb.calls.filter((c) => c[0] === 'from')).toHaveLength(1);
  });

  it('tenancies and the ledger filter on renter_id directly', async () => {
    const sb = supabaseWith({ data: { id: 't' }, error: null });
    await loadOwned(sb, 'tenancies', 'aaaaaaaa-0000-4000-8000-000000000001', RENTER);
    expect(sb.calls).toContainEqual(['eq', 'renter_id', RENTER]);
    await expect(loadOwned(sb, 'beds', 'aaaaaaaa-0000-4000-8000-000000000001', RENTER)).rejects.toThrow(/unsupported/);
  });
});
