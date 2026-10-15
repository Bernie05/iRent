import type { Inquiry } from '../../../types/api';
import { clashesWith, itemsByDate, manilaParts, monthGrid, upcomingViewings, weekOf } from './calendar';

const inq = (id: string, p: Partial<Inquiry>): Inquiry => ({
  id,
  name: id,
  phone: '09170000000',
  email: null,
  preferred_date: null,
  message: null,
  status: 'new',
  scheduled_at: null,
  schedule_note: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...p,
});

describe('viewing calendar helpers (Asia/Manila)', () => {
  it('month grid: Sunday-first weeks covering the month', () => {
    const weeks = monthGrid('2026-10-01');
    expect(weeks[0][0]).toBe('2026-09-27');
    expect(weeks.at(-1)!.at(-1)).toBe('2026-10-31');
    expect(weeks).toHaveLength(5);
    expect(monthGrid('2026-02-01').flat()).toContain('2026-02-28');
  });

  it('marks viewings by Manila date (UTC evening = next Manila day) and sorts by time; preferred only for open inquiries', () => {
    expect(manilaParts('2026-10-17T16:30:00Z')).toEqual({ date: '2026-10-18', time: '00:30' });
    const map = itemsByDate([
      inq('late', { status: 'scheduled', scheduled_at: '2026-10-18T15:00:00+08:00' }),
      inq('utc', { status: 'scheduled', scheduled_at: '2026-10-17T16:30:00Z' }),
      inq('pref', { status: 'new', preferred_date: '2026-10-18' }),
      inq('closed', { status: 'closed', preferred_date: '2026-10-18' }),
    ]);
    expect(map.get('2026-10-18')!.viewings.map((i) => i.id)).toEqual(['utc', 'late']);
    expect(map.get('2026-10-18')!.preferred.map((i) => i.id)).toEqual(['pref']);
    expect(map.has('2026-10-17')).toBe(false);
  });

  it('clash = another scheduled viewing at the same instant (offsets compared as instants)', () => {
    const all = [inq('a', { status: 'scheduled', scheduled_at: '2026-10-18T10:00:00+08:00' }), inq('b', { status: 'contacted', scheduled_at: null })];
    expect(clashesWith(all, '2026-10-18T02:00:00Z', 'x').map((i) => i.id)).toEqual(['a']);
    expect(clashesWith(all, '2026-10-18T10:00:00+08:00', 'a')).toEqual([]);
    expect(clashesWith(all, '2026-10-18T10:30:00+08:00', 'x')).toEqual([]);
  });

  it('upcoming = scheduled today or tomorrow (Manila)', () => {
    const all = [
      inq('t', { status: 'scheduled', scheduled_at: '2026-10-15T09:00:00+08:00' }),
      inq('tm', { status: 'scheduled', scheduled_at: '2026-10-16T18:30:00+08:00' }),
      inq('later', { status: 'scheduled', scheduled_at: '2026-10-17T08:00:00+08:00' }),
    ];
    expect(upcomingViewings(all, '2026-10-15')).toBe(2);
  });

  it('weekOf: Sunday to Saturday around a date, across a month end', () => {
    expect(weekOf('2026-10-15')).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
    expect(weekOf('2026-11-01')[0]).toBe('2026-11-01');
    expect(weekOf('2026-10-31')[6]).toBe('2026-10-31');
  });
});
