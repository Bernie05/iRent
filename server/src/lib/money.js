import { z } from 'zod';
import { validationError } from './errors.js';

/**
 * Money helpers (NFR6). All arithmetic is done in integer centavos.
 * JSON carries pesos as numbers with at most 2 decimals; the DB stores numeric(12,2).
 */

const MONEY_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Exact conversion of a peso amount (number or string) to integer centavos.
 * Rejects NaN, Infinity, exponent notation and more than 2 decimals.
 * @param {number|string} value
 * @param {string} [field] field name for the validation error
 * @returns {number} safe integer centavos
 */
export function toCentavos(value, field = 'amount') {
  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw validationError({ [field]: 'Must be a valid amount' });
    text = String(value);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    throw validationError({ [field]: 'Must be a valid amount' });
  }

  const m = MONEY_RE.exec(text);
  if (!m) {
    throw validationError({ [field]: 'Must be an amount with at most 2 decimals' });
  }
  const [, sign, whole, frac = ''] = m;
  const centavos = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos)) throw validationError({ [field]: 'Amount is too large' });
  return sign ? -centavos : centavos;
}

/** Integer centavos → pesos as a JSON number (e.g. 33334 → 333.34). */
export function fromCentavos(centavos) {
  assertCentavos(centavos);
  return centavos / 100;
}

/** Integer centavos → exact decimal string for numeric parameters (e.g. 33334 → "333.34"). */
export function toDecimalString(centavos) {
  assertCentavos(centavos);
  const sign = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Sum of integer centavos. */
export function sum(values) {
  let total = 0;
  for (const v of values) {
    assertCentavos(v);
    total += v;
  }
  if (!Number.isSafeInteger(total)) throw new RangeError('Sum overflow');
  return total;
}

function assertCentavos(v) {
  if (!Number.isSafeInteger(v)) throw new TypeError(`Expected integer centavos, got ${v}`);
}

/**
 * zod schema for a peso amount from JSON or multipart (string). Output: integer centavos.
 * @param {{ min?: number, max?: number }} bounds in centavos (inclusive)
 */
export function zMoney({ min = 1, max = 99_999_999 } = {}) {
  return z.union([z.number(), z.string()]).transform((v, ctx) => {
    let c;
    try {
      c = toCentavos(v);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be an amount with at most 2 decimals' });
      return z.NEVER;
    }
    if (c < min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Must be at least ${toDecimalString(min)}` });
      return z.NEVER;
    }
    if (c > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Must be at most ${toDecimalString(max)}` });
      return z.NEVER;
    }
    return c;
  });
}
