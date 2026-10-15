import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import type { AdminPromotions, Promotion } from '../../types/api';
import { PROMO_STOCK } from '../../lib/demoPhotos';
import { promoStatus } from '../../lib/promotions';
import { promotionSchema } from '../../validation/admin';
import { placeholderImage } from '../fixtures';
import { db, nextId, nowIso, type PromoRec } from '../db';
import { apiError, apiUrl, authorise, checkUpload, isResponse, latency, noContent, readMultipart, validationError } from '../http';

/**
 * Proposed promotions endpoints (DESIGN.md → Proposed contract additions), mock-only:
 * public GET /promotions/active; admin GET /promotions, PUT /promotions/section, POST, PATCH /:id, DELETE /:id, PUT /promotions/order.
 */
const admin = (request: Request) => authorise(request, 'admin');
const sorted = () => [...db.promotions].sort((a, b) => a.position - b.position);
const toPublic = ({ visible: _v, position: _p, created_at: _c, ...p }: PromoRec): Promotion => p;
const toAdmin = ({ created_at: _c, ...p }: PromoRec): Promotion => p;
const adminList = (): AdminPromotions => ({ section_visible: db.promoSection, items: sorted().map(toAdmin) });
const renumber = () => sorted().forEach((p, i) => (p.position = i + 1));

/** Multipart (or JSON) promo body → validated fields + image_url, or the error response. */
async function readPromo(request: Request, current?: PromoRec) {
  const { fields, files } = await readMultipart(request);
  const uploadError = checkUpload(files.image, false);
  if (uploadError) return uploadError;
  const parsed = promotionSchema.safeParse({ ...fields, visible: fields.visible === 'true' });
  if (!parsed.success) return validationError(parsed.error);
  let image_url = current?.image_url ?? null;
  if (files.image) image_url = placeholderImage('Promo image (upload)');
  else if (fields.image_url !== undefined) {
    if (fields.image_url && !PROMO_STOCK.some((s) => s.url === fields.image_url)) return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { image_url: 'Unknown image' });
    image_url = fields.image_url || null;
  }
  const p = parsed.data;
  return {
    title: p.title,
    description: p.description ?? null,
    badge: p.badge ?? null,
    image_url,
    cta_action: p.cta_action,
    cta_label: p.cta_action === 'none' ? null : (p.cta_label ?? null),
    cta_section: p.cta_action === 'section' ? (p.cta_section ?? null) : null,
    starts_on: p.starts_on ?? null,
    ends_on: p.ends_on ?? null,
    visible: p.visible,
  };
}

export const promotionHandlers = [
  http.get(apiUrl('/promotions/active'), async () => {
    await latency();
    const today = db.today();
    const items = db.promoSection ? sorted().filter((p) => promoStatus(p, today) === 'visible').map(toPublic) : [];
    return HttpResponse.json<Promotion[]>(items);
  }),

  http.get(apiUrl('/promotions'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    return HttpResponse.json<AdminPromotions>(adminList());
  }),

  http.put(apiUrl('/promotions/section'), async ({ request }) => {
    const user = admin(request);
    if (isResponse(user)) return user;
    const parsed = z.object({ visible: z.boolean() }).safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return validationError(parsed.error);
    db.promoSection = parsed.data.visible;
    return HttpResponse.json<AdminPromotions>(adminList());
  }),

  http.put(apiUrl('/promotions/order'), async ({ request }) => {
    const user = admin(request);
    if (isResponse(user)) return user;
    const parsed = z.object({ ids: z.array(z.string()) }).safeParse(await request.json().catch(() => ({})));
    const ids = parsed.success ? parsed.data.ids : [];
    if (ids.length !== db.promotions.length || new Set(ids).size !== ids.length || ids.some((id) => !db.promotions.some((p) => p.id === id))) {
      return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { ids: 'Send every promotion id once' });
    }
    ids.forEach((id, i) => (db.promotions.find((p) => p.id === id)!.position = i + 1));
    return HttpResponse.json<AdminPromotions>(adminList());
  }),

  http.post(apiUrl('/promotions'), async ({ request }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const body = await readPromo(request);
    if (isResponse(body)) return body;
    const rec: PromoRec = { id: nextId('promo'), ...body, position: db.promotions.length + 1, created_at: nowIso() };
    db.promotions.push(rec);
    return HttpResponse.json<Promotion>(toAdmin(rec), { status: 201 });
  }),

  http.patch(apiUrl('/promotions/:id'), async ({ request, params }) => {
    await latency();
    const user = admin(request);
    if (isResponse(user)) return user;
    const rec = db.promotions.find((p) => p.id === params.id);
    if (!rec) return apiError(404, 'NOT_FOUND', 'Promotion not found.');
    const body = await readPromo(request, rec);
    if (isResponse(body)) return body;
    Object.assign(rec, body);
    return HttpResponse.json<Promotion>(toAdmin(rec));
  }),

  http.delete(apiUrl('/promotions/:id'), ({ request, params }) => {
    const user = admin(request);
    if (isResponse(user)) return user;
    if (!db.promotions.some((p) => p.id === params.id)) return apiError(404, 'NOT_FOUND', 'Promotion not found.');
    db.promotions = db.promotions.filter((p) => p.id !== params.id);
    renumber();
    return noContent();
  }),
];
