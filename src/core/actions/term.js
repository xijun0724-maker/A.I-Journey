/**
 * Preset term loader — PNU Teacher Education Pathways, Term 2 AY 2025-2026.
 *
 * Loading is split the same way the backup importer is: `applyTermSyllabi` is
 * the testable part (no dialog, no navigation, returns counts), and
 * `loadTermSyllabi` is the thin UI wrapper that confirms first.
 *
 * Deadlines are the only dated thing it writes: lessons keep their week number
 * so the Roadmap derives each week's window from the configured term start.
 */

import { Store } from "../store.js";
import { UIState } from "../scope.js";
import { Router } from "../router.js";
import { toast } from "../../utils/dom.js";
import { confirm } from "../../utils/feedback.js";
import { Tasks } from "../../domain/tasks.js";
import { buildTermData, TERM_SOURCES } from "../../config/term-syllabi.js";

/**
 * Replace the syllabus-derived collections with the preset term.
 *
 * Documents, chunks, chat and activity are left alone — only the course,
 * lesson, reading and task collections are replaced, because they are the ones
 * this term describes.
 *
 * @param {string} [termStartIso] - YYYY-MM-DD; defaults to Settings -> term start
 * @returns {{label: string, termStart: string, courses: number, lessons: number,
 *   readings: number, events: number}}
 */
export function applyTermSyllabi(termStartIso) {
  const built = buildTermData(termStartIso || Store.db.settings.termStart);

  const events = built.events.map(function (ev) {
    const due = ev.due ? new Date(ev.due) : null;
    return Object.assign({}, ev, {
      subtasks: Tasks.subtasksFor(ev.type, ev.weight, null, due),
    });
  });
  events.forEach(function (ev) {
    Tasks.recompute(ev);
  });

  Store.db.courses = built.courses;
  Store.db.lessons = built.lessons;
  Store.db.readings = built.readings;
  Store.db.events = events;

  /* Plan blocks describe the tasks that were just replaced; keeping them would
     leave the Planner scheduling work that no longer exists. */
  Store.db.plan = [];
  Store.db.planMeta = null;

  Store.saveNow();
  Store.emit("change", { entity: "courses", op: "replace", id: null });

  return {
    label: built.label,
    termStart: built.termStart,
    courses: built.courses.length,
    lessons: built.lessons.length,
    readings: built.readings.length,
    events: events.length,
  };
}

/** Confirm, then load. */
export function loadTermSyllabi() {
  confirm(
    "Replace all courses, tasks, lessons and readings with the PNU Term 2 " +
      "AY 2025-2026 syllabi? Each course loads as 12 weekly sessions, one " +
      "session per week. Deadlines are dated from your term start, so " +
      "re-run this after changing it. Documents, notes and chat are kept. " +
      "Sources: " +
      TERM_SOURCES.join("; "),
    { title: "Load Term 2 syllabi", ok: "Load syllabi", danger: true },
  ).then(function (yes) {
    if (!yes) return;
    const n = applyTermSyllabi();
    /* Land on the weekly roadmap the same way a course card does, so the result
       of the load is visible immediately. The course scope is left alone — the
       roadmap falls back to the first course, and Tasks and the Dashboard stay
       unfiltered. */
    UIState.set("tab.courses", "roadmap");
    UIState.set("tab.roadmap", "roadmap");
    Router.navigate("courses");
    toast(
      "Loaded " +
        n.courses +
        " courses, " +
        n.lessons +
        " weekly sessions and " +
        n.events +
        " assessments (" +
        n.label +
        ").",
      "ok",
    );
  });
}
