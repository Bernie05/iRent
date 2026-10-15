/** B2 storage round trip against local Supabase Storage. */
import { it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { describeLive, serviceClient } from '../helpers/live.js';
import { put, remove, signedUrl, publicUrl, BUCKETS } from '../../src/lib/storage.js';
import { fixtureImages } from '../helpers/images.js';

describeLive('storage helpers on local Supabase (B2)', () => {
  let sb;
  beforeAll(() => {
    sb = serviceClient();
  });

  it('put → signedUrl (expires after 300 s) → download → remove', async () => {
    const path = `test/${randomUUID()}.png`;
    const png = fixtureImages().png;
    expect(await put(BUCKETS.RECEIPTS, path, png, 'image/png', sb)).toBe(path);

    const url = await signedUrl(path, undefined, BUCKETS.RECEIPTS, sb);
    const token = new URL(url).searchParams.get('token');
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(claims.exp - claims.iat).toBe(300);

    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);

    await remove(BUCKETS.RECEIPTS, path, sb);
    await expect(signedUrl(path, 300, BUCKETS.RECEIPTS, sb)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('put never overwrites an existing object', async () => {
    const path = `test/${randomUUID()}.png`;
    await put(BUCKETS.RECEIPTS, path, fixtureImages().png, 'image/png', sb);
    await expect(put(BUCKETS.RECEIPTS, path, fixtureImages().png, 'image/png', sb)).rejects.toMatchObject({ code: 'INTERNAL' });
    await remove(BUCKETS.RECEIPTS, path, sb);
  });

  it('public-media objects have a public URL', async () => {
    const path = `test/${randomUUID()}.png`;
    await put(BUCKETS.PUBLIC, path, fixtureImages().png, 'image/png', sb);
    const res = await fetch(publicUrl(path, BUCKETS.PUBLIC, sb));
    expect(res.status).toBe(200);
    await remove(BUCKETS.PUBLIC, path, sb);
  });
});
