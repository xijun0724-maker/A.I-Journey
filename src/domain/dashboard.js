/**
 * Dashboard — KPIs and analytics for the main dashboard screen
 */

import { Store } from "../core/store.js";
import { CFG } from "../config/constants.js";
import { UI } from "../core/scope.js";
import { Tasks } from "./tasks.js";
import { Coach } from "./coach.js";
import { sum, pct } from "../utils/helpers.js";
import { DAY, fromIso, daysUntil } from "../utils/date.js";
import { clamp } from "../utils/helpers.js";

export const Dashboard = {};

Dashboard.kpis = function () {
  const evs = Store.db.events.filter(UI.inScope);
  const open = evs.filter(Tasks.isOpen);
  const overdue = open.filter(Tasks.isOverdue);
  const due7 = open.filter(function (e) {
    const n = daysUntil(e.due);
    return n !== null && n >= 0 && n <= 7;
  });
  const done = evs.filter(function (e) {
    return e.status === "done";
  });
  const graded = evs.filter(function (e) {
    return e.grade != null;
  });
  const avg = graded.length
    ? Math.round(
        sum(graded, function (e) {
          return e.grade;
        }) / graded.length,
      )
    : null;
  const remMin = sum(open, Tasks.remainingMinutes);
  return {
    courses: Store.db.courses.length,
    open: open.length,
    done: done.length,
    overdue: overdue.length,
    due7: due7.length,
    completion: pct(done.length, evs.length),
    avgGrade: avg,
    remainingMinutes: remMin,
  };
};

Dashboard.completionByCourse = function (opts) {
  /* opts.all — ignore the focused-course scope. The Courses index must list
     every course; otherwise a previously opened course locks the page to a
     single card and newly imported syllabuses never appear. */
  const list = opts && opts.all ? Store.db.courses.slice() : UI.courses();
  return list.map(function (c) {
    const evs = Store.db.events.filter(function (e) {
      return e.courseId === c.id;
    });
    const done = evs.filter(function (e) {
      return e.status === "done";
    }).length;
    const lessons = Store.db.lessons.filter(function (l) {
      return l.courseId === c.id;
    });
    const covered = lessons.filter(function (l) {
      return l.done;
    }).length;
    return {
      course: c,
      tasks: evs.length,
      done: done,
      pct: pct(done, evs.length),
      lessons: lessons.length,
      lessonsDone: covered,
      readings: Store.db.readings.filter(function (r) {
        return r.courseId === c.id;
      }).length,
      grade: Dashboard.courseGrade(c.id),
    };
  });
};

Dashboard.courseGrade = function (courseId) {
  const graded = Store.db.events.filter(function (e) {
    return e.courseId === courseId && e.grade != null;
  });
  if (!graded.length) return { grade: null, source: null, count: 0 };
  const withW = graded.filter(function (e) {
    return e.weight != null;
  });
  let grade;
  if (withW.length) {
    const tw = sum(withW, function (e) {
      return e.weight;
    });
    grade = tw
      ? sum(withW, function (e) {
          return e.grade * e.weight;
        }) / tw
      : null;
  }
  if (grade == null)
    grade =
      sum(graded, function (e) {
        return e.grade;
      }) / graded.length;
  return {
    grade: Math.round(grade * 10) / 10,
    count: graded.length,
    weighted: withW.length > 0,
  };
};

Dashboard.letter = function (p) {
  if (p == null) return null;
  for (const g of CFG.grades) {
    if (p >= g.min) return g.letter;
  }
  return "F";
};

Dashboard.readiness = function () {
  const term = fromIso(Store.db.settings.termStart),
    end = fromIso(Store.db.settings.termEnd);
  if (!term || !end) return null;
  const total = Math.max(1, (end - term) / DAY);
  const elapsed = clamp((new Date() - term) / DAY, 0, total);
  const timePct = Math.round((elapsed / total) * 100);
  const workPct = pct(
    Store.db.events.filter(function (e) {
      return UI.inScope(e) && !Tasks.isOpen(e);
    }).length,
    Store.db.events.filter(UI.inScope).length,
  );
  return { timePct: timePct, workPct: workPct, week: Coach.currentWeek() };
};

export default Dashboard;
