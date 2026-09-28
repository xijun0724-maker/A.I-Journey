// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from '../../src/core/store.js';
import { UIState } from '../../src/core/scope.js';
import { dashboardView } from '../../src/views/dashboard.js';
import { calendarViewDef, stepCalendarMonth, getActiveCalendarMonthYear } from '../../src/views/calendar.js';
import { loadMoodleSample } from '../../src/core/actions/courses.js';

describe('Moodle 4.x Dashboard & Calendar Specification', () => {
  beforeEach(() => {
    Store.resetAll();
    Store.db.courses = [
      {
        id: "c-vid-prod",
        title: "VIDEO AND AUDIO PRODUCTION",
        code: "BTLE TP-S-ICT10",
      },
    ];
    UIState.set('timelineFilter', 'all');
    UIState.set('timelineSort', 'dates');
    UIState.set('timelineSearch', '');
    UIState.set('calendarCourseId', 'all');
    UIState.set('calendarMonth', 8); // September (0-indexed)
    UIState.set('calendarYear', 2026);
  });

  it('renders both Timeline and Calendar cards on the dashboard', () => {
    const html = dashboardView.fn();
    expect(html).toContain('id="timelineCard"');
    expect(html).toContain('id="calendarCard"');
    expect(html).toContain('Timeline');
    expect(html).toContain('Calendar');
  });

  it('renders Moodle Timeline controls: filter, sort, and search input', () => {
    const html = dashboardView.fn();
    expect(html).toContain('id="timelineFilterSelect"');
    expect(html).toContain('id="timelineSortSelect"');
    expect(html).toContain('id="timelineSearchInput"');
    expect(html).toContain('Search by activity type or name');
    expect(html).toContain('Sort by dates');
    expect(html).toContain('Sort by courses');
    expect(html).toContain('Overdue');
  });

  it('renders Moodle Calendar controls: course selector, New Event button, and 7-day grid', () => {
    const html = calendarViewDef.fn();
    expect(html).toContain('id="calendarCourseSelect"');
    expect(html).toContain('id="btnCalNewEvent"');
    expect(html).toContain('New event');
    expect(html).toContain('September 2026');
    expect(html).toContain('Mon');
    expect(html).toContain('Tue');
    expect(html).toContain('Wed');
    expect(html).toContain('Thu');
    expect(html).toContain('Fri');
    expect(html).toContain('Sat');
    expect(html).toContain('Sun');
  });

  it('populates and displays exact Moodle sample schedule from reference screenshots', () => {
    loadMoodleSample();
    expect(Store.db.courses.length).toBe(3);
    expect(Store.db.events.length).toBe(18);

    const html = dashboardView.fn();
    // Timeline contains activities from screenshot
    expect(html).toContain('Activity #6. Application of Split Screen');
    expect(html).toContain('Individual Project: Marcotting in Plants');
    expect(html).toContain('Company Interview Transcript and Photo Documentation');
    expect(html).toContain('VIDEO AND AUDIO PRODUCTION');
    expect(html).toContain('Add submission');

    // Calendar contains events and dates
    expect(html).toContain('cal-event-bullet');
    expect(html).toContain('Attendance');
    expect(html).toContain('+ 7 more');
  });

  it('supports stepping through calendar months', () => {
    const initial = getActiveCalendarMonthYear();
    expect(initial.month).toBe(8); // September

    stepCalendarMonth(1);
    const next = getActiveCalendarMonthYear();
    expect(next.month).toBe(9); // October

    stepCalendarMonth(-2);
    const prev = getActiveCalendarMonthYear();
    expect(prev.month).toBe(7); // August
  });
});
