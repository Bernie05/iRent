import { formatDate, formatDateTime, formatDueDay, formatPeriod, formatPeso, localeFor } from './format';

describe('formatPeso (R47)', () => {
  it('matches the F2 acceptance vectors', () => {
    expect(formatPeso(4500, { whole: true })).toBe('₱4,500');
    expect(formatPeso(333.3)).toBe('₱333.30');
  });

  it('always shows ₱ and 2 decimals by default, in both locales', () => {
    for (const language of ['en', 'fil'] as const) {
      expect(formatPeso(4500, { language })).toBe('₱4,500.00');
      expect(formatPeso(0, { language })).toBe('₱0.00');
      expect(formatPeso(1234567.8, { language })).toBe('₱1,234,567.80');
      expect(formatPeso(4000, { whole: true, language })).toBe('₱4,000');
    }
  });

  it('never rounds centavos away, even with { whole: true }', () => {
    expect(formatPeso(4500.5, { whole: true })).toBe('₱4,500.50');
  });

  it('formats negative amounts with a sign (the "Owes" copy is built by the screen)', () => {
    expect(formatPeso(-250)).toMatch(/^-₱250\.00$/);
  });
});

describe('formatDate (NFR7: Asia/Manila)', () => {
  it('a timestamp at 2026-09-30T16:30Z is Oct 1 in Manila', () => {
    expect(formatDate('2026-09-30T16:30:00Z')).toBe('Oct 1, 2026');
    expect(formatDate(new Date('2026-09-30T16:30:00Z'))).toBe('Oct 1, 2026');
    expect(formatDate('2026-09-30T16:30:00Z', { language: 'fil' })).toBe('Okt 1, 2026');
  });

  it('a business date stays the same calendar day in every browser timezone', () => {
    expect(formatDate('2026-10-01')).toBe('Oct 1, 2026');
    expect(formatDate('2026-10-01', { style: 'long' })).toBe('October 1, 2026');
    expect(formatDate('2026-10-01', { language: 'fil', style: 'long' })).toBe('Oktubre 1, 2026');
  });

  it('formats a timestamp with its Manila time', () => {
    expect(formatDateTime('2026-09-30T16:30:00Z')).toMatch(/^Oct 1, 2026.*12:30/);
  });
});

describe('formatPeriod and formatDueDay', () => {
  it('shows a period as month and year', () => {
    expect(formatPeriod('2026-10-01')).toBe('October 2026');
    expect(formatPeriod('2026-10-01', { language: 'fil' })).toBe('Oktubre 2026');
  });

  it('shows the due day as an ordinal', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map((d) => formatDueDay(d))).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st',
    ]);
    expect(formatDueDay(5, { language: 'fil' })).toBe('ika-5');
  });

  it('maps languages to PH locales', () => {
    expect(localeFor('en')).toBe('en-PH');
    expect(localeFor('fil')).toBe('fil-PH');
  });
});
