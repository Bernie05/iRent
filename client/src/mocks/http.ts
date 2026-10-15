import { HttpResponse, delay } from 'msw';
import type { ZodError } from 'zod';
import { env } from '../config/env';
import type { ApiErrorBody, ErrorCode, Role } from '../types/api';
import { db, profileById, type ProfileRec } from './db';

/** Full URL of an API path, matching however `VITE_API_URL` is configured. */
export const apiUrl = (path: string) => `${env.apiUrl}${path}`;
export const authUrl = (path: string) => `${env.supabaseUrl}/auth/v1${path}`;

/** Small latency in the browser so loading states are visible; none in tests. */
export async function latency(): Promise<void> {
  if (!env.isTest) await delay(350);
}

export function apiError(status: number, code: ErrorCode, message: string, details?: Record<string, string>) {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  return HttpResponse.json(body, { status });
}

export function validationError(error: ZodError) {
  const details: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_form';
    if (!(key in details)) details[key] = issue.message;
  }
  return apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details);
}

export const noContent = () => new HttpResponse(null, { status: 204 });

/** Resolves the Bearer token to a mock user. */
export function currentUser(request: Request): ProfileRec | null {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = token ? db.accessTokens.get(token) : undefined;
  return userId ? (profileById(userId) ?? null) : null;
}

/** requireAuth + requireRole: returns the user, or the 401/403 response to send. */
export function authorise(request: Request, role?: Role): ProfileRec | Response {
  const user = currentUser(request);
  if (!user) return apiError(401, 'UNAUTHENTICATED', 'Missing, invalid or expired token.');
  // D-15(c): a disabled account is 403 on every authenticated route, including GET /me.
  if (!user.is_active) return apiError(403, 'FORBIDDEN', 'This account is disabled.');
  if (role && user.role !== role) return apiError(403, 'FORBIDDEN', 'You do not have access to this resource.');
  if (user.role === 'renter' && user.activated_at === null) user.activated_at = new Date().toISOString(); // R15
  return user;
}

export const isResponse = (value: unknown): value is Response => value instanceof Response;

/** Reads a multipart body into plain string fields and file-like parts (no `instanceof File`: jsdom and Node differ). */
export interface FilePart {
  name: string;
  type: string;
  size: number;
}
export async function readMultipart(request: Request): Promise<{ fields: Record<string, string>; files: Record<string, FilePart> }> {
  const fields: Record<string, string> = {};
  const files: Record<string, FilePart> = {};
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    // Tolerate JSON bodies so the handlers can also be driven by plain fetch calls.
    if (contentType.includes('application/json')) {
      const json = (await request.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(json)) fields[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return { fields, files };
  }
  const form = await request.formData();
  form.forEach((value, key) => {
    if (typeof value === 'string') fields[key] = value;
    else files[key] = { name: value.name, type: value.type, size: value.size };
  });
  return { fields, files };
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Mirrors the server upload middleware: 413 over 5 MB, 400 for anything but jpeg/png/webp. */
export function checkUpload(file: FilePart | undefined, required: boolean): Response | null {
  if (!file) return required ? apiError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', { proof: 'Required' }) : null;
  if (file.size > MAX_FILE_BYTES) return apiError(413, 'FILE_TOO_LARGE', 'The file must be 5 MB or smaller.');
  if (!IMAGE_TYPES.has(file.type)) return apiError(400, 'INVALID_FILE_TYPE', 'The file must be a JPEG, PNG or WebP image.');
  return null;
}
