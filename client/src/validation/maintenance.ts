import { z } from 'zod';
import { MAINTENANCE_CATEGORIES, MAINTENANCE_URGENCIES, type MaintenanceStatus } from '../types/api';
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES, V } from './common';

export const MAX_MAINTENANCE_PHOTOS = 3;

/** R74 new request: category and urgency from the lists, description 10–1,000 (trimmed). Photos are checked apart. */
export const maintenanceRequestSchema = z.object({
  category: z.enum(MAINTENANCE_CATEGORIES, { error: V.choiceRequired }),
  urgency: z.enum(MAINTENANCE_URGENCIES, { error: V.choiceRequired }).default('normal'),
  description: z.string().trim().min(10, { error: V.requestDescriptionLength }).max(1000, { error: V.requestDescriptionLength }),
});

/** R74 photos: at most 3, JPG/PNG/WebP, ≤ 5 MB each. Returns the validation key, or null when fine. */
export function photosError(files: readonly { type: string; size: number }[]): string | null {
  if (files.length > MAX_MAINTENANCE_PHOTOS) return V.tooManyPhotos;
  if (files.some((f) => !(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(f.type) || f.size > MAX_UPLOAD_BYTES)) return V.photoInvalid;
  return null;
}

/** BR-19: allowed status changes (admin only); done and declined are final. */
export const NEXT_STATUSES: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  submitted: ['in_progress', 'done', 'declined'],
  in_progress: ['done', 'declined'],
  done: [],
  declined: [],
};

/** R75 admin update: optional status, note ≤ 500 ("" or null clears), decline reason 1–500 required with `declined`. */
export const maintenanceUpdateSchema = z
  .object({
    status: z.enum(['submitted', 'in_progress', 'done', 'declined']).optional(),
    admin_note: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(500, { error: V.noteTooLong }).nullable().optional()),
    decline_reason: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().min(1, { error: V.reasonLength }).max(500, { error: V.reasonLength }).optional()),
  })
  .refine((u) => u.status !== 'declined' || Boolean(u.decline_reason), { path: ['decline_reason'], error: V.reasonLength });
