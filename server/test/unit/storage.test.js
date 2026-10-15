import { describe, it, expect, vi } from 'vitest';
import { put, remove, signedUrl, publicUrl, BUCKETS, SIGNED_URL_TTL_SECONDS } from '../../src/lib/storage.js';

function fakeClient(overrides = {}) {
  const bucket = {
    upload: vi.fn(async (path) => ({ data: { path }, error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    createSignedUrl: vi.fn(async (path, ttl) => ({ data: { signedUrl: `http://x/${path}?ttl=${ttl}` }, error: null })),
    getPublicUrl: vi.fn((path) => ({ data: { publicUrl: `http://x/public/${path}` } })),
    ...overrides,
  };
  return { client: { storage: { from: vi.fn(() => bucket) } }, bucket };
}

describe('storage helpers (B2)', () => {
  it('put uploads without overwriting and returns the path', async () => {
    const { client, bucket } = fakeClient();
    const buf = Buffer.from('x');
    await expect(put(BUCKETS.RECEIPTS, 'r1/a.png', buf, 'image/png', client)).resolves.toBe('r1/a.png');
    expect(client.storage.from).toHaveBeenCalledWith('receipts');
    expect(bucket.upload).toHaveBeenCalledWith('r1/a.png', buf, expect.objectContaining({ upsert: false, contentType: 'image/png' }));
  });

  it('put failures become INTERNAL without leaking details', async () => {
    const { client } = fakeClient({ upload: vi.fn(async () => ({ data: null, error: { message: 'bucket secret-x missing' } })) });
    await expect(put('receipts', 'a', Buffer.from('x'), 'image/png', client)).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'Something went wrong. Please try again.',
    });
  });

  it('remove accepts one path or many, and skips empty lists', async () => {
    const { client, bucket } = fakeClient();
    await remove('receipts', 'a.png', client);
    expect(bucket.remove).toHaveBeenLastCalledWith(['a.png']);
    await remove('receipts', [], client);
    expect(bucket.remove).toHaveBeenCalledTimes(1);
  });

  it('signedUrl defaults to 300 s on the receipts bucket', async () => {
    const { client, bucket } = fakeClient();
    expect(SIGNED_URL_TTL_SECONDS).toBe(300);
    await signedUrl('r1/a.png', undefined, undefined, client);
    expect(client.storage.from).toHaveBeenCalledWith('receipts');
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('r1/a.png', 300);
  });

  it('signedUrl for a missing object → NOT_FOUND', async () => {
    const { client } = fakeClient({ createSignedUrl: vi.fn(async () => ({ data: null, error: { message: 'Object not found', statusCode: '404' } })) });
    await expect(signedUrl('nope.png', 300, 'receipts', client)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('publicUrl uses public-media and handles empty paths', () => {
    const { client } = fakeClient();
    expect(publicUrl('beds/a.png', undefined, client)).toBe('http://x/public/beds/a.png');
    expect(client.storage.from).toHaveBeenCalledWith('public-media');
    expect(publicUrl(null, undefined, client)).toBeNull();
  });
});
