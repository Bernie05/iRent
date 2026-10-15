import { http, HttpResponse } from 'msw';
import type { BaseQueryApi } from '@reduxjs/toolkit/query';
import { server } from '../mocks/node';
import { createBaseQueryWithReauth, type AuthBridge } from './baseQuery';

const BASE = 'http://localhost:4000/api';

function fakeApi(): BaseQueryApi {
  return {
    signal: new AbortController().signal,
    abort: () => undefined,
    dispatch: vi.fn(),
    getState: () => ({}),
    extra: undefined,
    endpoint: 'test',
    type: 'query',
  };
}

function fakeAuth(tokens: { current: string | null; refreshTo: string | null }) {
  const auth: AuthBridge & { refreshCalls: number } = {
    refreshCalls: 0,
    getAccessToken: async () => tokens.current,
    refreshSession: async () => {
      auth.refreshCalls += 1;
      await new Promise((r) => setTimeout(r, 5));
      if (tokens.refreshTo) tokens.current = tokens.refreshTo;
      return tokens.refreshTo;
    },
  };
  return auth;
}

/** A protected endpoint that only accepts the given token; records the tokens it saw. */
function protectedEndpoint(validToken: string) {
  const seen: (string | null)[] = [];
  server.use(
    http.get(`${BASE}/protected`, ({ request }) => {
      const header = request.headers.get('Authorization');
      seen.push(header);
      if (header !== `Bearer ${validToken}`) {
        return HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'expired' } }, { status: 401 });
      }
      return HttpResponse.json({ ok: true });
    }),
  );
  return seen;
}

describe('createBaseQueryWithReauth (R14)', () => {
  it('attaches the Bearer token', async () => {
    const seen = protectedEndpoint('good');
    const onSessionExpired = vi.fn();
    const baseQuery = createBaseQueryWithReauth({ baseUrl: BASE, auth: fakeAuth({ current: 'good', refreshTo: null }), onSessionExpired });
    const result = await baseQuery('/protected', fakeApi(), {});
    expect(result.data).toEqual({ ok: true });
    expect(seen).toEqual(['Bearer good']);
  });

  it('on a 401, refreshes once and retries the request once with the new token', async () => {
    const seen = protectedEndpoint('fresh');
    const auth = fakeAuth({ current: 'stale', refreshTo: 'fresh' });
    const onSessionExpired = vi.fn();
    const baseQuery = createBaseQueryWithReauth({ baseUrl: BASE, auth, onSessionExpired });

    const result = await baseQuery('/protected', fakeApi(), {});

    expect(result.data).toEqual({ ok: true });
    expect(auth.refreshCalls).toBe(1);
    expect(seen).toEqual(['Bearer stale', 'Bearer fresh']);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('when the refresh fails, reports the session as expired and returns UNAUTHENTICATED', async () => {
    const seen = protectedEndpoint('never');
    const auth = fakeAuth({ current: 'stale', refreshTo: null });
    const onSessionExpired = vi.fn();
    const baseQuery = createBaseQueryWithReauth({ baseUrl: BASE, auth, onSessionExpired });

    const result = await baseQuery('/protected', fakeApi(), {});

    expect(result.error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(auth.refreshCalls).toBe(1);
    expect(seen).toHaveLength(1); // no retry without a new token
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('when the retry is still 401 after a successful refresh, reports the session as expired (no loop)', async () => {
    const seen = protectedEndpoint('never');
    const auth = fakeAuth({ current: 'stale', refreshTo: 'also-bad' });
    const onSessionExpired = vi.fn();
    const baseQuery = createBaseQueryWithReauth({ baseUrl: BASE, auth, onSessionExpired });

    const result = await baseQuery('/protected', fakeApi(), {});

    expect(result.error).toMatchObject({ status: 401 });
    expect(seen).toHaveLength(2);
    expect(auth.refreshCalls).toBe(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh between concurrent 401s', async () => {
    protectedEndpoint('fresh');
    const auth = fakeAuth({ current: 'stale', refreshTo: 'fresh' });
    const baseQuery = createBaseQueryWithReauth({ baseUrl: BASE, auth, onSessionExpired: vi.fn() });

    const results = await Promise.all([1, 2, 3].map(() => baseQuery('/protected', fakeApi(), {})));

    expect(results.every((r) => r.data)).toBe(true);
    expect(auth.refreshCalls).toBe(1);
  });

  it('does not try a refresh when no token was sent (signed out)', async () => {
    protectedEndpoint('good');
    const auth = fakeAuth({ current: null, refreshTo: 'x' });
    const onSessionExpired = vi.fn();
    const baseQuery = createBaseQueryWithReauth({ baseUrl: BASE, auth, onSessionExpired });

    const result = await baseQuery('/protected', fakeApi(), {});

    expect(result.error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(auth.refreshCalls).toBe(0);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('normalises catalogue errors, 5xx and network failures to { code, message }', async () => {
    server.use(
      http.post(`${BASE}/conflict`, () =>
        HttpResponse.json({ error: { code: 'DUPLICATE_REFERENCE', message: 'dup' } }, { status: 409 }),
      ),
      http.post(`${BASE}/invalid`, () =>
        HttpResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'bad', details: { phone: 'Invalid phone' } } }, { status: 400 }),
      ),
      http.get(`${BASE}/boom`, () => new HttpResponse('<html>proxy error</html>', { status: 502 })),
      http.get(`${BASE}/offline`, () => HttpResponse.error()),
    );
    const baseQuery = createBaseQueryWithReauth({ baseUrl: BASE, auth: fakeAuth({ current: 't', refreshTo: null }), onSessionExpired: vi.fn() });

    expect((await baseQuery({ url: '/conflict', method: 'POST' }, fakeApi(), {})).error).toEqual({ status: 409, code: 'DUPLICATE_REFERENCE', message: 'dup' });
    expect((await baseQuery({ url: '/invalid', method: 'POST' }, fakeApi(), {})).error).toEqual({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'bad',
      details: { phone: 'Invalid phone' },
    });
    expect((await baseQuery('/boom', fakeApi(), {})).error).toMatchObject({ status: 502, code: 'INTERNAL' });
    expect((await baseQuery('/offline', fakeApi(), {})).error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
