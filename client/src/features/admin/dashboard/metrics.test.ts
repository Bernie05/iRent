import type { ChargeRow, RenterRow } from '../../../types/api';
import { allocate, byKind, collectionOf, daysBetween, debtsByRenter, fixedPerMonth, net, nextBirthday, notPaid, pct, upcomingBirthdays } from './metrics';

const row = (id: string, p: Partial<ChargeRow>): ChargeRow => ({
  id,
  item: { type: 'charge', id, period: '2026-09-01' },
  tenancy_id: 't',
  amount: 100,
  paid_total: 0,
  paid_from_credit: 0,
  remaining: 100,
  due_date: '2026-09-10',
  status: 'unpaid',
  is_overdue: false,
  renter: { id: `r-${id}`, full_name: id },
  ...p,
});

const items = [
  row('Ana', { amount: 4500, paid_total: 4500, remaining: 0, status: 'paid' }),
  row('Ben', { amount: 4000, paid_total: 1500, remaining: 2500, status: 'partial', is_overdue: true, due_date: '2026-09-20' }),
  row('Cara', { amount: 4500, remaining: 4500, is_overdue: true, due_date: '2026-09-01' }),
  row('Elec', { item: { type: 'bill_share', id: 'Elec', period: '2026-09-01' }, amount: 300.1, paid_total: 0.2, remaining: 299.9, status: 'partial', due_date: '2026-09-30' }),
];

describe('KPI math', () => {
  it('pct rounds to one decimal and is null with nothing to divide', () => {
    expect(pct(3, 6)).toBe(50);
    expect(pct(18800, 30400)).toBe(61.8);
    expect(pct(5, 0)).toBeNull();
  });

  it('net is exact in centavos, and can be negative', () => {
    expect(net(0.3, 0.1)).toBe(0.2);
    expect(net(0, 5990)).toBe(-5990);
  });

  it('collection: billed, collected, rate and the paid/partial/unpaid split (centavo-safe)', () => {
    const c = collectionOf(items);
    expect(c.billed).toBe(13300.1);
    expect(c.collected).toBe(6000.2);
    expect(c.outstanding).toBe(7299.9);
    expect(c.rate).toBe(45.1);
    expect(c.buckets.map((b) => [b.status, b.count, b.amount, b.remaining])).toEqual([
      ['paid', 1, 4500, 0],
      ['partial', 2, 4300.1, 2799.9],
      ['unpaid', 1, 4500, 4500],
    ]);
  });

  it('collection filters by item type (rent / bills)', () => {
    expect(byKind(items, 'rent').map((i) => i.id)).toEqual(['Ana', 'Ben', 'Cara']);
    expect(byKind(items, 'bills').map((i) => i.id)).toEqual(['Elec']);
    expect(collectionOf([]).rate).toBeNull();
  });
});

describe('not-paid filter', () => {
  it('drops paid items and sorts the most overdue first', () => {
    expect(notPaid(items, 'all').map((i) => i.id)).toEqual(['Cara', 'Ben', 'Elec']);
  });
  it.each([
    ['overdue', ['Cara', 'Ben']],
    ['partial', ['Ben', 'Elec']],
    ['unpaid', ['Cara']],
  ] as const)('%s', (filter, ids) => {
    expect(notPaid(items, filter).map((i) => i.id)).toEqual(ids);
  });
  it('counts days between business dates', () => {
    expect(daysBetween('2026-09-01', '2026-10-14')).toBe(43);
    expect(daysBetween('2026-10-20', '2026-10-14')).toBe(-6);
  });
});

describe('birthdays', () => {
  const renter = (name: string, birthday: string | null, status: RenterRow['status'] = 'active') => ({ id: name, full_name: name, birthday, status }) as RenterRow;

  it('next occurrence rolls to next year once passed; Feb 29 falls on Feb 28', () => {
    expect(nextBirthday('2000-10-14', '2026-10-14')).toBe('2026-10-14');
    expect(nextBirthday('2000-01-05', '2026-10-14')).toBe('2027-01-05');
    expect(nextBirthday('2004-02-29', '2026-02-01')).toBe('2026-02-28');
    expect(nextBirthday('2004-02-29', '2028-02-01')).toBe('2028-02-29');
  });

  it('this month and next only, active renters only, soonest first with today at 0', () => {
    const list = upcomingBirthdays(
      [
        renter('Zed', '2001-11-30'),
        renter('Ana', '2004-10-14'),
        renter('Ben', '2000-10-23'),
        renter('Gil', '1992-10-19', 'moved_out'),
        renter('Old', '1990-10-01'), // passed this month → next year, out of window
        renter('Dec', '1999-12-01'), // in two months
        renter('None', null),
      ],
      '2026-10-14',
    );
    expect(list.map((b) => [b.renter.full_name, b.daysAway, b.turns])).toEqual([
      ['Ana', 0, 22],
      ['Ben', 9, 26],
      ['Zed', 47, 25],
    ]);
  });

  it('wraps December into January', () => {
    expect(upcomingBirthdays([renter('Jan', '2000-01-03')], '2026-12-20').map((b) => b.date)).toEqual(['2027-01-03']);
  });
});

describe('not paid, grouped by renter', () => {
  const r = (id: string, renter: string, period: string, due: string, remaining: number, p: Partial<ChargeRow> = {}) =>
    row(id, { item: { type: 'charge', id, period }, renter: { id: renter, full_name: renter }, due_date: due, amount: remaining, remaining, ...p });
  const open = [
    r('cara-oct', 'Cara', '2026-10-01', '2026-10-01', 3000, { is_overdue: true }),
    r('cara-sep', 'Cara', '2026-09-01', '2026-09-01', 3000, { is_overdue: true }),
    { ...r('cara-elec', 'Cara', '2026-09-01', '2026-09-30', 300), item: { type: 'bill_share' as const, id: 'cara-elec', period: '2026-09-01' } },
    r('ben-sep', 'Ben', '2026-09-01', '2026-09-20', 2500, { status: 'partial', amount: 4000, paid_total: 1500 }),
    r('ana-sep', 'Ana', '2026-09-01', '2026-09-05', 0, { status: 'paid' }),
  ];

  it('sums each renter\'s open items, counts distinct months, oldest due first', () => {
    const debts = debtsByRenter(open, 'all');
    expect(debts.map((d) => [d.renter.full_name, d.total, d.months, d.oldestDue, d.status])).toEqual([
      ['Cara', 6300, 2, '2026-09-01', 'overdue'],
      ['Ben', 2500, 1, '2026-09-20', 'partial'],
    ]);
    expect(debts[0].items.map((i) => i.id)).toEqual(['cara-sep', 'cara-elec', 'cara-oct']);
  });

  it('a renter matches the filter when any item does, and keeps all their items', () => {
    expect(debtsByRenter(open, 'partial').map((d) => d.renter.full_name)).toEqual(['Ben']);
    expect(debtsByRenter(open, 'overdue').map((d) => [d.renter.full_name, d.items.length])).toEqual([['Cara', 3]]);
    expect(debtsByRenter(open, 'unpaid').map((d) => d.renter.full_name)).toEqual(['Cara']);
  });

  it('allocates oldest first: full, then partial, and the excess becomes credit', () => {
    const [cara] = debtsByRenter(open, 'all');
    const lines = (a: ReturnType<typeof allocate>) => a.lines.map((l) => [l.row.id, l.applied, l.left]);
    const full = allocate(cara.items, 3000);
    expect(lines(full)).toEqual([['cara-sep', 3000, 0], ['cara-elec', 0, 300], ['cara-oct', 0, 3000]]);
    expect([full.remaining, full.credit]).toEqual([3300, 0]);

    const partial = allocate(cara.items, 3150.5);
    expect(lines(partial)).toEqual([['cara-sep', 3000, 0], ['cara-elec', 150.5, 149.5], ['cara-oct', 0, 3000]]);
    expect(partial.remaining).toBe(3149.5);

    const excess = allocate(cara.items, 7000);
    expect([excess.remaining, excess.credit]).toEqual([0, 700]);
  });
});

describe('recurring: fixed per month', () => {
  const tpl = (amount: number, active: boolean, starts_on: string, ends_on: string | null = null) =>
    ({ id: String(amount), name: 'x', category: 'other', amount, due_day: 5, starts_on, ends_on, active, note: null, last_posted_period: null }) as const;
  it('sums active templates whose months include the period (centavo-safe)', () => {
    const list = [tpl(2500, true, '2026-07-01'), tpl(1699, true, '2026-07-01'), tpl(549.1, true, '2026-07-01'), tpl(300, false, '2026-07-01'), tpl(999, true, '2026-11-01'), tpl(100, true, '2026-01-01', '2026-09-01')];
    expect(fixedPerMonth([...list], '2026-10-01')).toEqual({ total: 4748.1, count: 3 });
    expect(fixedPerMonth([...list], '2026-09-01')).toEqual({ total: 4848.1, count: 4 });
  });
});
