import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { equalSplit, compareTenancies } from '../../src/lib/split.js';
import fixture from '../fixtures/split.json' with { type: 'json' };

describe('equalSplit (B2, BR-5)', () => {
  it('equalSplit(100000, 3) → [33334, 33333, 33333]', () => {
    expect(equalSplit(100000, 3)).toEqual([33334, 33333, 33333]);
  });

  it.each(fixture.vectors)('total $total over $n → $expected', ({ total, n, expected }) => {
    expect(equalSplit(total, n)).toEqual(expected);
  });

  it('orders tenancies by move-in, then id, and gives the extra centavos to the first', () => {
    expect(equalSplit(fixture.ordering.total, fixture.ordering.tenancies)).toEqual(fixture.ordering.expected);
    // the input array is not mutated
    expect(fixture.ordering.tenancies[0].id).toBe('c0000000-0000-4000-8000-000000000003');
  });

  it('property: the shares always sum to the total and differ by at most one centavo', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), fc.integer({ min: 1, max: 50 }), (total, n) => {
        const shares = equalSplit(total, n);
        expect(shares).toHaveLength(n);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
        // larger shares come first
        for (let i = 1; i < n; i += 1) expect(shares[i]).toBeLessThanOrEqual(shares[i - 1]);
      }),
      { numRuns: 1000 },
    );
  });

  it('property: tenancy form preserves the sum and BR-5 order', () => {
    const tenancy = fc.record({
      id: fc.uuid(),
      move_in: fc.date({ min: new Date('2025-01-01'), max: new Date('2027-01-01') }).map((d) => d.toISOString().slice(0, 10)),
    });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10_000_000 }), fc.uniqueArray(tenancy, { minLength: 1, maxLength: 12, selector: (t) => t.id }), (total, ts) => {
        const out = equalSplit(total, ts);
        expect(out.reduce((a, s) => a + s.amount, 0)).toBe(total);
        const sorted = [...ts].sort(compareTenancies).map((t) => t.id);
        expect(out.map((s) => s.tenancy_id)).toEqual(sorted);
      }),
    );
  });

  it('rejects bad input', () => {
    expect(() => equalSplit(100, 0)).toThrow(RangeError);
    expect(() => equalSplit(-1, 2)).toThrow(TypeError);
    expect(() => equalSplit(1.5, 2)).toThrow(TypeError);
    expect(() => equalSplit(100, 'x')).toThrow(TypeError);
    expect(() => equalSplit(100, [])).toThrow(RangeError);
  });
});
