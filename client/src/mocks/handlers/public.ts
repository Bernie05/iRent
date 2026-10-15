import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import type { AvailableRate, Health, Me } from '../../types/api';
import { inquirySchema } from '../../validation/public';
import { activeTenancyOf, bedById, db, money, nextId, nowIso, type ProfileRec } from '../db';
import { apiError, apiUrl, authorise, isResponse, latency, validationError } from '../http';

/** Builds the `Me` body (contract clarifications, 2026-09-26): `tenancy` is `null` for the admin
 *  and for a moved-out renter (OQ-6 = A, OQ-22), never omitted. */
function toMe(user: ProfileRec): Me {
  const tenancy = user.role === 'renter' ? activeTenancyOf(user.id) : undefined;
  const bed = tenancy ? bedById(tenancy.bed_id) : undefined;
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    language: user.language,
    tenancy:
      tenancy && bed
        ? { id: tenancy.id, bed: { label: bed.label, room: bed.room, bunk_type: bed.bunk_type, monthly_rate: money(bed.monthly_rate) }, move_in: tenancy.move_in }
        : null,
  };
}

/** Public endpoints (no auth), `/me` and `PATCH /me`. */
export const publicHandlers = [
  http.get(apiUrl('/health'), () => HttpResponse.json<Health>({ ok: true })),

  // E24: grouped by (bunk_type, monthly_rate), vacant beds only.
  http.get(apiUrl('/beds/available'), async () => {
    await latency();
    const groups = new Map<string, AvailableRate>();
    for (const bed of db.beds.filter((b) => b.status === 'vacant')) {
      const key = `${bed.bunk_type}:${bed.monthly_rate}`;
      const group = groups.get(key) ?? { bunk_type: bed.bunk_type, monthly_rate: money(bed.monthly_rate), vacant_count: 0 };
      group.vacant_count += 1;
      groups.set(key, group);
    }
    return HttpResponse.json<AvailableRate[]>([...groups.values()].sort((a, b) => a.bunk_type.localeCompare(b.bunk_type) || a.monthly_rate - b.monthly_rate));
  }),

  http.post(apiUrl('/inquiries'), async ({ request }) => {
    await latency();
    const parsed = inquirySchema(() => db.today()).safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const id = nextId('inq');
    const now = nowIso();
    db.inquiries.unshift({
      scheduled_at: null,
      schedule_note: null,
      id,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email ?? null,
      preferred_date: parsed.data.preferred_date ?? null,
      message: parsed.data.message ?? null,
      status: 'new',
      created_at: now,
      updated_at: now,
    });
    return HttpResponse.json({ id }, { status: 201 });
  }),

  // R50: always 202 with the same body, whether or not the account exists.
  http.post(apiUrl('/auth/forgot-password'), async ({ request }) => {
    await latency();
    const parsed = z.object({ email: z.email().max(254) }).safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    return HttpResponse.json({ ok: true }, { status: 202 });
  }),

  http.get(apiUrl('/me'), async ({ request }) => {
    await latency();
    const user = authorise(request);
    if (isResponse(user)) return user;
    return HttpResponse.json<Me>(toMe(user));
  }),

  http.patch(apiUrl('/me'), async ({ request }) => {
    const user = authorise(request);
    if (isResponse(user)) return user;
    const parsed = z.object({ language: z.enum(['en', 'fil']) }).safeParse(await request.json());
    if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { language: 'Must be en or fil' });
    user.language = parsed.data.language;
    return HttpResponse.json<Me>(toMe(user));
  }),
];
