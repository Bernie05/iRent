/**
 * BR-5 equal split. share = floor(total / n); the leftover centavos go one each to the
 * first shares, ordered by tenancy move-in date and then id. The sum always equals the total.
 *
 * equalSplit(100000, 3)                → [33334, 33333, 33333]
 * equalSplit(100000, [{ id, move_in }]) → [{ tenancy_id, amount }] in BR-5 order
 *
 * @param {number} totalCentavos non-negative safe integer
 * @param {number | Array<{ id: string, move_in: string }>} tenanciesOrCount
 */
export function equalSplit(totalCentavos, tenanciesOrCount) {
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos < 0) {
    throw new TypeError('totalCentavos must be a non-negative integer');
  }

  if (typeof tenanciesOrCount === 'number') {
    return splitCount(totalCentavos, tenanciesOrCount);
  }
  if (!Array.isArray(tenanciesOrCount)) throw new TypeError('Expected a count or an array of tenancies');

  const ordered = [...tenanciesOrCount].sort(compareTenancies);
  const amounts = splitCount(totalCentavos, ordered.length);
  return ordered.map((t, i) => ({ tenancy_id: t.id, amount: amounts[i] }));
}

/** BR-5 order: move_in ascending, then id ascending. */
export function compareTenancies(a, b) {
  if (a.move_in !== b.move_in) return a.move_in < b.move_in ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function splitCount(total, n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('Need at least one share');
  const base = Math.floor(total / n);
  const leftover = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < leftover ? 1 : 0));
}
