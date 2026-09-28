import { describe, it, expect } from 'vitest';
import { DAY, iso, dateOnly, fromIso, startOfDay, addDays, daysUntil, fmtDate, fmtTime, rel, mondayOf, parseDate, parseTime, fmtDay } from '../../src/utils/date.js';

describe('DAY constant', () => {
  it('equals 86400000 (ms in a day)', () => {
    expect(DAY).toBe(86400000);
  });
});

describe('iso', () => {
  it('converts Date to ISO string', () => {
    const d = new Date(2026, 0, 15, 10, 30);
    expect(iso(d)).toBe('2026-01-15T10:30');
  });

  it('returns null for null input', () => {
    expect(iso(null)).toBeNull();
  });

  it('returns null for invalid date', () => {
    expect(iso('invalid')).toBeNull();
  });

  it('handles string input', () => {
    expect(iso('2026-06-15T14:30')).toBe('2026-06-15T14:30');
  });
});

describe('dateOnly', () => {
  it('extracts date portion', () => {
    expect(dateOnly(new Date(2026, 5, 15, 14, 30))).toBe('2026-06-15');
  });

  it('returns null for null', () => {
    expect(dateOnly(null)).toBeNull();
  });
});

describe('fromIso', () => {
  it('parses ISO string to Date', () => {
    const d = fromIso('2026-03-10T08:00');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(10);
  });

  it('returns null for null', () => {
    expect(fromIso(null)).toBeNull();
  });

  it('returns null for invalid string', () => {
    expect(fromIso('not-a-date')).toBeNull();
  });
});

describe('startOfDay', () => {
  it('returns midnight', () => {
    const d = new Date(2026, 5, 15, 14, 30, 45);
    const result = startOfDay(d);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it('does not mutate original', () => {
    const d = new Date(2026, 5, 15, 14, 30);
    startOfDay(d);
    expect(d.getHours()).toBe(14);
  });
});

describe('addDays', () => {
  it('adds days', () => {
    const d = new Date(2026, 0, 1);
    const result = addDays(d, 5);
    expect(result.getDate()).toBe(6);
  });

  it('subtracts days with negative', () => {
    const d = new Date(2026, 0, 10);
    const result = addDays(d, -3);
    expect(result.getDate()).toBe(7);
  });

  it('does not mutate original', () => {
    const d = new Date(2026, 0, 1);
    addDays(d, 5);
    expect(d.getDate()).toBe(1);
  });
});

describe('daysUntil', () => {
  it('calculates days until future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const isoStr = iso(future);
    expect(daysUntil(isoStr)).toBe(10);
  });

  it('returns 0 for today', () => {
    const today = dateOnly(new Date());
    expect(daysUntil(today + 'T00:00')).toBe(0);
  });

  it('returns null for null', () => {
    expect(daysUntil(null)).toBeNull();
  });
});

describe('fmtDate', () => {
  it('formats a date string', () => {
    const result = fmtDate('2026-06-15T10:30');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns "No date" for null', () => {
    expect(fmtDate(null)).toBe('No date');
  });
});

describe('fmtTime', () => {
  it('formats ISO time to 12h clock string by default', () => {
    expect(fmtTime('2026-09-24T23:59')).toBe('11:59 PM');
    expect(fmtTime('2026-09-24T14:30:00Z')).toBe('2:30 PM');
    expect(fmtTime('2026-09-24T09:05')).toBe('9:05 AM');
    expect(fmtTime('2026-09-24T00:00')).toBe('12:00 AM');
  });

  it('formats 24h when specified', () => {
    expect(fmtTime('2026-09-24T23:59', '24h')).toBe('23:59');
  });

  it('returns empty string for null or date without time', () => {
    expect(fmtTime(null)).toBe('');
    expect(fmtTime('2026-09-24')).toBe('');
    expect(fmtTime('')).toBe('');
  });
});

describe('rel', () => {
  it('returns relative time string', () => {
    const result = rel('2026-06-15T10:30');
    expect(typeof result).toBe('string');
  });

  it('returns "no date" for null', () => {
    expect(rel(null)).toBe('no date');
  });

  it('returns "today" for today', () => {
    const today = iso(new Date());
    expect(rel(today)).toBe('today');
  });
});

describe('mondayOf', () => {
  it('returns Monday of the week', () => {
    const d = new Date(2026, 8, 17); // Thursday
    const monday = mondayOf(d);
    expect(monday.getDay()).toBe(1);
  });
});

describe('parseDate', () => {
  it('parses month-first dates', () => {
    const d = parseDate('Sep 15, 2026');
    expect(d).toBeInstanceOf(Date);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(15);
  });

  it('parses day-first dates', () => {
    const d = parseDate('15 September 2026');
    expect(d).toBeInstanceOf(Date);
    expect(d.getDate()).toBe(15);
  });

  it('parses ISO dates', () => {
    const d = parseDate('2026-03-10');
    expect(d).toBeInstanceOf(Date);
    expect(d.getMonth()).toBe(2);
  });

  it('returns null for unparseable', () => {
    expect(parseDate('no date here')).toBeNull();
  });
});

describe('parseTime', () => {
  it('parses AM time', () => {
    const t = parseTime('10:30 AM');
    expect(t).toEqual({ h: 10, m: 30 });
  });

  it('parses PM time', () => {
    const t = parseTime('2:00 PM');
    expect(t).toEqual({ h: 14, m: 0 });
  });

  it('parses noon', () => {
    const t = parseTime('12:00 PM');
    expect(t).toEqual({ h: 12, m: 0 });
  });

  it('parses midnight', () => {
    const t = parseTime('12:00 AM');
    expect(t).toEqual({ h: 0, m: 0 });
  });

  it('parses without AM/PM', () => {
    const t = parseTime('14:30');
    expect(t).toEqual({ h: 14, m: 30 });
  });

  it('returns null for invalid', () => {
    expect(parseTime('noon')).toBeNull();
  });
});

describe('fmtDay', () => {
  it('formats as "Weekday, Mon DD"', () => {
    const result = fmtDay(new Date(2026, 8, 17));
    expect(result).toMatch(/Thursday/);
    expect(result).toMatch(/Sep/);
    expect(result).toMatch(/17/);
  });

  it('returns "Unscheduled" for null', () => {
    expect(fmtDay(null)).toBe('Unscheduled');
  });
});
