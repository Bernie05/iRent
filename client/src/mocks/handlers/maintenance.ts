import { http, HttpResponse } from 'msw';
import type { MaintenanceRequest, MaintenanceStatus, PhotoUrls } from '../../types/api';
import { maintenanceRequestSchema, maintenanceUpdateSchema, MAX_MAINTENANCE_PHOTOS, NEXT_STATUSES } from '../../validation/maintenance';
import { placeholderImage } from '../fixtures';
import { activeTenancyOf, db, nextId, notifyMaintenance, nowIso, toMaintenance, type MaintenanceRec } from '../db';
import { apiError, apiUrl, authorise, isResponse, latency, MAX_FILE_BYTES, validationError } from '../http';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DAY_MS = 86_400_000;
const RATE_LIMIT = 5; // R74: 5 new requests per 24 h per renter

/** R75 order: Submitted, then In progress, then the rest; within each, Urgent first, then oldest first. */
const GROUP: Record<MaintenanceStatus, number> = { submitted: 0, in_progress: 1, done: 2, declined: 2 };
const byR75 = (a: MaintenanceRec, b: MaintenanceRec) =>
  GROUP[a.status] - GROUP[b.status] || Number(b.urgency === 'urgent') - Number(a.urgency === 'urgent') || a.created_at.localeCompare(b.created_at);

/** Placeholder "signed URLs" (the mock stores data URLs; the server signs storage paths for 5 minutes). */
const photos = (m: MaintenanceRec) => HttpResponse.json<PhotoUrls>({ urls: m.photos });

/** Maintenance requests (D-26, B43): renter create/list/photos, admin list/update/photos. */
export const maintenanceHandlers = [
  http.get(apiUrl('/me/maintenance-requests'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    const own = db.maintenance.filter((m) => m.renter_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return HttpResponse.json<MaintenanceRequest[]>(own.map((m) => toMaintenance(m)));
  }),

  http.post(apiUrl('/me/maintenance-requests'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    const tenancy = activeTenancyOf(user.id);
    if (!tenancy) return apiError(409, 'NO_ACTIVE_TENANCY', 'You can send requests while you rent a bed.');
    const since = Date.now() - DAY_MS;
    if (db.maintenance.filter((m) => m.renter_id === user.id && Date.parse(m.created_at) > since).length >= RATE_LIMIT) {
      return apiError(429, 'RATE_LIMITED', "You've sent several requests today. Please wait or message the owner.");
    }
    // Several files under one key ("photos"), so read the form here (no `instanceof File`: jsdom and Node differ).
    const form = await request.formData();
    const files = form.getAll('photos').filter((v): v is File => typeof v !== 'string');
    if (files.length > MAX_MAINTENANCE_PHOTOS) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { photos: 'validation:tooManyPhotos' });
    if (files.some((f) => f.size > MAX_FILE_BYTES)) return apiError(413, 'FILE_TOO_LARGE', 'The file must be 5 MB or smaller.');
    if (files.some((f) => !IMAGE_TYPES.includes(f.type))) return apiError(400, 'INVALID_FILE_TYPE', 'The file must be a JPEG, PNG or WebP image.');
    const parsed = maintenanceRequestSchema.safeParse({
      category: form.get('category') ?? undefined,
      urgency: form.get('urgency') || undefined,
      description: form.get('description') ?? '',
    });
    if (!parsed.success) return validationError(parsed.error);
    const now = nowIso();
    const rec: MaintenanceRec = {
      id: nextId('mr'),
      renter_id: user.id,
      tenancy_id: tenancy.id,
      ...parsed.data,
      status: 'submitted',
      admin_note: null,
      decline_reason: null,
      photos: files.map((p) => placeholderImage(p.name)),
      created_at: now,
      status_changed_at: now,
      updated_at: now,
    };
    db.maintenance.push(rec);
    notifyMaintenance(db, rec, 'maintenance_new'); // after the insert; an email failure would never fail the request
    return HttpResponse.json<MaintenanceRequest>(toMaintenance(rec), { status: 201 });
  }),

  http.get(apiUrl('/me/maintenance-requests/:id/photos'), ({ request, params }) => {
    const user = authorise(request, 'renter');
    if (isResponse(user)) return user;
    const m = db.maintenance.find((x) => x.id === params.id && x.renter_id === user.id);
    return m ? photos(m) : apiError(404, 'NOT_FOUND', 'Request not found.');
  }),

  http.get(apiUrl('/maintenance-requests'), async ({ request }) => {
    await latency();
    const user = authorise(request, 'admin');
    if (isResponse(user)) return user;
    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? 'all';
    const category = url.searchParams.get('category');
    const rows = db.maintenance
      .filter((m) => status === 'all' || (status === 'open' ? m.status === 'submitted' || m.status === 'in_progress' : m.status === status))
      .filter((m) => !category || m.category === category)
      .sort(byR75);
    return HttpResponse.json<MaintenanceRequest[]>(rows.map((m) => toMaintenance(m, true)));
  }),

  http.patch(apiUrl('/maintenance-requests/:id'), async ({ request, params }) => {
    await latency();
    const user = authorise(request, 'admin');
    if (isResponse(user)) return user;
    const m = db.maintenance.find((x) => x.id === params.id);
    if (!m) return apiError(404, 'NOT_FOUND', 'Request not found.');
    const parsed = maintenanceUpdateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    const { status, admin_note, decline_reason } = parsed.data;
    if (status && status !== m.status && !NEXT_STATUSES[m.status].includes(status)) {
      return apiError(409, 'INVALID_STATUS_CHANGE', 'This status change is not allowed.');
    }
    const now = nowIso();
    if (admin_note !== undefined) m.admin_note = admin_note;
    if (status && status !== m.status) {
      Object.assign(m, { status, status_changed_at: now, decline_reason: status === 'declined' ? decline_reason : null });
      if (status === 'done' || status === 'declined') notifyMaintenance(db, m, status === 'done' ? 'maintenance_done' : 'maintenance_declined');
    }
    m.updated_at = now;
    return HttpResponse.json<MaintenanceRequest>(toMaintenance(m, true));
  }),

  http.get(apiUrl('/maintenance-requests/:id/photos'), ({ request, params }) => {
    const user = authorise(request, 'admin');
    if (isResponse(user)) return user;
    const m = db.maintenance.find((x) => x.id === params.id);
    return m ? photos(m) : apiError(404, 'NOT_FOUND', 'Request not found.');
  }),
];
