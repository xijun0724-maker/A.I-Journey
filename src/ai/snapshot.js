/**
 * Snapshot builder — captures current term state for AI recommendations.
 */

import { Store } from "../core/store.js";
import { UI } from "../core/scope.js";
import { Tasks } from "../domain/tasks.js";
import { Coach } from "../domain/coach.js";
import { Dashboard } from "../domain/dashboard.js";
import { sum } from "../utils/helpers.js";
import { dateOnly, daysUntil } from "../utils/date.js";

export function snapshot() {
  const open = Tasks.ranked(
    Store.db.events.filter((e) => Tasks.isOpen(e) && UI.inScope(e)),
  );
  const week = Coach.currentWeek();
  const lessons = (Store.db.lessons || [])
    .filter((l) => UI.inScope(l))
    .sort((a, b) => (a.week || 99) - (b.week || 99));
  const soon = Store.db.events
    .filter((e) => Tasks.isOpen(e) && e.due && UI.inScope(e))
    .sort((a, b) => (a.due < b.due ? -1 : 1))
    .slice(0, 12);
  return {
    today: dateOnly(new Date()),
    termWeek: week,
    termStart: Store.db.settings.termStart,
    termEnd: Store.db.settings.termEnd,
    studyHoursPerWeek: Math.round(
      Store.db.settings.studyWeekday * 5 + Store.db.settings.studyWeekend * 2,
    ),
    courses: Store.db.courses.map((c) => {
      const evs = Store.db.events.filter((e) => e.courseId === c.id);
      const g = Dashboard.courseGrade(c.id);
      return {
        code: c.code,
        title: c.title,
        instructor: c.instructor,
        tasksDone: evs.filter((e) => e.status === "done").length,
        tasksOpen: evs.filter((e) => e.status !== "done").length,
        gradeSoFar: g.grade,
        upcomingTopics: lessons
          .filter((l) => l.courseId === c.id && l.week >= week)
          .slice(0, 3)
          .map((l) => "W" + l.week + ": " + l.topic),
      };
    }),
    upcomingDeadlines: soon.map((e) => ({
      title: e.title,
      course:
        Store.db.courses.find((c) => c.id === e.courseId)?.code || "Unassigned",
      type: e.type,
      due: e.due,
      daysLeft: daysUntil(e.due),
      weight: e.weight,
      progress: Tasks.progress(e),
      minutesLeft: Tasks.remainingMinutes(e),
      nextSubtask:
        ((e.subtasks || []).find((s) => !s.done) || {}).title || null,
    })),
    workloadNext7DaysMinutes: sum(
      open.filter((e) => {
        const n = daysUntil(e.due);
        return n !== null && n <= 7;
      }),
      Tasks.remainingMinutes,
    ),
    studiedLast7DaysMinutes: sum(
      Store.db.activity.filter((a) => daysUntil(a.date + "T00:00") >= -6),
      (a) => a.minutes,
    ),
  };
}
