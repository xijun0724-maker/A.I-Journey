/**
 * Planner — greedy day-by-day study scheduler
 * Allocates work units to available study time, respecting priorities and deadlines.
 */

import { CFG } from "../config/constants.js";
import { Store } from "../core/store.js";
import { Tasks } from "./tasks.js";
import { Coach } from "./coach.js";
import { uid, sum, sortBy, clamp, slug } from "../utils/helpers.js";
import {
  addDays,
  dateOnly,
  fromIso,
  startOfDay,
  daysUntil,
} from "../utils/date.js";

export const Planner = {};

/**
 * The document a `"Review:"` block re-tests.
 *
 * The block is named after the assessment ("Review: Essay draft"), but the
 * drill needs material. The link is the one the Library already uses: the
 * document the event was imported with, else the document attached to the
 * reading the event covers.
 *
 * Null when the event carries no material. Such a block still schedules —
 * it just cannot be drilled from the Planner or ranked against the others
 * on how badly it is being missed.
 *
 * @param {object} e - An event
 * @returns {string|null}
 */
function docIdFor(e) {
  if (!e) return null;
  const has = function (id) {
    return !!id && !!Store.doc(id);
  };
  if (has(e.sourceDocId)) return e.sourceDocId;
  const readings = Store.db.readings || [];
  const links = e.readingIds || [];
  for (let i = 0; i < links.length; i++) {
    const r = readings.find(function (x) {
      return x.id === links[i];
    });
    if (r && has(r.docId)) return r.docId;
  }
  return null;
}
Planner.docIdFor = docIdFor;

/* Term start + week number → the first day of that week (null when unknown). */
function weekDue(week) {
  if (!week) return null;
  const settings = (Store.db && Store.db.settings) || {};
  const termStart = fromIso(settings.termStart);
  if (!termStart) return null;
  return dateOnly(addDays(termStart, (Number(week) - 1) * 7));
}

/**
 * Work units to schedule, highest priority first.
 *
 * @param {string} [courseId] - Course filter; "all" (or empty) for every course
 * @param {Array<string>} [exclude] - Event ids the student removed from the
 *   proposal; an event left out here is left out entirely (its subtasks too),
 *   so the recomputed plan cannot quietly put it back.
 */
Planner.units = function (courseId, exclude) {
  const out = [];
  const skip = {};
  (exclude || []).forEach(function (id) {
    if (id) skip[id] = true;
  });
  const seenEvents = {};
  const seenUnits = {};
  const pushUnit = function (unit) {
    const key = [
      unit.courseId || "",
      slug(unit.title),
      unit.due ? unit.due.slice(0, 10) : "none",
    ].join("|");
    if (seenUnits[key]) return;
    seenUnits[key] = true;
    out.push(unit);
  };
  const events = Store.db.events.filter(Tasks.isOpen).filter(function (event) {
    if (skip[event.id]) return false;
    if (courseId && courseId !== "all" && event.courseId !== courseId)
      return false;
    const key = [
      event.courseId || "",
      slug(event.title),
      event.due ? event.due.slice(0, 10) : "none",
    ].join("|");
    if (seenEvents[key]) return false;
    seenEvents[key] = true;
    return true;
  });
  Tasks.ranked(events).forEach(function (e) {
    if (courseId && courseId !== "all" && e.courseId !== courseId) return;
    const p = Tasks.priority(e);
    const dueSoon = e.due && daysUntil(e.due) <= 2;
    if (dueSoon) {
      const reviewMinutes = Math.min(
        30,
        Math.max(15, Math.round(Tasks.remainingMinutes(e) / 4 / 5) * 5),
      );
      const docId = docIdFor(e);
      const stats = docId ? Coach.recallStats(docId) : null;
      pushUnit({
        eventId: e.id,
        subtaskId: null,
        title: "Review: " + e.title,
        minutes: reviewMinutes,
        courseId: e.courseId,
        due: e.due,
        score: p.score + 20,
        /* A review exists to re-test material, so how much of it is being
           missed is what orders review blocks among themselves — see the
           sort at the end of this function. No verdicts yet reads as 0,
           which leaves the block exactly where it was before. */
        review: true,
        docId: docId,
        missRate: stats && stats.attempts ? stats.misses / stats.attempts : 0,
      });
    }
    const subs = (e.subtasks || []).filter(function (s) {
      return !s.done;
    });
    if (!subs.length) {
      pushUnit({
        eventId: e.id,
        subtaskId: null,
        title: e.title,
        minutes: Tasks.remainingMinutes(e) || 60,
        courseId: e.courseId,
        due: e.due,
        score: p.score,
      });
      return;
    }
    subs.forEach(function (s) {
      const sd = s.due && daysUntil(s.due) >= 0 ? s.due : e.due;
      pushUnit({
        eventId: e.id,
        subtaskId: s.id,
        title: e.title + " — " + s.title,
        minutes: s.minutes || 30,
        courseId: e.courseId,
        due: sd || null,
        score: p.score + (sd ? clamp(6 - (daysUntil(sd) || 0) / 3, -4, 6) : 0),
      });
    });
  });
  // ── Track 2: Topic Study ───────────────────────────────────────────────
  // Schedule prep time for each uncovered syllabus lesson before its week.
  const lessons = (Store.db.lessons || [])
    .filter(function (l) {
      if (l.done) return false;
      if (courseId && courseId !== "all" && l.courseId !== courseId)
        return false;
      return true;
    });
  lessons.forEach(function (l) {
    // Derive a due date: the START of the lesson's week, or null.
    const due = l.start || weekDue(l.week);
    const minutes = 45; // default topic study block
    const key = [l.courseId || "", slug(l.topic || ""), due || "none"].join("|");
    if (seenUnits[key]) return;
    seenUnits[key] = true;
    out.push({
      eventId: null,
      subtaskId: null,
      lessonId: l.id,
      title: "Study: " + (l.topic || "Lesson W" + l.week),
      minutes,
      courseId: l.courseId || null,
      due,
      score: due ? Math.max(1, 8 - daysUntil(due) / 7) : 1,
      track: "topic",
    });
  });

  // ── Track 3: Required Readings ─────────────────────────────────────────
  // Schedule one reading block per unread reading, sized by page count.
  const readings = (Store.db.readings || [])
    .filter(function (r) {
      if (r.status === "done" || r.optional) return false;
      if (courseId && courseId !== "all" && r.courseId !== courseId)
        return false;
      return true;
    });
  readings.forEach(function (r) {
    const pages = parseInt(r.pages, 10) || 0;
    // ~2 min/page, min 20 min, max 90 min
    const minutes = Math.min(90, Math.max(20, pages ? pages * 2 : 30));
    const due = weekDue(r.week);
    const key = [r.courseId || "", slug(r.title || ""), due || "none"].join("|");
    if (seenUnits[key]) return;
    seenUnits[key] = true;
    out.push({
      eventId: null,
      subtaskId: null,
      readingId: r.id,
      title: "Read: " + (r.title || "Reading"),
      minutes,
      courseId: r.courseId || null,
      due,
      score: due ? Math.max(0.5, 5 - daysUntil(due) / 7) : 0.5,
      track: "reading",
    });
  });

  const ordered = sortBy(out, function (u) {
    return -u.score;
  });

  /* Review blocks keep the slots their score earned them, exactly as
     before, but among themselves they are ordered by how much of their
     material is being missed — due-date proximity (what `score` carries)
     is only the tiebreak. That is the whole point of a review block: it
     schedules retrieval of the ideas being forgotten, not of the paperwork
     that happens to come due first, and the misses already exist in the
     activity log the drill writes to. */
  const slots = [];
  ordered.forEach(function (u, i) {
    if (u.review) slots.push(i);
  });
  if (slots.length > 1) {
    const reviews = slots.map(function (i) {
      return ordered[i];
    });
    reviews.sort(function (a, b) {
      if (b.missRate !== a.missRate) return b.missRate - a.missRate;
      return b.score - a.score;
    });
    slots.forEach(function (slot, i) {
      ordered[slot] = reviews[i];
    });
  }
  return ordered;
};

/**
 * Build a study schedule. The single source of truth for scheduling:
 * Planner.generateInteractive is a thin wrapper over this, and
 * Planner.commit writes its result. Does not touch the database.
 *
 * @param {object} [opts]
 * @param {number} [opts.weeks] - Horizon in weeks (default settings.plannerWeeks)
 * @param {string} [opts.courseId] - Course filter; "all" for every course
 * @param {Array<string>} [opts.exclude] - Event ids to leave out of the plan
 * @returns {{days: Array, planItems: Array, unscheduled: Array, atRisk: Array, meta: object}}
 */
function schedule(opts) {
  opts = opts || {};
  const weeks = opts.weeks || Store.db.settings.plannerWeeks || 6;
  const courseId = opts.courseId || Store.db.settings.courseId || "all";
  const exclude = opts.exclude || [];
  const { minBlock, maxBlock, blockGap, weekendStart, weekdayStart } =
    CFG.planner;
  const start = startOfDay(new Date());
  const days = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    days.push({
      date: dateOnly(d),
      capacity: Coach.dailyCapacity(d),
      used: 0,
      items: [],
    });
  }
  const queue = Planner.units(courseId, exclude);
  const unscheduled = [],
    overflow = [];

  queue.forEach(function (u) {
    let remaining = u.minutes,
      guard = 0;
    while (remaining > 0 && guard++ < 40) {
      let target = null;
      for (let i = 0; i < days.length; i++) {
        if (days[i].capacity - days[i].used < minBlock) continue;
        if (u.due && days[i].date > u.due.slice(0, 10)) continue;
        target = days[i];
        break;
      }
      if (!target) {
        for (let j = 0; j < days.length; j++) {
          if (days[j].capacity - days[j].used >= minBlock) {
            target = days[j];
            break;
          }
        }
        if (!target) {
          unscheduled.push(u);
          remaining = 0;
          break;
        }
        if (u.due && target.date > u.due.slice(0, 10)) overflow.push(u);
      }
      const take = Math.min(remaining, target.capacity - target.used, maxBlock);
      if (take < minBlock) {
        unscheduled.push(u);
        remaining = 0;
        break;
      }
      target.items.push({
        id: uid("pl"),
        date: target.date,
        minutes: take,
        label: u.title,
        eventId: u.eventId,
        subtaskId: u.subtaskId,
        courseId: u.courseId,
        due: u.due,
        score: Math.round(u.score),
        /* The material this block re-tests, so the Planner can offer the
           drill on the document rather than on the course. */
        docId: u.docId || null,
        done: false,
      });
      target.used += take;
      remaining -= take;
      if (remaining > 0 && target.items.length > 6) break;
    }
    if (remaining > 0) unscheduled.push(u);
  });

  days.forEach(function (day) {
    const d = fromIso(day.date + "T00:00");
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    let cursor = (weekend ? weekendStart : weekdayStart) * 60;
    day.items.forEach(function (it) {
      it.startMinutes = cursor;
      it.start = pad(Math.floor(cursor / 60)) + ":" + pad(cursor % 60);
      it.end =
        pad(Math.floor((cursor + it.minutes) / 60)) +
        ":" +
        pad((cursor + it.minutes) % 60);
      cursor += it.minutes + blockGap;
    });
  });
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  const planItems = [];
  days.forEach(function (day) {
    day.items.forEach(function (it) {
      planItems.push(it);
    });
  });
  const uniqueTitles = function (items) {
    const seen = {};
    return sortBy(items, function (item) {
      return item.title;
    })
      .map(function (item) {
        return item.title;
      })
      .filter(function (title) {
        const key = slug(title);
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
  };
  const excluded = sortBy(
    exclude
      .map(function (id) {
        return Store.event(id);
      })
      .filter(Boolean),
    function (e) {
      return e.title || "";
    },
  ).map(function (e) {
    return e.title;
  });
  const meta = {
    generatedAt: new Date().toISOString(),
    weeks: weeks,
    courseId: courseId,
    excluded: excluded,
    capacityMinutes: sum(days, function (day) {
      return day.capacity;
    }),
    unscheduled: uniqueTitles(unscheduled),
    atRisk: uniqueTitles(overflow),
    totalMinutes: sum(planItems, function (p) {
      return p.minutes;
    }),
  };
  return {
    days,
    planItems,
    unscheduled: meta.unscheduled,
    atRisk: meta.atRisk,
    meta,
  };
}

/**
 * Preview a schedule without persisting it.
 * Returns { days, planItems, unscheduled, atRisk, meta } for the review UI.
 * Accept the preview with Planner.commit(result).
 */
Planner.generateInteractive = schedule;

/**
 * Persist a schedule onto the database. Shared by the auto-generate action
 * and the accepted-preview action so both write the same shape.
 *
 * @param {{planItems: Array, meta: object}} result - A schedule() result
 * @returns {object} The stored planMeta
 */
Planner.commit = function (result) {
  Store.plan.save(
    (result && result.planItems) || [],
    (result && result.meta) || null,
  );
  return Store.db.planMeta;
};

Planner.toggle = function (planId) {
  const it = (Store.db.plan || []).filter(function (p) {
    return p.id === planId;
  })[0];
  if (!it) return null;
  it.done = !it.done;
  if (it.done) Coach.logActivity(it.minutes, 0);
  if (it.subtaskId) {
    const ev = Store.event(it.eventId);
    const st =
      ev &&
      (ev.subtasks || []).find(function (s) {
        return s.id === it.subtaskId;
      });
    const blocks = (Store.db.plan || []).filter(function (block) {
      return block.eventId === it.eventId && block.subtaskId === it.subtaskId;
    });
    if (st) {
      const complete =
        blocks.length > 0 &&
        blocks.every(function (block) {
          return block.done;
        });
      const started =
        blocks.length > 0 &&
        blocks.some(function (block) {
          return block.done;
        });
      st.done = complete;
      if (complete) {
        st.completedAt = st.completedAt || new Date().toISOString();
      } else {
        st.completedAt = undefined;
      }
      Tasks.recompute(ev);
      if (complete) {
        ev.status = "done";
      } else if (started) {
        ev.status = "doing";
      } else {
        ev.status = "todo";
      }
    }
  }
  Store.saveNow();
  Store.emit("change", { entity: "plan", op: "toggle", id: planId });
  return it;
};

export default Planner;
