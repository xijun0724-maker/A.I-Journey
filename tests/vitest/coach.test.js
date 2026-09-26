import { describe, it, expect, beforeEach } from 'vitest';

import { Store } from '../../src/core/store.js';
import { Coach } from '../../src/domain/coach.js';
import { dateOnly } from '../../src/utils/date.js';

beforeEach(() => {
  Store.resetAll();
});

describe('Coach.currentWeek', () => {
  it('returns a positive number', () => {
    const w = Coach.currentWeek();
    expect(w).toBeGreaterThanOrEqual(1);
  });
});

describe('Coach.weekStartDate', () => {
  it('returns a date for week 1', () => {
    const d = Coach.weekStartDate(1);
    expect(d).toBeInstanceOf(Date);
  });

  it('returns null if termStart is invalid', () => {
    Store.db.settings.termStart = '';
    expect(Coach.weekStartDate(1)).toBeNull();
  });
});

describe('Coach.dailyCapacity', () => {
  it('returns positive minutes for a weekday', () => {
    const wed = new Date('2026-09-16'); // Wednesday
    expect(Coach.dailyCapacity(wed)).toBeGreaterThan(0);
  });

  it('returns positive minutes for a weekend day', () => {
    const sat = new Date('2026-09-19'); // Saturday
    expect(Coach.dailyCapacity(sat)).toBeGreaterThan(0);
  });

  it('weekend capacity differs from weekday', () => {
    const wed = new Date('2026-09-16');
    const sat = new Date('2026-09-19');
    const wd = Coach.dailyCapacity(wed);
    const we = Coach.dailyCapacity(sat);
    expect(wd).not.toBe(we);
  });
});

describe('Coach.hoursNext', () => {
  it('returns total minutes for N days', () => {
    const h = Coach.hoursNext(7);
    expect(h).toBeGreaterThan(0);
  });

  it('scales linearly', () => {
    const h1 = Coach.hoursNext(1);
    const h7 = Coach.hoursNext(7);
    expect(h7).toBeGreaterThan(h1);
  });
});

describe('Coach.logActivity', () => {
  it('creates an activity row for today', () => {
    Coach.logActivity(30, 1);
    const today = dateOnly(new Date());
    const row = Store.db.activity.find(a => a.date === today);
    expect(row).toBeDefined();
    expect(row.minutes).toBe(30);
    expect(row.completed).toBe(1);
  });

  it('accumulates on repeated calls', () => {
    Coach.logActivity(20, 0);
    Coach.logActivity(10, 1);
    const today = dateOnly(new Date());
    const row = Store.db.activity.find(a => a.date === today);
    expect(row.minutes).toBe(30);
    expect(row.completed).toBe(1);
  });
});

describe('Coach per-document recall', () => {
  it('files attributed verdicts against the document as well as the day', () => {
    Coach.logRecall(true, 'doc-a');
    Coach.logRecall(false, 'doc-a');
    Coach.logRecall(true); // a chat-turn verdict: no single document behind it

    const today = dateOnly(new Date());
    const row = Store.db.activity.find(a => a.date === today);
    expect(row.recall).toEqual({
      hits: 2,
      misses: 1,
      byDoc: { 'doc-a': { hits: 1, misses: 1 } },
    });
  });

  it('breaks stats down per document, and only for the one asked about', () => {
    Coach.logRecall(false, 'doc-a');
    Coach.logRecall(false, 'doc-a');
    Coach.logRecall(true, 'doc-b');

    expect(Coach.recallStats('doc-a')).toEqual({
      attempts: 2, hits: 0, misses: 2, rate: 0,
    });
    expect(Coach.recallStats('doc-b')).toEqual({
      attempts: 1, hits: 1, misses: 0, rate: 1,
    });
    /* Nothing drilled yet is evidence of nothing, not a perfect record. */
    expect(Coach.recallStats('doc-c')).toEqual({
      attempts: 0, hits: 0, misses: 0, rate: 0,
    });
    /* The breakdown is a view of the totals, never an addition to them. */
    expect(Coach.recallStats()).toEqual({
      attempts: 3, hits: 1, misses: 2, rate: 1 / 3,
    });
  });

  it('leaves unattributed verdicts in the totals alone', () => {
    Coach.logRecall(true);
    Coach.logRecall(false);

    const row = Store.db.activity[0];
    expect(row.recall).toEqual({ hits: 1, misses: 1 });
    expect(Coach.recallStats('doc-a')).toEqual({
      attempts: 0, hits: 0, misses: 0, rate: 0,
    });
  });
});

describe('Coach.recommendations', () => {
  it('returns an array', () => {
    const recs = Coach.recommendations();
    expect(Array.isArray(recs)).toBe(true);
  });

  it('returns priority rec for open tasks', () => {
    Store.db.events = [{
      id: 'e1', title: 'Essay', type: 'assignment', status: 'open',
      courseId: null, due: new Date(Date.now() + 3 * 86400000).toISOString(),
      weight: 50, subtasks: [],
    }];
    const recs = Coach.recommendations();
    const priority = recs.find(r => r.kind === 'priority');
    expect(priority).toBeDefined();
    expect(priority.title).toContain('Essay');
  });

  it('returns overdue rec for past-due tasks', () => {
    Store.db.events = [{
      id: 'e2', title: 'Late hw', type: 'assignment', status: 'open',
      courseId: null, due: new Date(Date.now() - 2 * 86400000).toISOString(),
      weight: 30, subtasks: [],
    }];
    const recs = Coach.recommendations();
    const overdue = recs.find(r => r.kind === 'risk' && r.title.includes('overdue'));
    expect(overdue).toBeDefined();
  });
});
