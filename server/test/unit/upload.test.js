import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { detectImageType, uploadSingle, uploadFields, MAX_UPLOAD_BYTES } from '../../src/lib/upload.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { fixtureImages } from '../helpers/images.js';

const img = fixtureImages();

function appWith(mw) {
  const app = express();
  app.post('/up', mw, (req, res) =>
    res.status(201).json({
      file: req.file ? { type: req.file.detectedType, ext: req.file.extension, size: req.file.size } : null,
      files: req.files ? Object.fromEntries(Object.entries(req.files).map(([k, v]) => [k, v[0].detectedType])) : null,
      body: req.body,
    }),
  );
  app.use(errorHandler);
  return app;
}

describe('magic-byte detection (B2, NFR1)', () => {
  it('detects jpeg, png and webp', () => {
    expect(detectImageType(img.jpeg)).toBe('image/jpeg');
    expect(detectImageType(img.png)).toBe('image/png');
    expect(detectImageType(img.webp)).toBe('image/webp');
  });

  it('rejects HEIC, PDF, GIF, SVG, empty and tiny buffers', () => {
    expect(detectImageType(img.heic)).toBeUndefined();
    expect(detectImageType(img.pdf)).toBeUndefined();
    expect(detectImageType(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00'))).toBeUndefined();
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeUndefined();
    expect(detectImageType(Buffer.alloc(0))).toBeUndefined();
    expect(detectImageType(undefined)).toBeUndefined();
  });
});

describe('upload middleware (B2)', () => {
  it('accepts a PNG and reports the detected type, regardless of the client MIME', async () => {
    const res = await request(appWith(uploadSingle('proof')))
      .post('/up')
      .field('item_id', 'abc')
      .attach('proof', img.png, { filename: 'shot.txt', contentType: 'text/plain' });
    expect(res.status).toBe(201);
    expect(res.body.file).toMatchObject({ type: 'image/png', ext: 'png' });
    expect(res.body.body).toEqual({ item_id: 'abc' });
  });

  it('a file just under 5 MB is accepted', async () => {
    const big = Buffer.concat([img.jpeg, Buffer.alloc(MAX_UPLOAD_BYTES - img.jpeg.length)]);
    const res = await request(appWith(uploadSingle('proof'))).post('/up').attach('proof', big, 'ok.jpg');
    expect(res.status).toBe(201);
    expect(res.body.file.size).toBe(MAX_UPLOAD_BYTES);
  });

  it('one byte over 5 MB → 413 FILE_TOO_LARGE', async () => {
    const big = Buffer.concat([img.jpeg, Buffer.alloc(MAX_UPLOAD_BYTES + 1 - img.jpeg.length)]);
    const res = await request(appWith(uploadSingle('proof'))).post('/up').attach('proof', big, 'big.jpg');
    expect(res.status).toBe(413);
  });

  it('a 5.1 MB file → 413 FILE_TOO_LARGE', async () => {
    const big = Buffer.concat([img.jpeg, Buffer.alloc(Math.round(5.1 * 1024 * 1024))]);
    const res = await request(appWith(uploadSingle('proof'))).post('/up').attach('proof', big, 'big.jpg');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('a HEIC file → 400 INVALID_FILE_TYPE', async () => {
    const res = await request(appWith(uploadSingle('proof')))
      .post('/up')
      .attach('proof', img.heic, { filename: 'IMG_0001.HEIC', contentType: 'image/heic' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('a PDF renamed to .jpg → 400 INVALID_FILE_TYPE', async () => {
    const res = await request(appWith(uploadSingle('proof')))
      .post('/up')
      .attach('proof', img.pdf, { filename: 'receipt.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('an unexpected file field → 400 VALIDATION_ERROR', async () => {
    const res = await request(appWith(uploadSingle('proof'))).post('/up').attach('other', img.png, 'a.png');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty('other');
  });

  it('no file is allowed at this layer (the route decides if it is required)', async () => {
    const res = await request(appWith(uploadSingle('proof'))).post('/up').field('a', '1');
    expect(res.status).toBe(201);
    expect(res.body.file).toBeNull();
  });

  it('several named fields: each file is checked', async () => {
    const mw = uploadFields(['qr_gcash', 'qr_maya', 'qr_bpi']);
    const ok = await request(appWith(mw)).post('/up').attach('qr_gcash', img.png, 'g.png').attach('qr_bpi', img.webp, 'b.webp');
    expect(ok.status).toBe(201);
    expect(ok.body.files).toEqual({ qr_gcash: 'image/png', qr_bpi: 'image/webp' });

    const bad = await request(appWith(mw)).post('/up').attach('qr_gcash', img.png, 'g.png').attach('qr_maya', img.pdf, 'm.png');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_FILE_TYPE');
  });
});
