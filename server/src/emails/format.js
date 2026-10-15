/**
 * Locale formatting for emails (R47): en-PH / fil-PH, Asia/Manila, ₱ with 2 decimals.
 */
import { TIME_ZONE } from '../lib/time.js';

export const LOCALES = { en: 'en-PH', fil: 'fil-PH' };

const cache = new Map();
function fmt(key, factory) {
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}

/** HTML-escape user-provided or data text. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) links are ever rendered as hrefs. */
export function safeUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

const METHOD_LABELS = {
  en: { gcash: 'GCash', maya: 'Maya', bpi: 'BPI', cash: 'Cash', credit: 'Credit' },
  fil: { gcash: 'GCash', maya: 'Maya', bpi: 'BPI', cash: 'Cash', credit: 'Credit' },
};

const BILL_TYPES = {
  en: { electricity: 'electricity', water: 'water', internet: 'internet' },
  fil: { electricity: 'kuryente', water: 'tubig', internet: 'internet' },
};

/** Formatter bound to a language. */
export function formatterFor(lang) {
  const l = lang === 'fil' ? 'fil' : 'en';
  const locale = LOCALES[l];

  const money = (pesos) =>
    fmt(`money:${locale}`, () =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ).format(Number(pesos ?? 0));

  // Business dates 'YYYY-MM-DD' are calendar dates; format them at noon UTC so no zone shifts the day.
  const toInstant = (value) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);

  const date = (value) =>
    fmt(`date:${locale}`, () =>
      new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, year: 'numeric', month: 'long', day: 'numeric' }),
    ).format(toInstant(value));

  const period = (value) =>
    fmt(`period:${locale}`, () =>
      new Intl.DateTimeFormat(locale, { timeZone: TIME_ZONE, year: 'numeric', month: 'long' }),
    ).format(toInstant(value));

  const method = (m) => METHOD_LABELS[l][m] ?? String(m ?? '');

  /** Item label from the contract Item shape { type, period, bill_type? }. */
  const item = (it) => {
    if (!it) return '';
    const p = period(it.period);
    if (it.type === 'bill_share') {
      const bt = BILL_TYPES[l][it.bill_type] ?? it.bill_type ?? '';
      return l === 'fil' ? `bayarin sa ${bt} para sa ${p}` : `${p} ${bt} bill`;
    }
    return l === 'fil' ? `upa para sa ${p}` : `${p} rent`;
  };

  return { lang: l, locale, money, date, period, method, item };
}
