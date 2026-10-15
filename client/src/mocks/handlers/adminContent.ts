import { http, HttpResponse } from 'msw';
import type { Announcement, GreetingSettings, Inquiry, Settings, ViewingResult } from '../../types/api';
import { announcementSchema, greetingSchema, inquiryStatusSchema, scheduleViewingSchema, settingsSchema } from '../../validation/admin';
import { placeholderImage } from '../fixtures';
import { announcementStatus, byCustomOrder, topPosition, db, nextId, nowIso, publishAnnouncements, toAnnouncement, type AnnouncementRec, notifyViewing, toInquiry } from '../db';
import { apiError, apiUrl, authorise, checkUpload, isResponse, latency, noContent, readMultipart, validationError } from '../http';

const admin = (request: Request) => authorise(request, 'admin');

function parseAnnouncementFields(fields: Record<string, string>, options?: Parameters<typeof announcementSchema>[0]) {
  return announcementSchema(options).safeParse({
    title: fields.title,
    body: fields.body,
    priority: fields.priority,
    pinned: fields.pinned === 'true',
    send_email: fields.send_email === 'true',
    kind: fields.kind,
    starts_on: fields.starts_on,
    ends_on: fields.ends_on,
    start_time: fields.start_time,
    end_time: fields.end_time,
    publish_at: fields.publish_at,
  });
}

/** D-25 columns from parsed fields (general → all null). */
const windowOf = (d: { starts_on?: string; ends_on?: string; start_time?: string; end_time?: string }) => ({
  starts_on: d.starts_on ?? null,
  ends_on: d.ends_on ?? null,
  start_time: d.start_time ?? null,
  end_time: d.end_time ?? null,
});

/** Admin rows in the custom order (D-30). */
const adminAnnouncements = () => [...db.announcements].sort(byCustomOrder).map((a) => toAnnouncement(a));

/** Inquiries, announcements and settings (B12, B21, B14). */
export const adminContentHandlers = [
  // ----- Inquiries -----
  http.get(apiUrl('/inquiries'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const status = new URL(request.url).searchParams.get('status');
    const rows = db.inquiries
      .filter((i) => !status || i.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return HttpResponse.json<Inquiry[]>(rows.map(toInquiry));
  }),

  http.patch(apiUrl('/inquiries/:id'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const inquiry = db.inquiries.find((i) => i.id === params.id);
    if (!inquiry) return apiError(404, 'NOT_FOUND', 'Inquiry not found.');
    const body = (await request.json()) as { status?: unknown };
    const parsed = inquiryStatusSchema.safeParse(body.status);
    if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { status: 'Invalid status' });
    inquiry.status = parsed.data;
    inquiry.updated_at = nowIso();
    return HttpResponse.json<Inquiry>(toInquiry(inquiry));
  }),

  // ----- Proposed: viewings (schedule, reschedule, cancel) with mock emails -----
  http.patch(apiUrl('/inquiries/:id/schedule'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const inquiry = db.inquiries.find((i) => i.id === params.id);
    if (!inquiry) return apiError(404, 'NOT_FOUND', 'Inquiry not found.');
    const body = (await request.json().catch(() => ({}))) as { scheduled_at?: unknown; note?: unknown };
    const at = typeof body.scheduled_at === 'string' ? body.scheduled_at : '';
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):00\+08:00$/.exec(at);
    const parsed = scheduleViewingSchema(() => db.today()).safeParse({ date: m?.[1] ?? '', time: m?.[2] ?? '', note: body.note });
    if (!m || !parsed.success) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { scheduled_at: 'Use a slot from 08:00 to 19:00, today or later' });
    const rescheduled = inquiry.status === 'scheduled' && inquiry.scheduled_at !== null;
    Object.assign(inquiry, { status: 'scheduled', scheduled_at: at, schedule_note: parsed.data.note ?? null, updated_at: nowIso() });
    const notified = notifyViewing(db, inquiry, rescheduled ? 'viewing_reschedule' : 'viewing_confirmation', rescheduled ? 'Your viewing was moved' : 'Your viewing is confirmed');
    return HttpResponse.json<ViewingResult>({ inquiry: toInquiry(inquiry), notified });
  }),

  // Cancel: back to "contacted" so the admin can follow up; both sides get a cancellation email.
  http.delete(apiUrl('/inquiries/:id/schedule'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const inquiry = db.inquiries.find((i) => i.id === params.id);
    if (!inquiry) return apiError(404, 'NOT_FOUND', 'Inquiry not found.');
    if (!inquiry.scheduled_at) return apiError(409, 'NOT_SCHEDULED', 'This inquiry has no scheduled viewing.');
    const notified = notifyViewing(db, inquiry, 'viewing_cancellation', 'Your viewing was cancelled');
    Object.assign(inquiry, { status: 'contacted', scheduled_at: null, schedule_note: null, updated_at: nowIso() });
    return HttpResponse.json<ViewingResult>({ inquiry: toInquiry(inquiry), notified });
  }),

  // ----- Announcements -----
  http.get(apiUrl('/announcements'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    publishAnnouncements(db); // ponytail: the mock runs the BR-18 job on reads; the server runs it every 5 minutes.
    return HttpResponse.json<Announcement[]>(adminAnnouncements());
  }),

  // D-30: the full id list in the new order (pinned ones first); a stale set or a pinned id after an unpinned one → 400 (E75).
  http.put(apiUrl('/announcements/order'), async ({ request }) => {
    const user = admin(request);
    if (isResponse(user)) return user;
    const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const recs = ids.map((id) => db.announcements.find((a) => a.id === id));
    const exact = ids.length === db.announcements.length && new Set(ids).size === ids.length && recs.every(Boolean);
    if (!exact || recs.some((a, i) => i > 0 && a!.pinned && !recs[i - 1]!.pinned)) {
      return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { ids: 'Send every announcement id once, pinned ones first' });
    }
    recs.forEach((a, i) => (a!.position = i + 1));
    return HttpResponse.json<Announcement[]>(adminAnnouncements());
  }),

  http.post(apiUrl('/announcements'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const { fields, files } = await readMultipart(request);
    const uploadError = checkUpload(files.image, false);
    if (uploadError) return uploadError;
    const parsed = parseAnnouncementFields(fields);
    if (!parsed.success) return validationError(parsed.error);
    const now = nowIso();
    const { send_email, image: _image, publish_at, kind, title, body, priority, pinned } = parsed.data;
    // BR-18: email now when published now; a scheduled one only flags the email for the publish job.
    const scheduled = Boolean(publish_at);
    const rec: AnnouncementRec = {
      id: nextId('ann'),
      title,
      body,
      priority,
      pinned,
      kind,
      ...windowOf(parsed.data),
      image_url: files.image ? placeholderImage('Announcement image') : null,
      emailed_at: send_email && !scheduled ? now : null,
      publish_at: publish_at ?? now,
      email_pending: send_email && scheduled,
      position: topPosition(), // D-30: new posts go to the top of their group
      schedule_event_id: null,
      created_at: now,
      updated_at: now,
    };
    db.announcements.push(rec);
    return HttpResponse.json<Announcement>(toAnnouncement(rec), { status: 201 });
  }),

  http.patch(apiUrl('/announcements/:id'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const rec = db.announcements.find((a) => a.id === params.id);
    if (!rec) return apiError(404, 'NOT_FOUND', 'Announcement not found.');
    const { fields, files } = await readMultipart(request);
    const uploadError = checkUpload(files.image, false);
    if (uploadError) return uploadError;
    // R73: Publish at is editable while scheduled ("" = publish now); after publishing it is read-only.
    const wasScheduled = announcementStatus(rec) === 'scheduled';
    if (!wasScheduled && fields.publish_at !== undefined && Date.parse(fields.publish_at) !== Date.parse(rec.publish_at)) {
      return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { publish_at: 'validation:dateInvalid' });
    }
    const parsed = parseAnnouncementFields(fields, { creating: false, checkPublishAt: wasScheduled });
    if (!parsed.success) return validationError(parsed.error);
    const { send_email, image: _image, publish_at, kind, title, body, priority, pinned } = parsed.data;
    const now = nowIso();
    if (pinned !== rec.pinned) rec.position = topPosition(); // D-30: (un)pinning moves it to the top of its new group
    const nextPublishAt = !wasScheduled ? rec.publish_at : fields.publish_at === '' ? now : (publish_at ?? rec.publish_at);
    const scheduled = Date.parse(nextPublishAt) > Date.now();
    Object.assign(
      rec,
      { title, body, priority, pinned, kind, ...windowOf(parsed.data), publish_at: nextPublishAt, updated_at: now },
      // BR-18 / E66: while scheduled the tick only (un)flags the pending email; once published it sends now, as before.
      { email_pending: scheduled && send_email },
      !scheduled && send_email ? { emailed_at: now } : {},
      files.image ? { image_url: placeholderImage('Announcement image') } : {},
    );
    return HttpResponse.json<Announcement>(toAnnouncement(rec));
  }),

  http.delete(apiUrl('/announcements/:id'), ({ request, params }) => {
    const user = admin(request);
    if (isResponse(user)) return user;
    if (!db.announcements.some((a) => a.id === params.id)) return apiError(404, 'NOT_FOUND', 'Announcement not found.');
    db.announcements = db.announcements.filter((a) => a.id !== params.id);
    // A linked notice: the schedule item stays, its "Post to renters" turns off.
    for (const e of db.scheduleEvents) if (e.announcement_id === params.id) e.announcement_id = null;
    return noContent();
  }),

  // ----- Settings -----
  http.get(apiUrl('/settings'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    return HttpResponse.json<Settings>(structuredClone(db.settings));
  }),

  http.put(apiUrl('/settings'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const { fields, files } = await readMultipart(request);
    for (const key of ['qr_gcash', 'qr_maya', 'qr_bpi']) {
      const uploadError = checkUpload(files[key], false);
      if (uploadError) return uploadError;
    }
    let parsedJson: unknown;
    try {
      parsedJson = {
        reminders_enabled: fields.reminders_enabled === 'true',
        reminder_types: JSON.parse(fields.reminder_types ?? '[]'),
        payment_accounts: JSON.parse(fields.payment_accounts ?? '[]'),
      };
    } catch {
      return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { _form: 'Malformed JSON field' });
    }
    const parsed = settingsSchema.safeParse(parsedJson);
    if (!parsed.success) return validationError(parsed.error);
    const previous = new Map(db.settings.payment_accounts.map((a) => [a.method, a.qr_url]));
    db.settings = {
      reminders_enabled: parsed.data.reminders_enabled,
      reminder_types: parsed.data.reminder_types,
      payment_accounts: parsed.data.payment_accounts.map((a) => ({
        ...a,
        qr_url: files[`qr_${a.method}`] ? placeholderImage(`${a.method} QR (uploaded)`) : (previous.get(a.method) ?? null),
      })),
      updated_at: nowIso(),
    };
    return HttpResponse.json<Settings>(structuredClone(db.settings));
  }),

  // ----- Proposed: birthday greeting template (image stored in public-media under greetings/) -----
  http.get(apiUrl('/settings/birthday-greeting'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    return HttpResponse.json<GreetingSettings>(structuredClone(db.greeting));
  }),

  http.put(apiUrl('/settings/birthday-greeting'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const { fields, files } = await readMultipart(request);
    const uploadError = checkUpload(files.image, false);
    if (uploadError) return uploadError;
    const parsed = greetingSchema.safeParse({ ...fields, enabled: fields.enabled === 'true' });
    if (!parsed.success) return validationError(parsed.error);
    const g = parsed.data;
    db.greeting = {
      enabled: g.enabled,
      title: g.title,
      message: g.message,
      link_label: g.link_label ?? null,
      link_url: g.link_url ?? null,
      image_url: files.image ? placeholderImage('Greeting image (upload)') : fields.remove_image === 'true' ? null : db.greeting.image_url,
      updated_at: nowIso(),
    };
    return HttpResponse.json<GreetingSettings>(structuredClone(db.greeting));
  }),
];
