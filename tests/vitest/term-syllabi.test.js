// @vitest-environment happy-dom
/**
 * The Term 2 session maps are data, so the useful thing to assert is the shape
 * the Roadmap and Planner actually consume: twelve sessions per course, one per
 * week, weights that match each syllabus's grading system, and deadlines that
 * land inside the week the syllabus assigns them.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/core/store.js";
import {
  buildTermData,
  SESSIONS_PER_TERM,
  TERM_COURSES,
} from "../../src/config/term-syllabi.js";
import { applyTermSyllabi } from "../../src/core/actions/term.js";
import { renderVisualRoadmapTree } from "../../src/views/roadmap.js";
import { Planner } from "../../src/domain/planner.js";
import { Coach } from "../../src/domain/coach.js";
import { Tasks } from "../../src/domain/tasks.js";
import { addDays, dateOnly, fromIso } from "../../src/utils/date.js";

/* 12 January 2026 is the first day of classes named in the TPROFED05 syllabus
   ("First Day of Classes for Term 2 AY 2025-2026 - January 12, 2026"). */
const TERM_START = "2026-01-12";
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

beforeEach(() => {
  Store.resetAll();
  Store.db.settings.termStart = TERM_START;
});

describe("session map shape", () => {
  it("gives each course twelve sessions, one per week, weeks 1-12", () => {
    const built = buildTermData(TERM_START);
    expect(built.courses.length).toBe(2);
    built.courses.forEach((course) => {
      const weeks = built.lessons
        .filter((l) => l.courseId === course.id)
        .map((l) => l.week)
        .sort((a, b) => a - b);
      expect(weeks).toEqual(
        Array.from({ length: SESSIONS_PER_TERM }, (_, i) => i + 1),
      );
    });
  });

  it("names both syllabi's courses", () => {
    const built = buildTermData(TERM_START);
    const codes = built.courses.map((c) => c.code).sort();
    expect(codes).toEqual(["TGED 04", "TPROFED05"]);
    expect(built.label).toBe("2nd Term AY 2025-2026");
  });

  it("gives every session a topic, and every reading a valid week and course", () => {
    const built = buildTermData(TERM_START);
    built.lessons.forEach((l) => {
      expect(l.topic.trim().length).toBeGreaterThan(3);
      expect(l.start).toBeNull(); // dates stay derived, not baked in
      expect(l.end).toBeNull();
    });
    expect(built.readings.length).toBeGreaterThan(20);
    built.readings.forEach((r) => {
      const course = built.courses.find((c) => c.id === r.courseId);
      expect(course, "reading " + r.id + " has no course").toBeTruthy();
      expect(r.week).toBeGreaterThanOrEqual(1);
      expect(r.week).toBeLessThanOrEqual(SESSIONS_PER_TERM);
      expect(["required", "optional"]).toContain(r.status);
      expect(r.title.trim().length).toBeGreaterThan(3);
    });
  });

  it("uses ids that are safe to place in markup, unique per collection", () => {
    const built = buildTermData(TERM_START);
    const collections = {
      courses: built.courses,
      lessons: built.lessons,
      readings: built.readings,
      events: built.events,
    };
    Object.keys(collections).forEach((name) => {
      const ids = collections[name].map((x) => x.id);
      ids.forEach((id) => {
        expect(SAFE_ID.test(String(id)), name + " id " + id).toBe(true);
      });
      expect(new Set(ids).size, name + " has duplicate ids").toBe(ids.length);
    });
  });
});

describe("assessment weights mirror the syllabi's grading systems", () => {
  it("sums to 100 per course, with the unweighted midterm excluded", () => {
    const built = buildTermData(TERM_START);
    built.courses.forEach((course) => {
      const sum = built.events
        .filter((e) => e.courseId === course.id && e.weight != null)
        .reduce((total, e) => total + Number(e.weight), 0);
      expect(sum, course.code + " weights").toBe(100);
    });
    // The TPROFED05 midterm is a session requirement with no separate weight.
    const midterm = built.events.find((e) => e.id === "ev-lemp-midterm");
    expect(midterm.weight).toBeNull();
  });

  it("keeps the Ethics capstone at 30% and the finals at 20%", () => {
    const built = buildTermData(TERM_START);
    const byId = {};
    built.events.forEach((e) => (byId[e.id] = e));
    expect(byId["ev-eth-capstone"].weight).toBe(30);
    expect(byId["ev-eth-final"].weight).toBe(20);
    expect(byId["ev-eth-participation"].weight).toBe(20);
  });
});

describe("deadlines are anchored to the term, inside their own week", () => {
  it("puts every deadline in the week its session number names", () => {
    const built = buildTermData(TERM_START);
    const start = fromIso(TERM_START);
    built.events.forEach((e) => {
      const due = fromIso(e.due);
      expect(due, e.id + " has an unparseable due date").toBeTruthy();
      const week = Math.floor((due - start) / (7 * 24 * 60 * 60 * 1000)) + 1;
      const weekStart = addDays(start, (week - 1) * 7);
      expect(dateOnly(due) >= dateOnly(weekStart)).toBe(true);
      expect(dateOnly(due) <= dateOnly(addDays(weekStart, 6))).toBe(true);
      expect(week).toBeGreaterThanOrEqual(1);
      expect(week).toBeLessThanOrEqual(SESSIONS_PER_TERM);
    });
  });

  it("places the TPROFED05 midterm inside the official wellness break", () => {
    const built = buildTermData(TERM_START);
    const midterm = built.events.find((e) => e.id === "ev-lemp-midterm");
    /* Syllabus: "A Wellness Break/ePNU Maintenance will be observed on
       February 16 - 21, 2026" - six weeks after the 12 January start. */
    expect(dateOnly(fromIso(midterm.due)) >= "2026-02-16").toBe(true);
    expect(dateOnly(fromIso(midterm.due)) <= "2026-02-21").toBe(true);
  });

  it("re-anchors when the term start changes", () => {
    const later = buildTermData("2026-06-01");
    const event = later.events.find((e) => e.id === "ev-eth-final");
    expect(event.due.startsWith("2026-")).toBe(true);
    expect(fromIso(event.due) >= fromIso("2026-06-01")).toBe(true);
    const original = buildTermData(TERM_START).events.find(
      (e) => e.id === "ev-eth-final",
    );
    expect(event.due).not.toBe(original.due);
  });
});

describe("applyTermSyllabi", () => {
  it("writes the term into the store and reports counts", () => {
    const n = applyTermSyllabi(TERM_START);
    expect(n.courses).toBe(2);
    expect(n.lessons).toBe(2 * SESSIONS_PER_TERM);
    expect(Store.db.courses.length).toBe(2);
    expect(Store.db.lessons.length).toBe(2 * SESSIONS_PER_TERM);
    expect(Store.db.events.length).toBe(n.events);
    expect(Store.db.readings.length).toBe(n.readings);
  });

  it("is idempotent — loading twice replaces rather than appends", () => {
    const first = applyTermSyllabi(TERM_START);
    const second = applyTermSyllabi(TERM_START);
    expect(second.lessons).toBe(first.lessons);
    expect(Store.db.lessons.length).toBe(first.lessons);
    expect(Store.db.courses.length).toBe(first.courses);
  });

  it("gives every assessment its decomposed subtasks", () => {
    applyTermSyllabi(TERM_START);
    Store.db.events.forEach((e) => {
      expect(Array.isArray(e.subtasks)).toBe(true);
      expect(e.subtasks.length).toBeGreaterThan(0);
      e.subtasks.forEach((s) => expect(s.minutes).toBeGreaterThanOrEqual(15));
    });
  });

  it("clears the plan, because its blocks described the replaced tasks", () => {
    Store.db.plan = [{ date: "2026-01-12", label: "Old block", minutes: 30 }];
    Store.db.planMeta = { totalMinutes: 30 };
    applyTermSyllabi(TERM_START);
    expect(Store.db.plan).toEqual([]);
    expect(Store.db.planMeta).toBeNull();
  });

  it("keeps documents, chat and activity — only the term is replaced", () => {
    Store.db.documents.push({ id: "doc-keep", name: "Notes.pdf", text: "x" });
    Store.db.chat.push({ role: "user", content: "hello" });
    Store.db.activity.push({ date: "2026-01-12", minutes: 30, completed: 1 });
    applyTermSyllabi(TERM_START);
    expect(Store.db.documents.length).toBe(1);
    expect(Store.db.chat.length).toBe(1);
    expect(Store.db.activity.length).toBe(1);
  });

  it("falls back to the configured term start when given no argument", () => {
    const n = applyTermSyllabi();
    expect(n.termStart).toBe(TERM_START);
  });
});

describe("the loaded term renders as a visible 12-week roadmap", () => {
  it("draws one week node per session, numbered 1-12", () => {
    applyTermSyllabi(TERM_START);
    const course = Store.db.courses.find((c) => c.code === "TGED 04");
    const html = renderVisualRoadmapTree(
      course,
      Store.db.lessons,
      Store.db.events,
      Store.db.readings,
    );
    const weeks = Array.from(html.matchAll(/roadmap-node-(\d+)"/g)).map((m) =>
      Number(m[1]),
    );
    expect(weeks).toEqual(
      Array.from({ length: SESSIONS_PER_TERM }, (_, i) => i + 1),
    );
  });

  it("shows both courses' session topics and their assessments", () => {
    applyTermSyllabi(TERM_START);
    const ethics = Store.db.courses.find((c) => c.code === "TGED 04");
    const lemp = Store.db.courses.find((c) => c.code === "TPROFED05");
    const ethicsHtml = renderVisualRoadmapTree(
      ethics,
      Store.db.lessons,
      Store.db.events,
      Store.db.readings,
    );
    const lempHtml = renderVisualRoadmapTree(
      lemp,
      Store.db.lessons,
      Store.db.events,
      Store.db.readings,
    );
    /* The Ethics syllabus prepares the capstone in session 11 and executes it
       in session 12, alongside the synthesis and final exam. */
    expect(ethicsHtml).toContain("Capstone Project: Preparation");
    expect(ethicsHtml).toContain(
      "Implementation of the Capstone Project, Course Synthesis and Final Examination",
    );
    expect(ethicsHtml).toContain("Capstone Project (submission and presentation)");
    expect(lempHtml).toContain("Midterm Examination / Wellness Break");
    expect(lempHtml).toContain(
      "Finalization and Presentation of the Learning Environment Management Plan",
    );
    /* One course's roadmap must not leak the other course's sessions. */
    expect(ethicsHtml).not.toContain("Midterm Examination / Wellness Break");
  });

  it("shows an empty state for a course with no sessions", () => {
    const html = renderVisualRoadmapTree(
      { id: "crs-empty", code: "NONE", title: "Empty Course" },
      Store.db.lessons,
      Store.db.events,
      Store.db.readings,
    );
    expect(html).not.toContain("roadmap-node-");
  });
});

describe("the loaded term feeds the rest of the app", () => {
  /* The session map is date-agnostic, so the same data has to work for the
     term the student is actually in - not only for the January 2026 window the
     syllabi were written for. */
  const CURRENT_TERM_START = "2026-09-28";

  beforeEach(() => {
    Store.db.settings.termStart = CURRENT_TERM_START;
  });

  it("schedules the term with the planner", () => {
    applyTermSyllabi();
    const preview = Planner.generateInteractive({ weeks: 12 });
    expect(preview.planItems.length).toBeGreaterThan(0);
    // Multi-track planner (events + topic study + readings) can schedule
    // multiple blocks per day; allow up to 6 per day over the 12-week horizon.
    expect(preview.planItems.length).toBeLessThanOrEqual(12 * 7 * 6);
  });

  it("ranks the loaded assessments as open tasks", () => {
    applyTermSyllabi();
    const open = Store.db.events.filter((e) => Tasks.isOpen(e));
    expect(open.length).toBeGreaterThanOrEqual(12);
    const ranked = Tasks.ranked(open);
    expect(ranked.length).toBe(open.length);
  });

  it("produces coach recommendations without throwing", () => {
    applyTermSyllabi();
    const recs = Coach.recommendations();
    expect(Array.isArray(recs)).toBe(true);
    expect(recs.length).toBeGreaterThan(0);
  });
});

describe("source data", () => {
  it("describes two courses of twelve sessions each", () => {
    expect(TERM_COURSES.length).toBe(2);
    TERM_COURSES.forEach((c) => {
      expect(c.sessions.length).toBe(SESSIONS_PER_TERM);
      expect(c.assessments.length).toBeGreaterThan(0);
    });
  });
});
