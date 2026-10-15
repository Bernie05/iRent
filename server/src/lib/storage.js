import { appError } from './errors.js';
import { getSupabaseAdmin } from './supabase.js';

export const BUCKETS = Object.freeze({ PUBLIC: 'public-media', RECEIPTS: 'receipts' });
export const SIGNED_URL_TTL_SECONDS = 300; // NFR1: proof URLs expire after 5 minutes

function internal(cause) {
  const e = appError('INTERNAL');
  e.cause = cause;
  return e;
}

/** Upload a buffer. Never overwrites. Returns the stored path. */
export async function put(bucket, path, buffer, contentType, client = getSupabaseAdmin()) {
  const { data, error } = await client.storage
    .from(bucket)
    .upload(path, buffer, { contentType, upsert: false, cacheControl: '3600' });
  if (error) throw internal(error);
  return data.path;
}

/** Remove one or more objects. Resolves even if some paths did not exist. */
export async function remove(bucket, paths, client = getSupabaseAdmin()) {
  const list = Array.isArray(paths) ? paths : [paths];
  if (list.length === 0) return;
  const { error } = await client.storage.from(bucket).remove(list);
  if (error) throw internal(error);
}

/** Short-lived signed URL (default 300 s) for a private object, e.g. a payment proof. */
export async function signedUrl(path, expiresIn = SIGNED_URL_TTL_SECONDS, bucket = BUCKETS.RECEIPTS, client = getSupabaseAdmin()) {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    if (error.statusCode === '404' || /not found/i.test(error.message ?? '')) throw appError('NOT_FOUND');
    throw internal(error);
  }
  return data.signedUrl;
}

/** Public URL for an object in the public bucket (no network call). */
export function publicUrl(path, bucket = BUCKETS.PUBLIC, client = getSupabaseAdmin()) {
  if (!path) return null;
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
