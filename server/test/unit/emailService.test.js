import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEmailService, createLogTransport, createResendTransport, maskEmail, getEmailService, setEmailService,
} from '../../src/services/emailService.js';
import { logger } from '../../src/lib/logger.js';
import { SAMPLES } from '../helpers/emailSamples.js';

const dirs = [];
afterEach(async () => {
  vi.restoreAllMocks();
  setEmailService(undefined);
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function tempDir() {
  const d = await mkdtemp(join(tmpdir(), 'irent-mail-'));
  dirs.push(d);
  return d;
}

describe('emailService (B11)', () => {
  it('log transport writes one JSON file per email for QA to inspect', async () => {
    const dir = await tempDir();
    const svc = createEmailService({ transport: createLogTransport({ dir, echo: false }), from: 'iRent <no-reply@example.com>' });
    const res = await svc.send('invite', 'fil', 'dan@irent.test', SAMPLES.invite);
    expect(res).toEqual({ ok: true, id: expect.any(String) });

    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const mail = JSON.parse(await readFile(join(dir, files[0]), 'utf8'));
    expect(mail).toMatchObject({
      template: 'invite',
      lang: 'fil',
      to: 'dan@irent.test',
      from: 'iRent <no-reply@example.com>',
      subject: 'Maligayang pagdating sa iRent — itakda ang iyong password',
    });
    expect(mail.html).toContain('set-password');
    expect(mail.text).toContain('set-password');
  });

  it('resend transport sends html + text with the configured sender', async () => {
    const client = { emails: { send: vi.fn(async () => ({ data: { id: 're_123' }, error: null })) } };
    const svc = createEmailService({ transport: createResendTransport({ client }), from: 'iRent <a@b.c>' });
    const res = await svc.send('payment-received', 'en', 'ana@irent.test', SAMPLES['payment-received']);
    expect(res).toEqual({ ok: true, id: 're_123' });
    expect(client.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'iRent <a@b.c>', to: ['ana@irent.test'], subject: expect.stringContaining('iRent'), html: expect.any(String), text: expect.any(String) }),
    );
  });

  it('a Resend API error returns { ok: false } and logs it; no exception propagates', async () => {
    const log = vi.spyOn(logger, 'error');
    const client = { emails: { send: vi.fn(async () => ({ data: null, error: { name: 'validation_error', message: 'API key is invalid' } })) } };
    const svc = createEmailService({ transport: createResendTransport({ client }), from: 'x@y.z' });
    const res = await svc.send('reminder', 'en', 'ana@irent.test', SAMPLES.reminder);
    expect(res).toEqual({ ok: false, error: 'API key is invalid' });
    expect(log).toHaveBeenCalledWith('email send failed', expect.objectContaining({ template: 'reminder', to: 'a***@irent.test', transport: 'resend' }));
  });

  it('a thrown network error also returns { ok: false }', async () => {
    const client = { emails: { send: vi.fn(async () => { throw new Error('ECONNRESET'); }) } };
    const svc = createEmailService({ transport: createResendTransport({ client }), from: 'x@y.z' });
    await expect(svc.send('announcement', 'en', 'a@b.c', SAMPLES.announcement)).resolves.toEqual({ ok: false, error: 'ECONNRESET' });
  });

  it('bad input (unknown template, missing recipient) → { ok: false }, never throws', async () => {
    const transport = { name: 'log', send: vi.fn() };
    const svc = createEmailService({ transport, from: 'x@y.z' });
    expect((await svc.send('nope', 'en', 'a@b.c', {})).ok).toBe(false);
    expect((await svc.send('invite', 'en', '', SAMPLES.invite)).ok).toBe(false);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('masks addresses in logs', () => {
    expect(maskEmail('ana@irent.test')).toBe('a***@irent.test');
    expect(maskEmail('garbage')).toBe('***');
  });

  it('getEmailService builds the transport from config (log by default; logo from CLIENT_ORIGIN)', async () => {
    const dir = await tempDir();
    const svc = await getEmailService({ EMAIL_TRANSPORT: 'log', MAIL_LOG_DIR: dir, EMAIL_FROM: 'iRent <x@y.z>', CLIENT_ORIGIN: ['http://localhost:5173'] });
    expect(svc.transport).toBe('log');
    await svc.send('invite', 'en', 'a@b.c', SAMPLES.invite);
    const [file] = await readdir(dir);
    expect(JSON.parse(await readFile(join(dir, file), 'utf8')).html).toContain('http://localhost:5173/logo.png');
    expect(await getEmailService({})).toBe(svc); // cached
  });

  it('getEmailService selects Resend when configured', async () => {
    const svc = await getEmailService({ EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 're_test_dummy', EMAIL_FROM: 'x@y.z', CLIENT_ORIGIN: ['http://localhost:5173'] });
    expect(svc.transport).toBe('resend');
  });
});
