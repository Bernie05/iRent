import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  manilaNow, manilaToday, setClockOverride, periodOf, currentPeriod, lastDayOfMonth, addDays, daysBetween,
  parseDate, isValidDate, toManilaDate,
} from '../../src/lib/time.js';
import { dueDateFor } from '../../src/lib/dueDate.js';
import vectors from '../fixtures/due-dates.json' with { type: 'json' };

afterEach(() => {
  setClockOverride(undefined);
  delete process.env.CLOCK_OVERRIDE;
  process.env.ALLOW_CLOCK_OVERRIDE = 'true';
  process.env.NODE_ENV = 'test';
});

describe('Manila time (B2, NFR7)', () => {
  it('manilaToday() at 2026-09-30T16:30Z is 2026-10-01 (month boundary)', () => {
    setClockOverride('2026-09-30T16:30:00Z');
    expect(manilaToday()).toBe('2026-10-01');
    expect(currentPeriod()).toBe('2026-10-01');
  });

  it('manilaToday() just before Manila midnight is still the same day', () => {
    setClockOverride('2026-09-30T15:59:59Z');
    expect(manilaToday()).toBe('2026-09-30');
  });

  it('honours CLOCK_OVERRIDE from the environment when allowed', () => {
    process.env.CLOCK_OVERRIDE = '2027-02-25T00:00:00Z';
    expect(manilaNow().toISOString()).toBe('2027-02-25T00:00:00.000Z');
    expect(manilaToday()).toBe('2027-02-25');
  });

  it('accepts ALLOW_CLOCK_OVERRIDE=1, like config.js', () => {
    process.env.ALLOW_CLOCK_OVERRIDE = '1';
    process.env.CLOCK_OVERRIDE = '2027-02-25T00:00:00Z';
    expect(manilaToday()).toBe('2027-02-25');
    process.env.ALLOW_CLOCK_OVERRIDE = '0';
    expect(manilaToday()).not.toBe('2027-02-25');
  });

  it('ignores any override when not allowed, and in production', () => {
    process.env.CLOCK_OVERRIDE = '2000-01-01T00:00:00Z';
    process.env.ALLOW_CLOCK_OVERRIDE = 'false';
    expect(manilaNow().getUTCFullYear()).toBeGreaterThanOrEqual(2026);
    expect(() => setClockOverride('2000-01-01T00:00:00Z')).toThrow(/not allowed/);

    process.env.ALLOW_CLOCK_OVERRIDE = 'true';
    process.env.NODE_ENV = 'production';
    expect(manilaNow().getUTCFullYear()).toBeGreaterThanOrEqual(2026);
  });

  it('rejects an invalid override', () => {
    expect(() => setClockOverride('not a date')).toThrow(/Invalid clock override/);
  });

  it('periodOf, lastDayOfMonth, addDays, daysBetween', () => {
    expect(periodOf('2026-10-20')).toBe('2026-10-01');
    expect(periodOf('2026-10')).toBe('2026-10-01');
    expect(lastDayOfMonth(2027, 2)).toBe(28);
    expect(lastDayOfMonth(2028, 2)).toBe(29);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
    expect(lastDayOfMonth(2026, 12)).toBe(31);
    expect(addDays('2027-02-28', -3)).toBe('2027-02-25'); // SC-58
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-10-05', '2026-10-12')).toBe(7);
    expect(daysBetween('2026-10-12', '2026-10-05')).toBe(-7);
    expect(toManilaDate(new Date('2026-12-31T16:00:00Z'))).toBe('2027-01-01');
  });

  it('validates calendar dates strictly', () => {
    expect(isValidDate('2027-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-1-01')).toBe(false);
    expect(() => parseDate('garbage')).toThrow(TypeError);
    expect(() => periodOf('2026-02-30')).toThrow(TypeError);
  });

  it('property: addDays and daysBetween are inverse', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01') }), fc.integer({ min: -2000, max: 2000 }), (d, n) => {
        const start = d.toISOString().slice(0, 10);
        expect(daysBetween(start, addDays(start, n))).toBe(n);
      }),
    );
  });
});

describe('dueDateFor (B2, BR-8)', () => {
  it.each(vectors.vectors)('move-in $move_in, period $period → $expected', ({ move_in, period, expected }) => {
    expect(dueDateFor(move_in, period)).toBe(expected);
  });

  it('accepts any date in the period month', () => {
    expect(dueDateFor('2027-01-31', '2027-02-15')).toBe('2027-02-28');
    expect(dueDateFor('2027-01-31', '2027-02')).toBe('2027-02-28');
  });

  it('property: the due date is always inside the period month and never after move-in day', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2040-12-31') }),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2040-12-31') }),
        (m, p) => {
          const moveIn = m.toISOString().slice(0, 10);
          const period = periodOf(p.toISOString().slice(0, 10));
          const due = dueDateFor(moveIn, period);
          expect(periodOf(due)).toBe(period);
          expect(Number(due.slice(8))).toBeLessThanOrEqual(Number(moveIn.slice(8)));
        },
      ),
    );
  });
});
