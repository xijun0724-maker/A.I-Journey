import { describe, it, expect, beforeEach } from 'vitest';

import { Store } from '../../src/core/store.js';
import { Dashboard } from '../../src/domain/dashboard.js';
import { dashboardView } from '../../src/views/dashboard.js';

beforeEach(() => {
  Store.resetAll();
});

describe('Dashboard.letter', () => {
  it('returns null for null', () => {
    expect(Dashboard.letter(null)).toBeNull();
  });

  it('returns A for 92+', () => {
    expect(Dashboard.letter(95)).toBe('A');
    expect(Dashboard.letter(92)).toBe('A');
  });

  it('returns A- for 88-91', () => {
    expect(Dashboard.letter(90)).toBe('A-');
    expect(Dashboard.letter(88)).toBe('A-');
  });

  it('returns B+ for 84-87', () => {
    expect(Dashboard.letter(85)).toBe('B+');
  });

  it('returns B for 80-83', () => {
    expect(Dashboard.letter(80)).toBe('B');
  });

  it('returns F for below 60', () => {
    expect(Dashboard.letter(50)).toBe('F');
    expect(Dashboard.letter(0)).toBe('F');
  });
});

describe('Dashboard.kpis', () => {
  it('returns expected shape', () => {
    const k = Dashboard.kpis();
    expect(k).toHaveProperty('courses');
    expect(k).toHaveProperty('open');
    expect(k).toHaveProperty('done');
    expect(k).toHaveProperty('overdue');
    expect(k).toHaveProperty('due7');
    expect(k).toHaveProperty('completion');
    expect(k).toHaveProperty('avgGrade');
    expect(k).toHaveProperty('remainingMinutes');
  });

  it('counts open events', () => {
    Store.db.events = [
      { id: 'e1', status: 'open', courseId: null, type: 'assignment', subtasks: [] },
      { id: 'e2', status: 'done', courseId: null, type: 'quiz', subtasks: [] },
    ];
    const k = Dashboard.kpis();
    expect(k.open).toBe(1);
    expect(k.done).toBe(1);
  });

  it('counts overdue events', () => {
    Store.db.events = [{
      id: 'e1', status: 'open', courseId: null, type: 'assignment',
      due: new Date(Date.now() - 2 * 86400000).toISOString(), subtasks: [],
    }];
    const k = Dashboard.kpis();
    expect(k.overdue).toBe(1);
  });
});

describe('Dashboard.courseGrade', () => {
  it('returns null grade when no graded events', () => {
    Store.db.events = [{ id: 'e1', courseId: 'c1', grade: null }];
    const g = Dashboard.courseGrade('c1');
    expect(g.grade).toBeNull();
    expect(g.count).toBe(0);
  });

  it('calculates simple average', () => {
    Store.db.events = [
      { id: 'e1', courseId: 'c1', grade: 80, weight: null },
      { id: 'e2', courseId: 'c1', grade: 90, weight: null },
    ];
    const g = Dashboard.courseGrade('c1');
    expect(g.grade).toBe(85);
    expect(g.count).toBe(2);
    expect(g.weighted).toBe(false);
  });

  it('calculates weighted average', () => {
    Store.db.events = [
      { id: 'e1', courseId: 'c1', grade: 80, weight: 30 },
      { id: 'e2', courseId: 'c1', grade: 90, weight: 70 },
    ];
    const g = Dashboard.courseGrade('c1');
    expect(g.grade).toBe(87);
    expect(g.weighted).toBe(true);
  });
});

describe('Dashboard.upcoming', () => {
  it('returns sorted upcoming events', () => {
    const soon = new Date(Date.now() + 1 * 86400000).toISOString();
    const later = new Date(Date.now() + 7 * 86400000).toISOString();
    Store.db.events = [
      { id: 'e1', status: 'open', due: later, courseId: null, type: 'assignment', subtasks: [] },
      { id: 'e2', status: 'open', due: soon, courseId: null, type: 'quiz', subtasks: [] },
    ];
    const up = Dashboard.upcoming(5);
    expect(up.length).toBe(2);
    expect(up[0].id).toBe('e2');
    expect(up[1].id).toBe('e1');
  });

  it('excludes done events', () => {
    Store.db.events = [
      { id: 'e1', status: 'done', due: new Date().toISOString(), courseId: null },
    ];
    expect(Dashboard.upcoming(5)).toHaveLength(0);
  });
});

describe('Dashboard.readiness', () => {
  it('returns null when term dates missing', () => {
    Store.db.settings.termStart = '';
    Store.db.settings.termEnd = '';
    expect(Dashboard.readiness()).toBeNull();
  });

  it('returns timePct, workPct, week', () => {
    const now = new Date();
    Store.db.settings.termStart = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
    Store.db.settings.termEnd = new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10);
    const r = Dashboard.readiness();
    expect(r).toHaveProperty('timePct');
    expect(r).toHaveProperty('workPct');
    expect(r).toHaveProperty('week');
    expect(r.timePct).toBeGreaterThanOrEqual(0);
    expect(r.timePct).toBeLessThanOrEqual(100);
  });
});

describe('Dashboard - Synchronized "To do:" card', () => {
  it('renders clean Welcome / Empty state card when no courses and no events exist', () => {
    Store.resetAll();
    const html = dashboardView.fn();
    expect(html).toContain('Your academic dashboard is blank');
    expect(html).toContain('Import syllabus');
    expect(html).toContain('Add course');
  });

  it('renders heading "To do:" with + Add to-do button when data is loaded', () => {
    Store.db.courses = [{ id: 'c1', title: 'Calculus I', code: 'MATH101', color: '#3b82f6' }];
    const html = dashboardView.fn();
    expect(html).toContain('<h2>To do:</h2>');
    expect(html).toContain('+ Add to-do');
    expect(html).toContain('data-act="task-new"');
  });

  it('renders clean empty state without redundant duplicate button when there are no open tasks', () => {
    Store.db.events = [
      { id: 'e1', title: 'Finished Lab', status: 'done', priority: 'Medium', subtasks: [] },
    ];
    const html = dashboardView.fn();
    expect(html).toContain('All caught up! No pending to-do items.');
    expect(html).not.toContain('+ Add your first to-do');
  });

  it('synchronizes with open tasks, rendering square checklist items, priority and deadline', () => {
    Store.db.courses = [
      { id: 'c1', title: 'Calculus I', code: 'MATH101', color: '#3b82f6' }
    ];
    Store.db.events = [
      {
        id: 't1',
        title: 'Review Lecture 4 notes',
        status: 'todo',
        priority: 'Critical',
        due: new Date(Date.now() + 86400000).toISOString(),
        courseId: 'c1',
      },
      {
        id: 't2',
        title: 'Complete Worksheet 2',
        status: 'todo',
        priority: 'Low',
        due: null,
      },
      {
        id: 't3',
        title: 'Old homework',
        status: 'done',
        priority: 'High',
      },
    ];

    const html = dashboardView.fn();
    expect(html).toContain('2 open');
    expect(html).toContain('Review Lecture 4 notes');
    expect(html).toContain('Complete Worksheet 2');
    expect(html).not.toContain('Old homework');

    // Square checkboxes matching Tasks view
    expect(html).toContain('class="chk-square" data-act="task-toggle" data-id="t1"');
    expect(html).toContain('class="chk-square" data-act="task-toggle" data-id="t2"');

    // Priority badges and course chip
    expect(html).toContain('Critical');
    expect(html).toContain('Low');
    expect(html).toContain('MATH101');

    // Action buttons & footer
    expect(html).toContain('data-act="event-edit" data-id="t1"');
    expect(html).not.toContain('>Edit</button>');
    expect(html).toContain('status-todo');
    expect(html).toContain('View all to-dos &rarr;');
    expect(html).toContain('data-act="nav" data-arg="tasks"');
  });

  it('immediately updates when a task is marked done', () => {
    Store.db.events = [
      { id: 't1', title: 'Task 1', status: 'todo', priority: 'High' },
    ];
    let html = dashboardView.fn();
    expect(html).toContain('1 open');
    expect(html).toContain('Task 1');

    Store.db.events[0].status = 'done';
    html = dashboardView.fn();
    expect(html).toContain('0 open');
    expect(html).not.toContain('Task 1');
    expect(html).toContain('All caught up!');
  });
});

describe('Practise from the timeline', () => {
  const soon = () => new Date(Date.now() + 2 * 86400000).toISOString();

  beforeEach(() => {
    Store.db.courses = [
      { id: 'c1', title: 'Thermal Physics', code: 'PHYS201', color: '#3b82f6' },
    ];
    Store.db.documents = [{ id: 'd1', courseId: 'c1', name: 'Thermo notes' }];
    Store.db.events = [
      {
        id: 'e1',
        title: 'Essay draft',
        status: 'todo',
        type: 'assignment',
        courseId: 'c1',
        due: soon(),
        sourceDocId: 'd1',
        subtasks: [],
      },
    ];
  });

  it('drills the reading the deadline covers, with no chat question', () => {
    const html = dashboardView.fn();

    expect(html).toContain('data-act="practise-doc" data-id="d1"');
    expect(html).toContain('Open the recall drill on the reading this covers');
  });

  it('says nothing when the deadline carries no material', () => {
    delete Store.db.events[0].sourceDocId;

    expect(dashboardView.fn()).not.toContain('practise-doc');
  });

  it('drops the affordance once the deadline is done', () => {
    Store.db.events[0].status = 'done';

    /* Completed work is not what a review block re-tests. */
    expect(dashboardView.fn()).not.toContain('practise-doc');
  });
});

