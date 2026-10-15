import { appError } from '../lib/errors.js';
import { mapDbError } from '../lib/dbErrors.js';
import { logger } from '../lib/logger.js';

export const PROFILE_COLUMNS =
  'id, full_name, email, phone, role, language, is_active, invited_at, activated_at';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

function bearerToken(req) {
  const header = req.get('authorization');
  if (!header) return undefined;
  const m = header.match(/^Bearer\s+([A-Za-z0-9._~+/=-]+)\s*$/i);
  return m ? m[1] : undefined;
}

/**
 * requireAuth (B5): verifies the Supabase access token with `auth.getUser`, loads the profile,
 * and on a renter's first authenticated request sets `activated_at` (R15, idempotent).
 * Sets `req.user = { id, role, language, email }` and `req.profile`.
 */
export function createRequireAuth({ supabase }) {
  return async function requireAuth(req, _res, next) {
    try {
      const token = bearerToken(req);
      if (!token) throw appError('UNAUTHENTICATED');

      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        // Auth service unreachable → 500, not a false "logged out".
        if (error && (error.status === 0 || error.status >= 500)) {
          const e = appError('INTERNAL');
          e.cause = error;
          throw e;
        }
        throw appError('UNAUTHENTICATED', 'Your session has expired. Please log in again.');
      }

      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', data.user.id)
        .maybeSingle();
      if (pErr) throw mapDbError(pErr);
      if (!profile) throw appError('UNAUTHENTICATED', 'This account is not set up.');
      if (profile.is_active === false) throw appError('FORBIDDEN', 'This account is disabled.');

      if (profile.role === 'renter' && !profile.activated_at) {
        const now = new Date().toISOString();
        const { data: updated, error: uErr } = await supabase
          .from('profiles')
          .update({ activated_at: now })
          .eq('id', profile.id)
          .is('activated_at', null)
          .select('activated_at');
        if (uErr) logger.warn('could not set activated_at', { userId: profile.id, err: uErr.message });
        else profile.activated_at = updated?.[0]?.activated_at ?? now;
      }

      req.profile = profile;
      req.user = { id: profile.id, role: profile.role, language: profile.language, email: profile.email };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** requireRole('admin') / requireRole('renter') → 403 FORBIDDEN for any other role. */
export function requireRole(...roles) {
  return function roleGuard(req, _res, next) {
    if (!req.user) return next(appError('UNAUTHENTICATED'));
    if (!roles.includes(req.user.role)) return next(appError('FORBIDDEN'));
    next();
  };
}

/** Tables whose rows belong to a renter through `tenancy_id → tenancies.renter_id`. */
const OWNED_THROUGH_TENANCY = new Set(['rent_charges', 'bill_shares', 'payments', 'notifications_log']);

/**
 * loadOwned (D-8): load `table` row `id` only if it belongs to `renterId`.
 * Another renter's row, an unknown id and a malformed id all give 404 NOT_FOUND.
 */
export async function loadOwned(supabase, table, id, renterId, columns = '*') {
  if (!isUuid(id) || !isUuid(renterId)) throw appError('NOT_FOUND');

  let query;
  if (table === 'tenancies') {
    query = supabase.from('tenancies').select(columns).eq('id', id).eq('renter_id', renterId);
  } else if (table === 'credit_ledger') {
    query = supabase.from('credit_ledger').select(columns).eq('id', id).eq('renter_id', renterId);
  } else if (OWNED_THROUGH_TENANCY.has(table)) {
    query = supabase
      .from(table)
      .select(`${columns}, owner_tenancy:tenancies!inner(renter_id)`)
      .eq('id', id)
      .eq('owner_tenancy.renter_id', renterId);
  } else {
    throw new Error(`loadOwned: unsupported table ${table}`);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw mapDbError(error);
  if (!data) throw appError('NOT_FOUND');
  if ('owner_tenancy' in data) delete data.owner_tenancy;
  return data;
}
