import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import type { ScheduleEventResult, ScheduleFeed } from '../../types/api';
import { VIEWING_SLOTS } from '../../validation/admin';
import { db, manilaDateOf, nextId, notifyRenterEvent, nowIso, profileById, toInquiry, toScheduleEvent, topPosition, type AnnouncementRec, type ScheduleEventRec } from '../db';
import { apiError, apiUrl, authorise, isResponse, latency, validationError } from '../http';

/**
 * Proposed admin schedule (DESIGN.md → Proposed contract additions), mock-only:
 * GET /schedule?from&to (events + scheduled viewings), POST /schedule-events, PATCH/DELETE /schedule-events/:id.
 */
const admin = (request: Request) => authorise(request, 'admin');
const AT = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):00\+08:00$/;

const eventSchema = z
  .object({
    type: z.enum(['renter', 'other']),
    title: z.string().trim().min(2).max(120),
    starts_at: z.string().regex(AT),
    ends_at: z.string().regex(AT).nullable().optional(),
    all_day: z.boolean(),
    renter_id: z.string().nullable().optional(),
    note: z.string().trim().max(500).optional(),
    notify_renter: z.boolean(),
    post_to_renters: z.boolean().default(false),
    email_renters: z.boolean().default(false),
    maintenance_request_id: z.string().nullable().optional(),
  })
  .superRefine((e, ctx) => {
    const [, date, time] = AT.exec(e.starts_at) ?? [];
    if (!e.all_day && !VIEWING_SLOTS.includes(time ?? '')) ctx.addIssue({ code: 'custom', path: ['starts_at'], message: 'Use a 30-minute slot from 08:00 to 19:00' });
    if (e.ends_at) {
      const [, endDate] = AT.exec(e.ends_at) ?? [];
      if (e.all_day || endDate !== date || e.ends_at <= e.starts_at) ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'The end must be later the same day' });
    }
    if (e.type === 'renter' && !(e.renter_id && profileById(e.renter_id)?.role === 'renter')) ctx.addIssue({ code: 'custom', path: ['renter_id'], message: 'Pick a renter' });
    // The renter notice uses the note as its message and the item's time as its window.
    if (e.type === 'other' && e.post_to_renters) {
      if (!e.note) ctx.addIssue({ code: 'custom', path: ['note'], message: 'Add a note: renters see it as the message' });
      if (!e.all_day && !e.ends_at) ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'Add an end time: renters see the time window' });
    }
  });

/** Validated body → the stored fields (a renter id and the renter email opt-in only apply to renter schedules; the notice only to other items). */
async function readEvent(request: Request) {
  const parsed = eventSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError(parsed.error);
  const e = parsed.data;
  const renter = e.type === 'renter';
  return {
    event: {
      type: e.type,
      title: e.title,
      starts_at: e.all_day ? `${e.starts_at.slice(0, 10)}T00:00:00+08:00` : e.starts_at,
      ends_at: e.all_day ? null : (e.ends_at ?? null),
      all_day: e.all_day,
      renter_id: renter ? (e.renter_id ?? null) : null,
      note: e.note || null,
      notify_renter: renter && e.notify_renter,
    },
    post: !renter && e.post_to_renters,
    email: !renter && e.post_to_renters && e.email_renters,
    requestId: renter ? null : (e.maintenance_request_id ?? null),
  };
}

/**
 * "Post to renters": keeps the linked maintenance notice (R72) in step with the item: created (published now, emailed
 * once if asked), updated (title, note, date and times; never re-emailed) or removed. Returns whether renters were emailed.
 */
function syncNotice(rec: ScheduleEventRec, post: boolean, email: boolean): boolean {
  const linked = db.announcements.find((a) => a.id === rec.announcement_id);
  if (!post) {
    db.announcements = db.announcements.filter((a) => a !== linked);
    rec.announcement_id = null;
    return false;
  }
  const now = nowIso();
  const date = rec.starts_at.slice(0, 10);
  const fields = {
    kind: 'maintenance' as const,
    title: rec.title,
    body: rec.note ?? '',
    starts_on: date,
    ends_on: date,
    start_time: rec.all_day ? null : rec.starts_at.slice(11, 16),
    end_time: rec.ends_at?.slice(11, 16) ?? null,
    updated_at: now,
  };
  if (linked) {
    Object.assign(linked, fields);
    return false;
  }
  const notice: AnnouncementRec = {
    id: nextId('ann'),
    ...fields,
    image_url: null,
    priority: 'normal',
    pinned: false,
    emailed_at: email ? now : null,
    publish_at: now,
    email_pending: false,
    position: topPosition(),
    schedule_event_id: rec.id,
    created_at: now,
  };
  db.announcements.push(notice);
  rec.announcement_id = notice.id;
  return email;
}

export const scheduleHandlers = [
  http.get(apiUrl('/schedule'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const params = new URL(request.url).searchParams;
    const from = params.get('from') ?? '0000-01-01';
    const to = params.get('to') ?? '9999-12-31';
    const within = (iso: string) => manilaDateOf(iso) >= from && manilaDateOf(iso) <= to;
    const events = db.scheduleEvents.filter((e) => within(e.starts_at)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const viewings = db.inquiries.filter((i) => i.status === 'scheduled' && i.scheduled_at && within(i.scheduled_at));
    return HttpResponse.json<ScheduleFeed>({ events: events.map(toScheduleEvent), viewings: viewings.map(toInquiry) });
  }),

  http.post(apiUrl('/schedule-events'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const body = await readEvent(request);
    if (isResponse(body)) return body;
    // "Schedule fix": an open request without a scheduled fix; Submitted moves to In progress (no email, as with Start).
    const fixes = body.requestId ? db.maintenance.find((m) => m.id === body.requestId) : undefined;
    if (body.requestId && !fixes) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { maintenance_request_id: 'Pick a maintenance request' });
    if (fixes && (!['submitted', 'in_progress'].includes(fixes.status) || db.scheduleEvents.some((e) => e.maintenance_request_id === fixes.id))) {
      return apiError(409, 'FIX_NOT_SCHEDULABLE', 'This request is closed or already has a scheduled fix.');
    }
    const rec: ScheduleEventRec = { id: nextId('ev'), ...body.event, reminder_sent_for: null, created_at: nowIso(), announcement_id: null, maintenance_request_id: fixes?.id ?? null };
    db.scheduleEvents.push(rec);
    if (fixes?.status === 'submitted') Object.assign(fixes, { status: 'in_progress', status_changed_at: rec.created_at, updated_at: rec.created_at });
    const renters = syncNotice(rec, body.post, body.email);
    const renter = notifyRenterEvent(db, rec, 'event_confirmation');
    return HttpResponse.json<ScheduleEventResult>({ event: toScheduleEvent(rec), notified: { renter, renters } }, { status: 201 });
  }),

  // Full update (the request link is kept: set on create only). A renter who opted in gets a "changed" email (or a confirmation if they've just been opted in).
  http.patch(apiUrl('/schedule-events/:id'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const rec = db.scheduleEvents.find((e) => e.id === params.id);
    if (!rec) return apiError(404, 'NOT_FOUND', 'Schedule item not found.');
    const body = await readEvent(request);
    if (isResponse(body)) return body;
    const wasNotified = rec.notify_renter && rec.renter_id === body.event.renter_id;
    Object.assign(rec, body.event);
    const renters = syncNotice(rec, body.post, body.email);
    const renter = notifyRenterEvent(db, rec, wasNotified ? 'event_change' : 'event_confirmation');
    return HttpResponse.json<ScheduleEventResult>({ event: toScheduleEvent(rec), notified: { renter, renters } });
  }),

  // Deleting an item also deletes its renter notice and unlinks its request (the request keeps its status).
  http.delete(apiUrl('/schedule-events/:id'), ({ request, params }) => {
    const user = admin(request);
    if (isResponse(user)) return user;
    const rec = db.scheduleEvents.find((e) => e.id === params.id);
    if (!rec) return apiError(404, 'NOT_FOUND', 'Schedule item not found.');
    const renter = notifyRenterEvent(db, rec, 'event_cancellation');
    syncNotice(rec, false, false);
    db.scheduleEvents = db.scheduleEvents.filter((e) => e.id !== rec.id);
    return HttpResponse.json<ScheduleEventResult>({ event: null, notified: { renter, renters: false } });
  }),
];
