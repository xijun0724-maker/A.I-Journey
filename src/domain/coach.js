/**
 * Coach — activity tracking, study recommendations, and weekly analytics
 */

import { Store } from "../core/store.js";
import { UI } from "../core/scope.js";
import { Tasks } from "./tasks.js";
import { sum, minutesToHM, sortBy } from "../utils/helpers.js";
import { DAY, addDays, dateOnly, fromIso, startOfDay } from "../utils/date.js";

export const Coach = {};

/* The activity row for today, created on first use. Kept private so every
   writer (minutes, completed, recall verdicts) lands in the same row. */
function activityRow() {
  const key = dateOnly(new Date());
  let row = Store.db.activity.filter(function (a) {
    return a.date === key;
  })[0];
  if (!row) {
    row = { date: key, minutes: 0, completed: 0 };
    Store.db.activity.push(row);
  }
  return row;
}

Coach.logActivity = function (minutes, completed) {
  const row = activityRow();
  row.minutes += minutes || 0;
  row.completed += completed || 0;
  Store.saveNow();
};

/**
 * Record one retrieval-practice attempt, hit or miss.
 *
 * The drill already knows the verdict — this is the wiring that used to stop
 * at the toast. Hits and misses are what let the guidance level fade
 * (`Coach.recallStats`), so a miss is data, not a dead end.
 *
 * A verdict can also be attributed to the document it came from, which is
 * what lets the Planner order review blocks by the material being missed
 * rather than by the date it happens to be due. Chat-turn questions span
 * passages from several documents at once, so they are attributed to
 * nothing and appear in the totals alone.
 *
 * @param {boolean} hit - true when the learner produced the answer
 * @param {string} [docId] - The document the drill was opened on
 */
Coach.logRecall = function (hit, docId) {
  const row = activityRow();
  if (!row.recall) row.recall = { hits: 0, misses: 0 };
  if (hit) row.recall.hits += 1;
  else row.recall.misses += 1;
  if (docId) {
    /* A breakdown of the same verdicts, never an addition to them: the day
       total above already counts this one. */
    if (!row.recall.byDoc) row.recall.byDoc = {};
    const d =
      row.recall.byDoc[docId] ||
      (row.recall.byDoc[docId] = { hits: 0, misses: 0 });
    if (hit) d.hits += 1;
    else d.misses += 1;
  }
  Store.saveNow();
};

/**
 * Cumulative retrieval-practice performance across the term.
 *
 * @param {string} [docId] - Restrict to one document's attributed verdicts
 * @returns {{attempts: number, hits: number, misses: number, rate: number}}
 *   `rate` is 0 when nothing has been attempted — no evidence, no fading.
 */
Coach.recallStats = function (docId) {
  let hits = 0;
  let misses = 0;
  (Store.db.activity || []).forEach(function (row) {
    const r = row.recall;
    if (!r) return;
    if (docId) {
      const d = (r.byDoc || {})[docId];
      if (!d) return;
      hits += d.hits || 0;
      misses += d.misses || 0;
      return;
    }
    hits += r.hits || 0;
    misses += r.misses || 0;
  });
  const attempts = hits + misses;
  return {
    attempts: attempts,
    hits: hits,
    misses: misses,
    rate: attempts ? hits / attempts : 0,
  };
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
