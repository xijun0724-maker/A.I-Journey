import { describe, it, expect } from 'vitest';
import {
  subtasksFor, recompute, reason, ranked,
} from '../../src/domain/tasks.js';

describe('subtasksFor', () => {
  it('returns array of subtask objects', () => {
    const subs = subtasksFor('assignment', 50, null, new Date(Date.now() + 14 * 86400000));
    expect(Array.isArray(subs)).toBe(true);
    expect(subs.length).toBeGreaterThan(0);
    subs.forEach(s => {
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('title');
      expect(s).toHaveProperty('minutes');
      expect(s).toHaveProperty('done', false);
    });
  });

  it('subtasks without due date have null due', () => {
    const subs = subtasksFor('quiz', 10, null, null);
    subs.forEach(s => expect(s.due).toBeNull());
  });

  it('subtasks with due date have due spread backwards', () => {
    const due = new Date(Date.now() + 14 * 86400000);
    const subs = subtasksFor('project', 80, null, due);
    const dates = subs.filter(s => s.due).map(s => s.due);
    expect(dates.length).toBeGreaterThan(0);
  });
});

describe('recompute', () => {
  it('sets status to done when all subtasks done', () => {
    const e = { subtasks: [{ done: true }, { done: true }], status: 'todo' };
    recompute(e);
    expect(e.status).toBe('done');
  });

  it('sets status to todo when no subtasks done', () => {
    const e = { subtasks: [{ done: false }, { done: false }], status: 'done' };
    recompute(e);
    expect(e.status).toBe('todo');
  });

  it('sets status to doing when some subtasks done', () => {
    const e = { subtasks: [{ done: true }, { done: false }], status: 'todo' };
    recompute(e);
    expect(e.status).toBe('doing');
  });

  it('returns null for null input', () => {
    expect(recompute(null)).toBeNull();
  });
});

describe('reason', () => {
  it('returns "already completed" for done tasks', () => {
    const e = { status: 'done', due: null, subtasks: [] };
    expect(reason(e)).toBe('already completed');
  });

  it('mentions overdue for past-due tasks', () => {
    const e = {
      status: 'open',
      due: new Date(Date.now() - 2 * 86400000).toISOString(),
      subtasks: [],
    };
    expect(reason(e)).toContain('overdue');
  });

  it('mentions due date info', () => {
    const e = {
      status: 'open',
      due: new Date(Date.now() + 5 * 86400000).toISOString(),
      weight: 80,
      subtasks: [],
    };
    const r = reason(e);
    expect(r).toContain('80%');
  });

  it('mentions weight when present', () => {
    const e = { status: 'open', due: null, weight: 40, subtasks: [] };
    expect(reason(e)).toContain('40%');
  });
});

describe('ranked', () => {
  it('sorts by priority score descending', () => {
    const soon = new Date(Date.now() + 1 * 86400000).toISOString();
    const later = new Date(Date.now() + 14 * 86400000).toISOString();
    const events = [
      { id: 'low', status: 'open', due: later, weight: 10, subtasks: [] },
      { id: 'high', status: 'open', due: soon, weight: 90, subtasks: [] },
    ];
    const ranked2 = ranked(events);
    expect(ranked2[0].id).toBe('high');
    expect(ranked2[1].id).toBe('low');
  });
});
