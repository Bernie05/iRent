import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { toCentavos, fromCentavos, toDecimalString, sum, zMoney } from '../../src/lib/money.js';

describe('money (B2, NFR6)', () => {
  it('converts pesos to centavos exactly', () => {
    expect(toCentavos(4500)).toBe(450000);
    expect(toCentavos(333.34)).toBe(33334);
    expect(toCentavos('333.3')).toBe(33330);
    expect(toCentavos(' 0.01 ')).toBe(1);
    expect(toCentavos('0')).toBe(0);
    expect(toCentavos(-500)).toBe(-50000);
    expect(toCentavos(999999.99)).toBe(99999999);
    expect(toCentavos(0.29)).toBe(29); // 0.29 * 100 = 28.999999999999996 with floats
    expect(toCentavos(1.1)).toBe(110);
  });

  it('rejects more than 2 decimals and non-amounts with VALIDATION_ERROR', () => {
    for (const bad of [1.005, '1.005', 0.1 + 0.2, 'abc', '', '1e3', 1e21, NaN, Infinity, null, undefined, {}, '1,000', '.5']) {
      let err;
      try {
        toCentavos(bad, 'amount');
      } catch (e) {
        err = e;
      }
      expect(err?.code, `value ${String(bad)}`).toBe('VALIDATION_ERROR');
      expect(err.details).toHaveProperty('amount');
    }
  });

  it('formats centavos back to pesos', () => {
    expect(fromCentavos(33334)).toBe(333.34);
    expect(fromCentavos(450000)).toBe(4500);
    expect(toDecimalString(33334)).toBe('333.34');
    expect(toDecimalString(5)).toBe('0.05');
    expect(toDecimalString(-50000)).toBe('-500.00');
    expect(() => fromCentavos(1.5)).toThrow(TypeError);
  });

  it('sums integer centavos', () => {
    expect(sum([33334, 33333, 33333])).toBe(100000);
    expect(sum([])).toBe(0);
    expect(() => sum([1, 0.5])).toThrow(TypeError);
  });

  it('property: toCentavos(fromCentavos(c)) === c and the decimal string round-trips', () => {
    fc.assert(
      fc.property(fc.integer({ min: -99_999_999_999, max: 99_999_999_999 }), (c) => {
        expect(toCentavos(fromCentavos(c))).toBe(c);
        expect(toCentavos(toDecimalString(c))).toBe(c);
      }),
      { numRuns: 2000 },
    );
  });

  it('property: summing split pesos in centavos is exact where floats drift', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 10_000_000 }), { maxLength: 50 }), (cs) => {
        const viaPesos = sum(cs.map((c) => toCentavos(fromCentavos(c))));
        expect(viaPesos).toBe(cs.reduce((a, b) => a + b, 0));
      }),
    );
  });

  it('zMoney validates bounds and returns centavos', () => {
    const s = zMoney({ min: 1, max: 99_999_999 });
    expect(s.parse('4500')).toBe(450000);
    expect(s.parse(0.01)).toBe(1);
    expect(s.safeParse(0).success).toBe(false);
    expect(s.safeParse(1_000_000).success).toBe(false);
    expect(s.safeParse('1.234').success).toBe(false);
    expect(s.safeParse(true).success).toBe(false);
  });
});
