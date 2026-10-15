/**
 * Helpers for the live suites (test/integration) that run against local Supabase
 * (`npm run db:start` + `npm run db:reset` at the repo root). They are skipped when
 * test/globalSetup.js could not reach Supabase.
 */
import { describe } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';

export const LIVE = process.env.SUPABASE_LIVE === '1';
export const describeLive = LIVE ? describe : describe.skip;

import { SERVER_CLIENT_OPTIONS as opts } from '../../src/lib/supabase.js';

export const serviceClient = () =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);

export const anonClient = (accessToken) =>
  createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    ...opts,
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  });

const short = () => randomUUID().slice(0, 8);
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

/** Create an auth user + profile and sign in. Returns { id, email, token }. */
export async function liveUser(sb, { role = 'renter', language = 'en', activated = true } = {}) {
  const email = `${role}-${short()}@irent.test`;
  const password = `Pw-${randomUUID()}1a`;
  const { user } = must(await sb.auth.admin.createUser({ email, password, email_confirm: true }));
  must(
    await sb.from('profiles').insert({
      id: user.id, full_name: `Live ${role} ${short()}`, email, phone: '09170000000', role, language,
      invited_at: new Date().toISOString(), activated_at: activated ? new Date().toISOString() : null,
    }),
  );
  const session = must(await anonClient().auth.signInWithPassword({ email, password })).session;
  return { id: user.id, email, token: session.access_token };
}

export async function liveBed(sb, { rate = 4500, bunk = 'lower' } = {}) {
  return must(
    await sb.from('beds').insert({ label: `Live bed ${short()}`, room: 'Room L', bunk_type: bunk, monthly_rate: rate }).select('id').single(),
  ).id;
}

export async function liveTenancy(sb, renterId, { moveIn = '2026-09-05' } = {}) {
  const bedId = await liveBed(sb);
  const t = must(await sb.from('tenancies').insert({ renter_id: renterId, bed_id: bedId, move_in: moveIn }).select('id').single());
  must(await sb.from('beds').update({ status: 'occupied' }).eq('id', bedId));
  return { tenancyId: t.id, bedId };
}

export async function liveCharge(sb, tenancyId, { amount = 4500, period = '2026-10-01', due = '2026-10-05' } = {}) {
  return must(
    await sb.from('rent_charges').insert({ tenancy_id: tenancyId, period, amount, due_date: due }).select('id').single(),
  ).id;
}

/** HS256 JWT (for expired / forged token tests). */
export function signJwt(payload, secret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export const uniqueRef = (p = 'LIVE') => `${p}-${short()}`.toUpperCase();
