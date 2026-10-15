import { http, HttpResponse } from 'msw';
import type { ErrorCode } from '../types/api';
import { env } from '../config/env';
import { db, resetDb } from './db';

/**
 * Scenario controls for the mocks, for exercising error states by hand (in the browser console as
 * `window.__irentMocks`) or in tests. For one-off test overrides, `server.use(...)` also works.
 *
 *   __irentMocks.failNext('POST', '/inquiries', 429, 'RATE_LIMITED')
 *   __irentMocks.failNext('GET', '/beds/available', 500, 'INTERNAL', { times: Infinity })
 *   __irentMocks.networkError('GET', '/me/balance')
 *   __irentMocks.expireSessions()   // every access token → 401 (exercises the R14 refresh flow)
 *   __irentMocks.revokeRefresh()    // refresh fails too → session expired
 *   __irentMocks.emptyBeds()        // every bed occupied → rate cards empty state
 *   __irentMocks.setToday('2026-10-02')
 *   __irentMocks.reset()
 */
interface Override {
  method: string;
  path: string;
  remaining: number;
  respond: () => Response;
}

const overrides: Override[] = [];

function add(method: string, path: string, respond: () => Response, times: number) {
  overrides.push({ method: method.toUpperCase(), path, remaining: times, respond });
}

export const mockControl = {
  failNext(method: string, path: string, status: number, code: ErrorCode, options: { times?: number; message?: string } = {}) {
    add(method, path, () => HttpResponse.json({ error: { code, message: options.message ?? code } }, { status }), options.times ?? 1);
  },
  networkError(method: string, path: string, options: { times?: number } = {}) {
    add(method, path, () => HttpResponse.error(), options.times ?? 1);
  },
  expireSessions() {
    db.accessTokens.clear();
  },
  revokeRefresh() {
    db.refreshTokens.clear();
  },
  emptyBeds() {
    db.beds.forEach((b) => {
      if (b.status === 'vacant') b.status = 'reserved';
    });
  },
  setToday(date: string) {
    db.today = () => date;
  },
  clearOverrides() {
    overrides.length = 0;
  },
  reset() {
    overrides.length = 0;
    resetDb();
  },
};

/** Must be the FIRST handler: answers forced errors, otherwise falls through to the real handlers. */
export const controlHandler = http.all(`${env.apiUrl}/*`, ({ request }) => {
  const url = new URL(request.url);
  const apiPath = new URL(env.apiUrl, url.origin).pathname;
  const path = url.pathname.slice(apiPath.length);
  const index = overrides.findIndex((o) => o.method === request.method && o.path === path);
  if (index === -1) return undefined;
  const override = overrides[index];
  override.remaining -= 1;
  if (override.remaining <= 0) overrides.splice(index, 1);
  return override.respond();
});
