import { equalSplit, hasAtMostTwoDecimals, sumCentavos, toCentavos, fromCentavos } from './money';
import splitVectors from '../../../server/test/fixtures/split.json';
import { addDays, dueDateFor, isIsoDate, manilaToday, periodOf, toInstant } from './time';

describe('money (NFR6)', () => {
  it('converts pesos to centavos exactly, without float error', () => {
    expect(toCentavos('0.30')).toBe(30);
    expect(toCentavos(0.3)).toBe(30); // not 30.000000000000004
    expect(toCentavos(1.15)).toBe(115); // 1.15 * 100 in floats is 114.99999999999999
    expect(toCentavos(333.34)).toBe(33334);
    expect(toCentavos('4500')).toBe(450000);
    expect(toCentavos('1.5')).toBe(150);
    expect(toCentavos(-250)).toBe(-25000);
    expect(fromCentavos(33333)).toBe(333.33);
    expect(sumCentavos([33334, 33333, 33333])).toBe(100000);
  });

  it('rejects more than 2 decimals', () => {
    expect(() => toCentavos('1.234')).toThrow(RangeError);
    expect(hasAtMostTwoDecimals('1.23')).toBe(true);
    expect(hasAtMostTwoDecimals(1.234)).toBe(false);
    expect(hasAtMostTwoDecimals(Number.NaN)).toBe(false);
  });

  it('BR-5 equal split: ₱1,000 / 3 → 333.34, 333.33, 333.33 and the sum always equals the total', () => {
    expect(equalSplit(100000, 3)).toEqual([33334, 33333, 33333]);
    for (const [total, n] of [[1, 3], [99999, 7], [100001, 4], [5, 5], [0, 2]]) {
      const parts = equalSplit(total, n);
      expect(parts).toHaveLength(n);
      expect(sumCentavos(parts)).toBe(total);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
    }
    expect(equalSplit(100, 0)).toEqual([]);
  });

  it('BR-5 equal split matches the shared server vectors (B2 split.json)', () => {
    for (const v of splitVectors.vectors) expect(equalSplit(v.total, v.n)).toEqual(v.expected);
  });
});

describe('time (NFR7, Asia/Manila)', () => {
  it('manilaToday at 2026-09-30T16:30Z is 2026-10-01 (month-boundary vector)', () => {
    expect(manilaToday(new Date('2026-09-30T16:30:00Z'))).toBe('2026-10-01');
    expect(manilaToday(new Date('2026-09-30T15:59:59Z'))).toBe('2026-09-30');
    expect(periodOf(new Date('2026-09-30T16:30:00Z'))).toBe('2026-10-01');
  });

  it('BR-8 due dates clamp to the month end and never drift', () => {
    expect(dueDateFor('2027-01-31', '2027-02-01')).toBe('2027-02-28');
    expect(dueDateFor('2027-01-31', '2028-02-01')).toBe('2028-02-29');
    expect(dueDateFor('2027-01-31', '2027-03-01')).toBe('2027-03-31');
    expect(dueDateFor('2027-01-31', '2027-04-01')).toBe('2027-04-30');
    expect(dueDateFor('2026-01-29', '2027-02-01')).toBe('2027-02-28');
    expect(dueDateFor('2026-01-30', '2028-02-01')).toBe('2028-02-29');
    expect(dueDateFor('2026-10-15', '2026-11-01')).toBe('2026-11-15');
  });

  it('validates ISO dates and adds days across months', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-9-1')).toBe(false);
    expect(addDays('2026-10-02', 90)).toBe('2026-12-31');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('reads business dates as Manila midnight', () => {
    expect(toInstant('2026-10-01').toISOString()).toBe('2026-09-30T16:00:00.000Z');
  });
});
