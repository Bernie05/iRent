import { Router } from 'express';
import { createRequireAuth, requireRole } from '../middleware/auth.js';
import { meRouter } from './me.js';

/** Path prefixes that are admin-only (SPEC → Permissions). */
export const ADMIN_PREFIXES = [
  '/dashboard',
  '/beds',
  '/renters',
  '/tenancies',
  '/rent-charges',
  '/payments',
  '/bills',
  '/inquiries',
  '/announcements',
  '/settings',
];

/**
 * All /api routes.
 * Order matters:
 *   1. public routes (health; later B12 `GET /beds/available`, `POST /inquiries`, B13 forgot-password)
 *   2. `/me` (any logged-in user; `/me/*` renter-only)
 *   3. the admin guard on ADMIN_PREFIXES, then admin routes
 */
export function apiRouter({ supabase }) {
  const router = Router();
  const requireAuth = createRequireAuth({ supabase });

  // 1. Public
  router.get('/health', (_req, res) => res.json({ ok: true }));

  // 2. Any logged-in user
  router.use('/me', requireAuth, meRouter({ supabase }));

  // 3. Admin
  router.use(ADMIN_PREFIXES, requireAuth, requireRole('admin'));

  return router;
}
