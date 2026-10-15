import { http, HttpResponse } from 'msw';
import { authUrl, latency } from '../http';
import { db, nextId, profileById, type ProfileRec } from '../db';

/**
 * Mocks of the Supabase Auth (GoTrue) endpoints that supabase-js calls, so the real client works
 * unchanged in mock mode: sign in, refresh, get/update user, logout.
 */
function user(p: ProfileRec) {
  return {
    id: p.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: p.email,
    email_confirmed_at: p.activated_at ?? p.invited_at,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: p.invited_at ?? '2026-07-01T00:00:00+08:00',
    updated_at: new Date().toISOString(),
  };
}

export function issueSession(p: ProfileRec) {
  const access = `mock-access.${p.id}.${nextId('t')}`;
  const refresh = `mock-refresh.${p.id}.${nextId('r')}`;
  db.accessTokens.set(access, p.id);
  db.refreshTokens.set(refresh, p.id);
  const expiresIn = 3600;
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: refresh,
    user: user(p),
  };
}

const authError = (status: number, errorCode: string, msg: string) =>
  HttpResponse.json({ code: status, error_code: errorCode, msg }, { status });

function bearerUser(request: Request): ProfileRec | undefined {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const id = db.accessTokens.get(token);
  return id ? profileById(id) : undefined;
}

export const supabaseAuthHandlers = [
  http.post(authUrl('/token'), async ({ request }) => {
    await latency();
    const grant = new URL(request.url).searchParams.get('grant_type');
    const body = (await request.json()) as Record<string, string>;
    if (grant === 'password') {
      const p = db.profiles.find((x) => x.email.toLowerCase() === String(body.email ?? '').toLowerCase());
      if (!p || p.password !== body.password) return authError(400, 'invalid_credentials', 'Invalid login credentials');
      return HttpResponse.json(issueSession(p));
    }
    if (grant === 'refresh_token') {
      const id = db.refreshTokens.get(body.refresh_token);
      const p = id ? profileById(id) : undefined;
      if (!p) return authError(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      db.refreshTokens.delete(body.refresh_token);
      return HttpResponse.json(issueSession(p));
    }
    return authError(400, 'unsupported_grant_type', 'Unsupported grant type');
  }),

  http.get(authUrl('/user'), ({ request }) => {
    const p = bearerUser(request);
    return p ? HttpResponse.json(user(p)) : authError(401, 'bad_jwt', 'invalid JWT');
  }),

  http.put(authUrl('/user'), async ({ request }) => {
    await latency();
    const p = bearerUser(request);
    if (!p) return authError(401, 'bad_jwt', 'invalid JWT');
    const body = (await request.json()) as { password?: string };
    if (body.password) {
      if (body.password.length < 8) return authError(422, 'weak_password', 'Password should be at least 8 characters.');
      p.password = body.password;
    }
    return HttpResponse.json(user(p));
  }),

  http.post(authUrl('/logout'), ({ request }) => {
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
    db.accessTokens.delete(token);
    return new HttpResponse(null, { status: 204 });
  }),
];
