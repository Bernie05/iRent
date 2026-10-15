import type { ChargeRow, ItemStatus, MeTenancy } from '../types/api';
import { rentCountdown, rentIcs } from './rentCountdown';
import { manilaToday } from './time';

// Due day 31 (BR-8): clamped to the month's last day.
const tenancy: MeTenancy = { id: 'ten-1', bed: { label: 'Lower Bunk 1', room: 'Room A', bunk_type: 'lower', monthly_rate: 4500 }, move_in: '2026-01-31' };

const charge = (period: string, due: string, status: ItemStatus, type: 'charge' | 'bill_share' = 'charge'): ChargeRow => ({
  id: `${type}-${period}`,
  item: { type, id: `${type}-${period}`, period },
  tenancy_id: 'ten-1',
  amount: 4500,
  paid_total: status === 'paid' ? 4500 : 0,
  paid_from_credit: 0,
  remaining: status === 'paid' ? 0 : 4500,
  due_date: due,
  status,
  is_overdue: false,
});

describe('rentCountdown (R76, D-27, E72, OQ-34)', () => {
  it('1: counts days overdue from the oldest open rent charge (bill shares ignored)', () => {
    const charges = [charge('2026-10-01', '2026-10-31', 'unpaid'), charge('2026-09-01', '2026-09-30', 'partial'), charge('2026-08-01', '2026-08-01', 'unpaid', 'bill_share')];
    expect(rentCountdown('2026-10-15', tenancy, charges)).toEqual({ kind: 'overdue', days: 15, due: '2026-09-30' });
    expect(rentCountdown('2026-10-01', tenancy, [charge('2026-09-01', '2026-09-30', 'unpaid')])).toMatchObject({ kind: 'overdue', days: 1 });
  });

  it('2: the earliest open rent charge is due in N days, or today (Feb clamps the day-31 due day)', () => {
    const feb = [charge('2026-02-01', '2026-02-28', 'partial')];
    expect(rentCountdown('2026-02-20', tenancy, feb)).toEqual({ kind: 'due', days: 8, due: '2026-02-28', period: '2026-02-01', amount: 4500, tenancyId: 'ten-1' });
    expect(rentCountdown('2026-02-28', tenancy, feb)).toMatchObject({ kind: 'due', days: 0 });
  });

  it('3: projects the period after the latest rent charge, with the BR-8 due date; Manila midnight is the day boundary', () => {
    const paid = [charge('2026-01-01', '2026-01-31', 'paid')];
    expect(rentCountdown('2026-02-10', tenancy, paid)).toEqual({ kind: 'next', days: 18, due: '2026-02-28', period: '2026-02-01', amount: 4500, tenancyId: 'ten-1' });
    // 23:59:59 Manila on Feb 27 → 1 day; one second later it is Feb 28 in Manila → due today (0 days).
    expect(rentCountdown(manilaToday(new Date('2026-02-27T15:59:59Z')), tenancy, paid)).toMatchObject({ days: 1 });
    expect(rentCountdown(manilaToday(new Date('2026-02-27T16:00:00Z')), tenancy, paid)).toMatchObject({ days: 0 });
    // No rent charge yet: the move-in month.
    expect(rentCountdown('2026-01-20', tenancy, [])).toMatchObject({ kind: 'next', days: 11, due: '2026-01-31', period: '2026-01-01' });
  });

  it("E72: this month isn't generated yet and its due day passed → no countdown (never a later month)", () => {
    const sep = [{ ...charge('2026-09-01', '2026-09-05', 'paid') }];
    expect(rentCountdown('2026-10-15', { ...tenancy, move_in: '2026-08-05' }, sep)).toBeNull();
  });

  it('4: moved out (no tenancy) with nothing open → no countdown', () => {
    expect(rentCountdown('2026-10-15', null, [charge('2026-09-01', '2026-09-30', 'paid')])).toBeNull();
  });
});

describe('rentIcs (R76)', () => {
  const ics = rentIcs({ due: '2026-11-30', period: '2026-11-01', amount: 4500, tenancyId: 'ten-1' }, new Date('2026-10-15T02:03:04Z'));

  it('uses CRLF line endings only and one all-day VEVENT with a VALARM the day before at 9:00 AM', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const lines = ics.split('\r\n');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines).toEqual(
      expect.arrayContaining([
        'UID:rent-ten-1-2026-11@irent',
        'DTSTAMP:20261015T020304Z',
        'DTSTART;VALUE=DATE:20261130',
        'DTEND;VALUE=DATE:20261201',
        'SUMMARY:Rent due ₱4\\,500.00 (iRent)',
        'BEGIN:VALARM',
        'TRIGGER:-PT15H',
        'END:VALARM',
      ]),
    );
  });
});
