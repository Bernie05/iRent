/**
 * Email service (B11). `send(template, lang, to, data)` never throws: it resolves to
 * `{ ok: true, id }` or `{ ok: false, error }` and logs failures (R22, E4).
 *
 * Transports
 *   resend  real delivery through Resend
 *   log     console + one JSON file per email in server/.mail/ (dev and QA; D-12, D-13)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { renderEmail } from '../emails/index.js';
import { logger } from '../lib/logger.js';

const DEFAULT_LOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.mail');

/** Mask an address for logs: "ana@irent.test" → "a***@irent.test". */
export function maskEmail(address) {
  const [user, domain] = String(address).split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}

export function createLogTransport({ dir = DEFAULT_LOG_DIR, echo = true } = {}) {
  return {
    name: 'log',
    async send(message) {
      await mkdir(dir, { recursive: true });
      const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${message.template}-${randomUUID().slice(0, 8)}`;
      await writeFile(join(dir, `${id}.json`), JSON.stringify({ id, ...message, sent_at: new Date().toISOString() }, null, 2));
      if (echo) logger.info('email (log transport)', { id, template: message.template, lang: message.lang, subject: message.subject });
      return { id };
    },
  };
}

/**
 * @param {object} client  a Resend client (`new Resend(key)`) or anything with `emails.send()`
 */
export function createResendTransport({ client }) {
  return {
    name: 'resend',
    async send(message) {
      const result = await client.emails.send({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      // The Resend SDK reports API failures as { error } instead of throwing.
      if (result?.error) {
        const err = new Error(result.error.message || 'Resend error');
        err.name = result.error.name || 'ResendError';
        throw err;
      }
      return { id: result?.data?.id };
    },
  };
}

/**
 * @param {object} opts
 * @param {object} opts.transport  { name, send(message) → { id } }
 * @param {string} opts.from       EMAIL_FROM
 * @param {string} [opts.logoUrl]  absolute URL of the logo image
 */
export function createEmailService({ transport, from, logoUrl }) {
  return {
    transport: transport.name,
    /**
     * @param {string} template  one of TEMPLATE_NAMES
     * @param {'en'|'fil'} lang
     * @param {string} to
     * @param {object} data
     * @returns {Promise<{ ok: boolean, id?: string, error?: string }>}
     */
    async send(template, lang, to, data) {
      try {
        if (!to) throw new Error('Missing recipient');
        const { subject, html, text } = renderEmail(template, lang, data, { logoUrl });
        const { id } = await transport.send({ template, lang: lang === 'fil' ? 'fil' : 'en', from, to, subject, html, text });
        return { ok: true, id };
      } catch (err) {
        logger.error('email send failed', {
          template,
          lang,
          to: maskEmail(to),
          transport: transport.name,
          error: err?.message ?? String(err),
        });
        return { ok: false, error: err?.message ?? 'Email failed' };
      }
    },
  };
}

let shared;
/** Email service built from the process config (lazy; Resend loaded only when used). */
export async function getEmailService(config) {
  if (shared) return shared;
  let transport;
  if (config.EMAIL_TRANSPORT === 'resend') {
    const { Resend } = await import('resend');
    transport = createResendTransport({ client: new Resend(config.RESEND_API_KEY) });
  } else {
    transport = createLogTransport({ dir: config.MAIL_LOG_DIR || DEFAULT_LOG_DIR });
  }
  const logoUrl = config.EMAIL_LOGO_URL || `${config.CLIENT_ORIGIN[0]}/logo.png`;
  shared = createEmailService({ transport, from: config.EMAIL_FROM, logoUrl });
  return shared;
}

/** Test helper. */
export function setEmailService(service) {
  shared = service;
}
