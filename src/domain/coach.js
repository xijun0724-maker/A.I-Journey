/**
 * Coach — activity tracking, study recommendations, and weekly analytics
 */

import { Store } from "../core/store.js";
import { UI } from "../core/state.js";
import { Tasks } from "./tasks.js";
import { sum, minutesToHM, sortBy } from "../utils/helpers.js";
import { DAY, addDays, dateOnly, fromIso, startOfDay } from "../utils/date.js";

export const Coach = {};

Coach.logActivity = function (minutes, completed) {
  const key = dateOnly(new Date());
  let row = Store.db.activity.filter(function (a) {
    return a.date === key;
  })[0];
  if (!row) {
    row = { date: key, minutes: 0, completed: 0 };
    Store.db.activity.push(row);
  }
  row.minutes += minutes || 0;
  row.completed += completed || 0;
  Store.saveNow();
};

Coach.currentWeek = function () {
  const t = fromIso(Store.db.settings.termStart);
  if (!t) return 1;
  return Math.max(
    1,
    Math.floor((startOfDay(new Date()) - startOfDay(t)) / (7 * DAY)) + 1,
  );
};

Coach.weekStartDate = function (week) {
  const t = fromIso(Store.db.settings.termStart);
  if (!t) return null;
  return addDays(t, (Math.max(1, week) - 1) * 7);
};

Coach.dailyCapacity = function (d) {
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  return Math.round(
    (weekend
      ? Store.db.settings.studyWeekend
      : Store.db.settings.studyWeekday) * 60,
  );
};

Coach.hoursNext = function (days) {
  let total = 0;
  const today = new Date();
  for (let i = 0; i < days; i++)
    total += Coach.dailyCapacity(addDays(today, i));
  return total;
};

Coach.recommendations = function () {
  const out = [];
  const db = Store.db;
  const open = Tasks.ranked(
    db.events.filter(function (e) {
      return Tasks.isOpen(e) && UI.inScope(e);
    }),
  );
  const week = Coach.currentWeek();
  const capacity7 = Coach.hoursNext(7);
  const need7 = sum(
    open.filter(function (e) {
      return Tasks.isDueSoon(e, 7);
    }),
    function (e) {
      return Tasks.remainingMinutes(e);
    },
  );

  if (open.length) {
    const top = open[0];
    out.push({
      kind: "priority",
      severity: "high",
      title: "Start with: " + top.title,
      detail:
        Store.courseName(top.courseId) +
        ", " +
        Tasks.reason(top) +
        ". It ranks highest of " +
        open.length +
        " open task" +
        (open.length === 1 ? "" : "s") +
        ".",
      actions: [{ label: "Open task", act: "event", arg: top.id }],
    });
  }

  if (need7 > 0) {
    const p = Math.round((need7 / Math.max(1, capacity7)) * 100);
    if (p > 100) {
      out.push({
        kind: "risk",
        severity: "high",
        title: "This week is overloaded",
        detail:
          "You need about " +
          minutesToHM(need7) +
          " of work in the next 7 days but only have roughly " +
          minutesToHM(capacity7) +
          " of study time configured. Trim scope or raise your available hours in Settings.",
        actions: [
          { label: "Adjust study hours", act: "view", arg: "settings" },
        ],
      });
    } else if (p > 70) {
      out.push({
        kind: "plan",
        severity: "med",
        title: "Tight but doable week",
        detail:
          "About " +
          minutesToHM(need7) +
          " of remaining work due within 7 days, against " +
          minutesToHM(capacity7) +
          " available (" +
          p +
          "% of capacity).",
        actions: [{ label: "Build study plan", act: "view", arg: "planner" }],
      });
    }
  }

  const lessons = sortBy(db.lessons.filter(UI.inScope), function (l) {
    return l.week;
  });
  let current = lessons.filter(function (l) {
    return l.week === week;
  })[0];
  if (!current)
    current = sortBy(
      lessons.filter(function (l) {
        return l.week >= week;
      }),
      function (l) {
        return l.week;
      },
    )[0];
  if (current) {
    const rds = db.readings.filter(function (r) {
      return r.courseId === current.courseId && r.week === current.week;
    });
    if (rds.length) {
      out.push({
        kind: "study",
        severity: "med",
        title: "This week: " + current.topic,
        detail:
          rds.length +
          " assigned reading" +
          (rds.length === 1 ? "" : "s") +
          " for " +
          Store.courseName(current.courseId) +
          ".",
        actions: [{ label: "Open Roadmap", act: "view", arg: "roadmap" }],
      });
    }
  }

  const overdue = open.filter(Tasks.isOverdue);
  if (overdue.length) {
    out.push({
      kind: "risk",
      severity: "high",
      title:
        overdue.length + " overdue item" + (overdue.length === 1 ? "" : "s"),
      detail:
        overdue
          .map(function (e) {
            return e.title;
          })
          .slice(0, 3)
          .join(", ") + (overdue.length > 3 ? "…" : ""),
      actions: [{ label: "View Tasks", act: "view", arg: "tasks" }],
    });
  }

  return out;
};

export default Coach;
