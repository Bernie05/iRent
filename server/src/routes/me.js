import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../lib/validate.js';
import { mapDbError } from '../lib/dbErrors.js';
import { PROFILE_COLUMNS, requireRole } from '../middleware/auth.js';

const patchMeSchema = z.object({ language: z.enum(['en', 'fil']) }).strict();

/** Shape of GET /me (SPEC → API: Any logged-in user). */
export async function buildMe(supabase, profile) {
  const { data: tenancy, error } = await supabase
    .from('tenancies')
    .select('id, move_in, bed:beds(label, room, bunk_type, monthly_rate)')
    .eq('renter_id', profile.id)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw mapDbError(error);

  return {
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    role: profile.role,
    language: profile.language,
    tenancy: tenancy
      ? {
          id: tenancy.id,
          bed: {
            label: tenancy.bed.label,
            room: tenancy.bed.room,
            bunk_type: tenancy.bed.bunk_type,
            monthly_rate: Number(tenancy.bed.monthly_rate),
          },
          move_in: tenancy.move_in,
        }
      : null,
  };
}

/**
 * /me router. `GET /me` and `PATCH /me` are for any logged-in user.
 * Every other `/me/*` route (B16, B17, B14, B21) is renter-only: the guard below runs
 * before them, so an admin gets 403 even before those routes exist.
 * Mounted after requireAuth.
 */
export function meRouter({ supabase }) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      res.json(await buildMe(supabase, req.profile));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/', validate(patchMeSchema), async (req, res, next) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ language: req.body.language })
        .eq('id', req.user.id)
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw mapDbError(error);
      req.profile = data;
      res.json(await buildMe(supabase, data));
    } catch (err) {
      next(err);
    }
  });

  router.use(requireRole('renter'));
  // Renter-only /me/* routes are registered here by later tasks.

  return router;
}
