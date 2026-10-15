import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createMockSupabase } from '../helpers/mockSupabase.js';

const config = loadConfig({ ...process.env, CLIENT_ORIGIN: 'http://localhost:5173' });

function makeApp() {
  return createApp({
    config,
    supabase: createMockSupabase(),
    extraRoutes: (router) => {
      router.get('/__boom', () => {
        throw new Error('database password is hunter2 at /srv/app/secret.js:42');
      });
      router.get('/__async-boom', async (_req, _res, next) => next(new TypeError('Cannot read properties of undefined')));
      router.post('/__echo', (req, res) => res.json(req.body));
    },
  });
}

describe('server scaffold (B1)', () => {
  it('GET /api/health → 200 { ok: true }', async () => {
    const res = await request(makeApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('sets helmet security headers and hides x-powered-by', async () => {
    const res = await request(makeApp()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS: allows only CLIENT_ORIGIN', async () => {
    const app = makeApp();
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    const preflight = await request(app)
      .options('/api/me')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'PATCH');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();

    const goodPreflight = await request(app)
      .options('/api/me')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(goodPreflight.status).toBe(204);
    expect(goodPreflight.headers['access-control-allow-headers']).toMatch(/Authorization/i);
  });

  it('unknown route → 404 NOT_FOUND in the NFR2 shape', async () => {
    const res = await request(makeApp()).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  it('malformed JSON → 400 VALIDATION_ERROR', async () => {
    const res = await request(makeApp())
      .post('/api/__echo')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('a thrown error → 500 INTERNAL with a generic message and no stack or internals', async () => {
    for (const path of ['/api/__boom', '/api/__async-boom']) {
      const res = await request(makeApp()).get(path);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
      expect(res.text).not.toMatch(/hunter2|secret\.js|at |stack|TypeError/);
    }
  });

  it('the 301st request from one IP in 15 minutes → 429 RATE_LIMITED', async () => {
    const app = makeApp();
    const agent = request(app);
    for (let i = 0; i < 300; i += 1) {
      const res = await agent.get('/api/health');
      expect(res.status).toBe(200);
    }
    const res = await agent.get('/api/health');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['ratelimit-policy']).toBeDefined();
  }, 60_000);
});
