import { describe, it, expect, beforeEach } from "vitest";

import { Store } from "../../src/core/store.js";
import { CFG } from "../../src/config/constants.js";
import { Planner } from "../../src/domain/planner.js";
import { Coach } from "../../src/domain/coach.js";

beforeEach(() => {
  Store.resetAll();
});

describe("Planner config", () => {
  it("CFG.planner has required fields", () => {
    expect(CFG.planner).toHaveProperty("minBlock");
    expect(CFG.planner).toHaveProperty("maxBlock");
    expect(CFG.planner).toHaveProperty("blockGap");
    expect(CFG.planner).toHaveProperty("weekendStart");
    expect(CFG.planner).toHaveProperty("weekdayStart");
    expect(CFG.planner.minBlock).toBeGreaterThan(0);
    expect(CFG.planner.maxBlock).toBeGreaterThanOrEqual(CFG.planner.minBlock);
  });

  it("CFG.planner values are reasonable", () => {
    expect(CFG.planner.minBlock).toBeLessThanOrEqual(120);
    expect(CFG.planner.maxBlock).toBeLessThanOrEqual(240);
    expect(CFG.planner.blockGap).toBeGreaterThanOrEqual(0);
    expect(CFG.planner.weekdayStart).toBeGreaterThanOrEqual(0);
    expect(CFG.planner.weekdayStart).toBeLessThan(24);
    expect(CFG.planner.weekendStart).toBeGreaterThanOrEqual(0);
    expect(CFG.planner.weekendStart).toBeLessThan(24);
  });
});

describe("Store empty state", () => {
  it("db has plan and planMeta after reset", () => {
    expect(Store.db).toHaveProperty("plan");
    expect(Store.db).toHaveProperty("planMeta");
    expect(Array.isArray(Store.db.plan)).toBe(true);
    expect(Store.db.plan).toHaveLength(0);
    expect(Store.db.planMeta).toBeNull();
  });

  it("settings has plannerWeeks default", () => {
    expect(Store.db.settings).toHaveProperty("plannerWeeks");
    expect(Store.db.settings.plannerWeeks).toBeGreaterThan(0);
  });

  it("settings has study time defaults", () => {
    expect(Store.db.settings).toHaveProperty("studyWeekday");
    expect(Store.db.settings).toHaveProperty("studyWeekend");
    expect(Store.db.settings.studyWeekday).toBeGreaterThan(0);
    expect(Store.db.settings.studyWeekend).toBeGreaterThan(0);
  });
});

describe("Planner.clear", () => {
  it("clears plan and planMeta", () => {
    Store.db.plan = [{ id: "p1" }];
    Store.db.planMeta = { generatedAt: "2026-01-01" };
    Planner.clear();
    expect(Store.db.plan).toEqual([]);
    expect(Store.db.planMeta).toBeNull();
  });
});

describe("Planner.generate", () => {
  it("reports work that cannot fit configured study capacity", () => {
    Store.db.settings.studyWeekday = 0;
    Store.db.settings.studyWeekend = 0;
    Store.db.events = [
      {
        id: "e-capacity",
        title: "Large assignment",
        type: "assignment",
        status: "todo",
        courseId: null,
        due: null,
        subtasks: [
          { id: "s-capacity", title: "Work", minutes: 60, done: false },
        ],
      },
    ];

    const meta = Planner.generate();

    expect(meta.totalMinutes).toBe(0);
    expect(meta.unscheduled).toContain("Large assignment — Work");
  });

  it("adds a short review block before a near-term deadline", () => {
    Store.db.settings.studyWeekday = 3;
    Store.db.settings.studyWeekend = 3;
    const due = new Date(Date.now() + 2 * 86400000).toISOString();
    Store.db.events = [
      {
        id: "e-review",
        title: "Research essay",
        type: "assignment",
        status: "todo",
        courseId: null,
        due,
        subtasks: [
          { id: "s-review", title: "Draft", minutes: 120, done: false },
        ],
      },
    ];

    const meta = Planner.generate({ weeks: 2 });

    expect(meta.totalMinutes).toBeGreaterThan(0);
    expect(
      Store.db.plan.some((block) => block.label.startsWith("Review:")),
    ).toBe(true);
  });
});

/**
 * Step 8 of docs/audit-2026-09-25.md: a "Review:" block names an
 * assessment, but what it re-tests is material — so it carries the document
 * it covers and is ordered, among the review blocks, by how much of that
 * material is being missed. Due-date proximity is only the tiebreak, which
 * is the ordering a planner for retrieval needs: forget what you cannot
 * yet produce, not what merely comes due first.
 */
describe("review blocks are ordered by what is being missed", () => {
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

  const reviewOrder = () =>
    Planner.units("all", [])
      .filter((u) => u.review)
      .map((u) => u.eventId);

  beforeEach(() => {
    Store.db.settings.studyWeekday = 3;
    Store.db.settings.studyWeekend = 3;
    Store.db.documents = [
      { id: "doc-missed", courseId: "c1", name: "Missed notes", text: "x" },
      { id: "doc-solid", courseId: "c2", name: "Solid notes", text: "x" },
    ];
    Store.db.events = [
      {
        id: "e-missed",
        title: "Essay draft",
        type: "assignment",
        status: "todo",
        courseId: "c1",
        due: inDays(2),
        sourceDocId: "doc-missed",
        subtasks: [{ id: "s1", title: "Draft", minutes: 120, done: false }],
      },
      {
        id: "e-solid",
        title: "Lab report",
        type: "assignment",
        status: "todo",
        courseId: "c2",
        due: inDays(1),
        sourceDocId: "doc-solid",
        subtasks: [{ id: "s2", title: "Write", minutes: 120, done: false }],
      },
    ];
  });

  it("keys the block to the document the event covers", () => {
    const missed = Planner.units("all", []).find(
      (u) => u.review && u.eventId === "e-missed",
    );

    expect(missed).toBeTruthy();
    expect(missed.docId).toBe("doc-missed");
    expect(Planner.docIdFor({ sourceDocId: "doc-solid" })).toBe("doc-solid");
    expect(Planner.docIdFor({ sourceDocId: "gone" })).toBeNull();
    expect(Planner.docIdFor(null)).toBeNull();
  });

  it("puts the review of missed material first, ahead of the sooner deadline", () => {
    /* The lab report is due a day sooner, so it wins on due-date
       proximity alone; the essay's material is what is being forgotten. */
    Coach.logRecall(false, "doc-missed");
    Coach.logRecall(false, "doc-missed");

    expect(reviewOrder()).toEqual(["e-missed", "e-solid"]);
  });

  it("falls back to due-date proximity when nothing has been drilled", () => {
    expect(reviewOrder()).toEqual(["e-solid", "e-missed"]);
  });

  it("carries the document onto the block the scheduler actually stores", () => {
    const preview = Planner.generateInteractive({ weeks: 2 });
    const reviews = preview.planItems.filter((b) =>
      String(b.label).startsWith("Review:"),
    );

    expect(reviews.map((b) => b.docId).sort()).toEqual([
      "doc-missed",
      "doc-solid",
    ]);
  });
});

describe("Planner.toggle", () => {
  it("updates a linked subtask only after all split blocks are complete", () => {
    Store.db.events = [
      {
        id: "e-toggle",
        title: "Project",
        status: "todo",
        subtasks: [
          { id: "s-toggle", title: "Research", minutes: 60, done: false },
        ],
      },
    ];
    Store.db.plan = [
      {
        id: "p1",
        eventId: "e-toggle",
        subtaskId: "s-toggle",
        minutes: 30,
        done: false,
      },
      {
        id: "p2",
        eventId: "e-toggle",
        subtaskId: "s-toggle",
        minutes: 30,
        done: false,
      },
    ];

    Planner.toggle("p1");
    expect(Store.db.events[0].subtasks[0].done).toBe(false);
    expect(Store.db.events[0].status).toBe("doing");

    Planner.toggle("p2");
    expect(Store.db.events[0].subtasks[0].done).toBe(true);
    expect(Store.db.events[0].status).toBe("done");
    expect(
      Store.db.activity.reduce((total, row) => total + row.minutes, 0),
    ).toBe(60);
  });
});

describe("Planner.unit structure", () => {
  it("events without subtasks produce single units", () => {
    Store.db.events = [
      {
        id: "e1",
        title: "Essay",
        type: "assignment",
        status: "open",
        courseId: null,
        due: new Date(Date.now() + 7 * 86400000).toISOString(),
        weight: 50,
        subtasks: [],
      },
    ];
    Store.db.lessons = [];
    Store.db.readings = [];
    const units = Planner.units();
    expect(units.length).toBe(1);
    expect(units[0].eventId).toBe("e1");
    expect(units[0].subtaskId).toBeNull();
    expect(units[0].minutes).toBeGreaterThan(0);
    expect(units[0]).toHaveProperty("score");
  });

  it("events with subtasks produce one unit per subtask", () => {
    Store.db.events = [
      {
        id: "e2",
        title: "Project",
        type: "project",
        status: "open",
        courseId: null,
        due: new Date(Date.now() + 14 * 86400000).toISOString(),
        weight: 80,
        subtasks: [
          { id: "s1", title: "Research", done: false, minutes: 60 },
          { id: "s2", title: "Write", done: false, minutes: 90 },
        ],
      },
    ];
    Store.db.lessons = [];
    Store.db.readings = [];
    const units = Planner.units();
    expect(units.length).toBe(2);
    expect(units[0].subtaskId).toBe("s1");
    expect(units[1].subtaskId).toBe("s2");
  });

  it("done tasks produce no units", () => {
    Store.db.events = [
      {
        id: "e3",
        title: "Done task",
        type: "quiz",
        status: "done",
        courseId: null,
        due: null,
        weight: 10,
        subtasks: [],
      },
    ];
    Store.db.lessons = [];
    Store.db.readings = [];
    const units = Planner.units();
    expect(units).toHaveLength(0);
  });

  it("deduplicates repeated imported requirements", () => {
    Store.db.events = [
      {
        id: "e-duplicate-1",
        title: "Final Examination",
        type: "exam",
        status: "todo",
        courseId: "c1",
        due: null,
        subtasks: [{ id: "s1", title: "Review", minutes: 60, done: false }],
      },
      {
        id: "e-duplicate-2",
        title: "Final Examination",
        type: "exam",
        status: "todo",
        courseId: "c1",
        due: null,
        subtasks: [{ id: "s2", title: "Review", minutes: 60, done: false }],
      },
    ];
    expect(Planner.units("c1")).toHaveLength(1);
  });
});

describe("Planner scheduler contract", () => {
  /* Preview, commit and generate must all run the same scheduler, so the
     blocks a student reviews are exactly the blocks that get stored. */
  function seedWork() {
    Store.db.settings.studyWeekday = 3;
    Store.db.settings.studyWeekend = 3;
    Store.db.events = [
      {
        id: "e-contract",
        title: "Research essay",
        type: "assignment",
        status: "todo",
        courseId: null,
        due: new Date(Date.now() + 3 * 86400000).toISOString(),
        subtasks: [
          { id: "s-contract-1", title: "Outline", minutes: 60, done: false },
          { id: "s-contract-2", title: "Draft", minutes: 90, done: false },
        ],
      },
    ];
  }

  it("generateInteractive previews without touching the stored plan", () => {
    seedWork();
    Store.db.plan = [];
    Store.db.planMeta = null;

    const preview = Planner.generateInteractive({ weeks: 2 });

    expect(preview.planItems.length).toBeGreaterThan(0);
    expect(preview.days.length).toBe(14);
    expect(preview.meta.weeks).toBe(2);
    expect(Store.db.plan).toEqual([]);
    expect(Store.db.planMeta).toBeNull();
  });

  it("commit stores exactly the previewed blocks", () => {
    seedWork();
    const preview = Planner.generateInteractive({ weeks: 2 });

    const meta = Planner.commit(preview);

    expect(Store.db.plan).toHaveLength(preview.planItems.length);
    expect(Store.db.plan.map((b) => b.label)).toEqual(
      preview.planItems.map((b) => b.label),
    );
    expect(Store.db.plan.map((b) => b.minutes)).toEqual(
      preview.planItems.map((b) => b.minutes),
    );
    expect(meta).toBe(Store.db.planMeta);
    expect(meta.totalMinutes).toBe(preview.meta.totalMinutes);
  });

  it("generate produces the same schedule as the preview it wraps", () => {
    seedWork();
    const preview = Planner.generateInteractive({ weeks: 2 });
    const previewShape = {
      blocks: preview.planItems.length,
      minutes: preview.meta.totalMinutes,
      labels: preview.planItems.map((b) => b.label),
    };

    const meta = Planner.generate({ weeks: 2 });

    expect(meta).toBe(Store.db.planMeta);
    expect(Store.db.plan).toHaveLength(previewShape.blocks);
    expect(meta.totalMinutes).toBe(previewShape.minutes);
    expect(Store.db.plan.map((b) => b.label)).toEqual(previewShape.labels);
    expect(Store.db.planMeta.unscheduled).toEqual(preview.meta.unscheduled);
  });

  function seedTwo() {
    Store.db.settings.studyWeekday = 3;
    Store.db.settings.studyWeekend = 3;
    Store.db.events = [
      {
        id: "e-keep",
        title: "Keep this",
        type: "assignment",
        status: "todo",
        courseId: null,
        due: new Date(Date.now() + 3 * 86400000).toISOString(),
        subtasks: [{ id: "s-keep", title: "Draft", minutes: 60, done: false }],
      },
      {
        id: "e-drop",
        title: "Drop me",
        type: "assignment",
        status: "todo",
        courseId: null,
        due: new Date(Date.now() + 3 * 86400000).toISOString(),
        subtasks: [
          { id: "s-drop", title: "Outline", minutes: 60, done: false },
        ],
      },
    ];
  }

  it("leaves an excluded event out of the work units", () => {
    seedTwo();
    const all = Planner.units("all").map((u) => u.eventId);
    expect(all).toContain("e-keep");
    expect(all).toContain("e-drop");

    expect(Planner.units("all", ["e-drop"]).map((u) => u.eventId)).toEqual([
      "e-keep",
    ]);
  });

  it("re-schedules without the excluded task, records it, and writes nothing", () => {
    seedTwo();
    const preview = Planner.generateInteractive({
      weeks: 2,
      exclude: ["e-drop"],
    });
    expect(preview.planItems.length).toBeGreaterThan(0);
    expect(preview.planItems.every((b) => b.eventId === "e-keep")).toBe(true);
    expect(preview.meta.excluded).toEqual(["Drop me"]);
    expect(Store.db.plan).toEqual([]);
  });

  it("schedules every task when nothing is excluded", () => {
    seedTwo();
    const preview = Planner.generateInteractive({ weeks: 2 });
    expect(preview.meta.excluded).toEqual([]);
    expect(preview.planItems.some((b) => b.eventId === "e-drop")).toBe(true);
  });

  it("ignores excluded ids that no longer exist", () => {
    seedTwo();
    const preview = Planner.generateInteractive({
      weeks: 2,
      exclude: ["ghost", ""],
    });
    expect(preview.meta.excluded).toEqual([]);
    expect(preview.planItems.length).toBeGreaterThan(0);
  });

  it("commit tolerates an empty or missing result", () => {
    Store.db.plan = [{ id: "stale" }];
    Store.db.planMeta = { generatedAt: "stale" };

    expect(Planner.commit(null)).toBeNull();
    expect(Store.db.plan).toEqual([]);
    expect(Store.db.planMeta).toBeNull();
  });
});
