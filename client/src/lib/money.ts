/**
 * Money helpers (NFR6). The API sends pesos as JSON numbers with at most 2 decimals.
 * All arithmetic is done in integer centavos, never on floats.
 */
export type Centavos = number;

const MONEY_RE = /^-?\d+(\.\d{1,2})?$/;

/** True when the value has at most 2 decimals (as typed or as sent by the API). */
export function hasAtMostTwoDecimals(value: number | string): boolean {
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  // Numbers like 1e-7 stringify in exponent form: treat them as invalid money.
  return MONEY_RE.test(text);
}

/** Exact conversion from pesos to centavos. Throws on more than 2 decimals or a non-number. */
export function toCentavos(value: number | string): Centavos {
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!MONEY_RE.test(text)) throw new RangeError(`Invalid money value: ${text}`);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

export function fromCentavos(cents: Centavos): number {
  return cents / 100;
}

export function sumCentavos(values: Centavos[]): Centavos {
  return values.reduce((total, v) => total + v, 0);
}

/**
 * BR-5 equal split. `share = floor(total / n)`; the leftover centavos go one each to the first shares
 * (the caller passes tenancies already ordered by move-in date, then id). The sum always equals the total.
 */
export function equalSplit(totalCents: Centavos, count: number): Centavos[] {
  if (count <= 0) return [];
  const share = Math.floor(totalCents / count);
  const leftover = totalCents - share * count;
  return Array.from({ length: count }, (_, i) => share + (i < leftover ? 1 : 0));
}
