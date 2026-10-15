/**
 * Email template registry (R48): 8 templates × en/fil.
 * Files: server/src/emails/templates/<template>.<lang>.js
 */
import { formatterFor } from './format.js';
import { renderLayout } from './layout.js';

import inviteEn from './templates/invite.en.js';
import inviteFil from './templates/invite.fil.js';
import resetEn from './templates/password-reset.en.js';
import resetFil from './templates/password-reset.fil.js';
import receivedEn from './templates/payment-received.en.js';
import receivedFil from './templates/payment-received.fil.js';
import adminNoticeEn from './templates/admin-payment-notice.en.js';
import adminNoticeFil from './templates/admin-payment-notice.fil.js';
import rejectedEn from './templates/payment-rejected.en.js';
import rejectedFil from './templates/payment-rejected.fil.js';
import reminderEn from './templates/reminder.en.js';
import reminderFil from './templates/reminder.fil.js';
import announcementEn from './templates/announcement.en.js';
import announcementFil from './templates/announcement.fil.js';
import refundEn from './templates/refund-recorded.en.js';
import refundFil from './templates/refund-recorded.fil.js';

export const TEMPLATES = Object.freeze({
  invite: { en: inviteEn, fil: inviteFil },
  'password-reset': { en: resetEn, fil: resetFil },
  'payment-received': { en: receivedEn, fil: receivedFil },
  'admin-payment-notice': { en: adminNoticeEn, fil: adminNoticeFil },
  'payment-rejected': { en: rejectedEn, fil: rejectedFil },
  reminder: { en: reminderEn, fil: reminderFil },
  announcement: { en: announcementEn, fil: announcementFil },
  'refund-recorded': { en: refundEn, fil: refundFil },
});

export const TEMPLATE_NAMES = Object.freeze(Object.keys(TEMPLATES));
export const LANGUAGES = Object.freeze(['en', 'fil']);

/** Subjects are headers: one line, no control characters, bounded length. */
export function cleanSubject(subject) {
  return String(subject).replace(/[\r\n\t\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Render a template.
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderEmail(template, lang, data, { logoUrl } = {}) {
  const entry = TEMPLATES[template];
  if (!entry) throw new Error(`Unknown email template: ${template}`);
  const language = lang === 'fil' ? 'fil' : 'en';
  const f = formatterFor(language);
  const content = entry[language](data ?? {}, f);
  const rendered = renderLayout({ ...content, subject: cleanSubject(content.subject) }, { lang: language, logoUrl });
  if (!rendered.subject.includes('iRent')) throw new Error(`Subject of ${template}.${language} must contain "iRent"`);
  return rendered;
}
