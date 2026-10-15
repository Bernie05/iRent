/** B5 against local Supabase Auth: real, expired and forged tokens. */
import { it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { describeLive, serviceClient, liveUser, liveTenancy, signJwt } from '../helpers/live.js';

describeLive('auth middleware with real Supabase tokens (B5)', () => {
  let app;
  let sb;
  let renter;
  let pending;
  let admin;

  beforeAll(async () => {
    const { createApp } = await import('../../src/app.js');
    const { loadConfig } = await import('../../src/config.js');
    sb = serviceClient();
    app = createApp({ config: loadConfig(process.env), supabase: sb });
    renter = await liveUser(sb);
    await liveTenancy(sb, renter.id);
    pending = await liveUser(sb, { activated: false, language: 'fil' });
    admin = await liveUser(sb, { role: 'admin' });
  });

  it('a real renter token → 200 /me with the active tenancy', async () => {
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${renter.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: renter.id, role: 'renter', tenancy: { bed: { bunk_type: 'lower', monthly_rate: 4500 } } });
  });

  it('no token, garbage, forged and expired tokens → 401', async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: renter.id, role: 'authenticated', aud: 'authenticated', email: renter.email };
    const tokens = ['', 'garbage', signJwt({ ...claims, iat: now, exp: now + 3600 }, 'not-the-real-secret-at-least-32-chars!!')];
    if (process.env.SUPABASE_JWT_SECRET) {
      tokens.push(signJwt({ ...claims, iat: now - 7200, exp: now - 3600 }, process.env.SUPABASE_JWT_SECRET));
    }
    for (const t of tokens) {
      const req = request(app).get('/api/me');
      if (t) req.set('Authorization', `Bearer ${t}`);
      const res = await req;
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('the first request sets activated_at; later requests do not change it (R15)', async () => {
    await request(app).get('/api/me').set('Authorization', `Bearer ${pending.token}`).expect(200);
    const first = (await sb.from('profiles').select('activated_at').eq('id', pending.id).single()).data.activated_at;
    expect(first).not.toBeNull();
    await request(app).get('/api/me').set('Authorization', `Bearer ${pending.token}`).expect(200);
    const second = (await sb.from('profiles').select('activated_at').eq('id', pending.id).single()).data.activated_at;
    expect(second).toBe(first);
  });

  it('role guards: renter → 403 on admin routes; admin → 403 on /me/charges', async () => {
    expect((await request(app).get('/api/dashboard').set('Authorization', `Bearer ${renter.token}`)).status).toBe(403);
    expect((await request(app).get('/api/me/charges').set('Authorization', `Bearer ${admin.token}`)).status).toBe(403);
  });

  it('PATCH /me { language } persists; invalid → 400', async () => {
    const ok = await request(app).patch('/api/me').set('Authorization', `Bearer ${renter.token}`).send({ language: 'fil' });
    expect(ok.status).toBe(200);
    expect((await sb.from('profiles').select('language').eq('id', renter.id).single()).data.language).toBe('fil');
    const bad = await request(app).patch('/api/me').set('Authorization', `Bearer ${renter.token}`).send({ language: 'xx' });
    expect(bad.status).toBe(400);
  });
});
