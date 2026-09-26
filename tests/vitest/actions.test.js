// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../src/core/router.js", () => ({
  Router: {
    render: vi.fn(),
    scheduleRender: vi.fn(),
    navigate: vi.fn(),
    renderRecentChats: vi.fn(),
  },
}));

import { Store } from "../../src/core/store.js";
import {
  act,
  KNOWN_ACTIONS,
  buildDispatch,
} from "../../src/core/actions/index.js";
import { planToCSV } from "../../src/core/actions/exports.js";
import { toggleSubtask } from "../../src/core/actions/tasks.js";
import {
  toggleStarCourse,
  toggleRemoveFromView,
} from "../../src/core/actions/courses.js";
import { courses } from "../../src/views/courses.js";
import {
  wrapTitleLines,
  generateCourseCover,
} from "../../src/config/templates.js";
import {
  summarizeImportPlan,
  validateBackup,
  applyBackup,
  commitDraft,
} from "../../src/core/actions/import.js";
import { saveSettings, testAI } from "../../src/core/actions/settings.js";
import {
  generatePlan,
  commitPlanPreview,
  cancelPlanPreview,
  acceptPlanProposal,
  editPlanProposal,
  rejectPlanProposal,
  toggleProposalExclusion,
} from "../../src/core/actions/planner.js";
import { Planner } from "../../src/domain/planner.js";
import { Router } from "../../src/core/router.js";
import { UI, UIState } from "../../src/core/state.js";
import { stripKey } from "../../src/utils/secure.js";
import { RAG } from "../../src/domain/rag.js";
import { CFG } from "../../src/config/constants.js";

beforeEach(() => {
  Store.resetAll();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("KNOWN_ACTIONS", () => {
  it("is a Set", () => {
    expect(KNOWN_ACTIONS).toBeInstanceOf(Set);
  });

  it("contains core actions", () => {
    expect(KNOWN_ACTIONS.has("nav")).toBe(true);
    expect(KNOWN_ACTIONS.has("settings-save")).toBe(true);
    expect(KNOWN_ACTIONS.has("data-export")).toBe(true);
    expect(KNOWN_ACTIONS.has("data-import")).toBe(true);
    expect(KNOWN_ACTIONS.has("data-reset")).toBe(true);
  });

  it("contains task actions", () => {
    expect(KNOWN_ACTIONS.has("task-toggle")).toBe(true);
    expect(KNOWN_ACTIONS.has("task-new")).toBe(true);
    expect(KNOWN_ACTIONS.has("sub-toggle")).toBe(true);
  });

  it("contains document actions", () => {
    expect(KNOWN_ACTIONS.has("del-doc")).toBe(true);
    expect(KNOWN_ACTIONS.has("doc-reanalyse")).toBe(true);
    expect(KNOWN_ACTIONS.has("doc-ask")).toBe(true);
  });

  it("contains course actions", () => {
    expect(KNOWN_ACTIONS.has("new-course")).toBe(true);
    expect(KNOWN_ACTIONS.has("edit-course")).toBe(true);
    expect(KNOWN_ACTIONS.has("del-course")).toBe(true);
  });

  it("exposes one canonical export action", () => {
    // `export-csv` was a second name for the same handler (`exportRoadmap`).
    // Two names for one action is what let a rename orphan the import that
    // blanked the app, so the alias is gone: both the planner and the roadmap
    // now emit `export-roadmap`.
    expect(KNOWN_ACTIONS.has("export-roadmap")).toBe(true);
    expect(KNOWN_ACTIONS.has("export-csv")).toBe(false);
  });

  /**
   * Regression guard for the 2026-09-24 breakage.
   *
   * KNOWN_ACTIONS is derived from the dispatch table's *keys*, so it asserts a
   * name is registered without checking that the handler behind it exists. When
   * `exportCSV` was renamed to `exportRoadmap`, `"export-csv": exportCSV`
   * became an undefined value: the guard stayed quiet, the click did nothing,
   * and only the (strict) Rollup build failed. Assert the values are callable.
   */
  it("every dispatch handler is a callable function", () => {
    const table = buildDispatch(null, null, null);
    const broken = Object.entries(table)
      .filter(([, handler]) => typeof handler !== "function")
      .map(([name]) => name);
    expect(broken).toEqual([]);
  });

  it("static handlers are a frozen shared map", () => {
    const a = buildDispatch(null, null, null);
    const b = buildDispatch(null, null, null);
    /* static entries are the same function references across dispatches */
    expect(a["settings-save"]).toBe(b["settings-save"]);
    expect(a["data-export"]).toBe(b["data-export"]);
    /* context entries are freshly bound closures */
    expect(a["edit-course"]).not.toBe(b["edit-course"]);
    expect(Object.isFrozen(a)).toBe(false);
  });

  it("KNOWN_ACTIONS covers both static and context tables", () => {
    const table = buildDispatch(null, null, null);
    for (const name of Object.keys(table)) {
      expect(KNOWN_ACTIONS.has(name), name).toBe(true);
    }
    expect(KNOWN_ACTIONS.has("nav")).toBe(true);
    expect(KNOWN_ACTIONS.has("settings-save")).toBe(true);
  });



  it("contains chat actions", () => {
    expect(KNOWN_ACTIONS.has("chat-send")).toBe(true);
    expect(KNOWN_ACTIONS.has("chat-stop")).toBe(true);
    /* chat-clear / chat-plan / chat-source were handlers nothing emitted:
       they are gone rather than registered (2026-09-25 audit, P1-7). */
    expect(KNOWN_ACTIONS.has("chat-clear")).toBe(false);
    expect(KNOWN_ACTIONS.has("chat-plan")).toBe(false);
    expect(KNOWN_ACTIONS.has("chat-source")).toBe(false);
  });
});

/* Actions that have a handler but that no markup emits. Kept explicit so a
   NEW orphan is caught, while cleaning these up can only shrink the list. */
const REGISTERED_WITHOUT_MARKUP = [
  "export-roadmap",
  "load-moodle-sample",
  "scope-course",
  "sub-toggle",
  "task-ask",
  "view",
];

/* import.meta.url is a fake http URL under happy-dom, so resolve from the
   project root that Vite/Vitest already runs with. */
const PROJECT_ROOT = process.cwd();
const SRC_DIR = join(PROJECT_ROOT, "src");
const INDEX_HTML = join(PROJECT_ROOT, "index.html");

function walkJs(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walkJs(join(dir, entry.name))
        : [join(dir, entry.name)],
    )
    .filter((file) => file.endsWith(".js"));
}

/**
 * Every action name the markup can emit: literal `data-act="name"` values,
 * plus the quoted names inside concatenated `data-act="' + …` expressions.
 */
function emittedActions() {
  const literal = new Set();
  const dynamic = new Set();
  const files = [...walkJs(SRC_DIR), INDEX_HTML];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/data-act="([a-z][a-z-]*)"/g)) {
      literal.add(match[1]);
    }
    for (const match of text.matchAll(
      /data-act="'\s*\+([\s\S]{0,800}?)'\s*\+/g,
    )) {
      for (const token of match[1].matchAll(/"([a-z][a-z-]*)"/g)) {
        dynamic.add(token[1]);
      }
    }
  }
  return { literal, dynamic, files };
}

const EMITTED = emittedActions();

describe("action coverage", () => {
  it("matches KNOWN_ACTIONS to the dispatch table, not a hand-written list", () => {
    /* chat-resend is emitted by the recent-chat markup. It was missing from the
       old manual set, so every click logged a false "unknown action". */
    expect(KNOWN_ACTIONS.has("chat-resend")).toBe(true);
    expect(KNOWN_ACTIONS.has("chat-send")).toBe(true);
    expect(KNOWN_ACTIONS.has("nav")).toBe(true);
  });

  it("scans real markup", () => {
    expect(EMITTED.files.length).toBeGreaterThan(50);
    expect(EMITTED.literal.size).toBeGreaterThan(30);
    expect(EMITTED.literal.has("chat-send")).toBe(true);
    expect(EMITTED.literal.has("chat-resend")).toBe(true);
  });

  it("knows every action the markup emits", () => {
    const unknown = [...EMITTED.literal, ...EMITTED.dynamic]
      .filter((action) => !KNOWN_ACTIONS.has(action))
      .sort();
    expect(unknown).toEqual([]);
  });

  it("has no new handler that no markup emits", () => {
    const emitted = new Set([...EMITTED.literal, ...EMITTED.dynamic]);
    const orphans = [...KNOWN_ACTIONS]
      .filter((action) => !emitted.has(action))
      .filter((action) => !REGISTERED_WITHOUT_MARKUP.includes(action))
      .sort();
    expect(orphans).toEqual([]);
  });
});

describe("action dispatch", () => {
  it("returns the handler's promise so async failures can be caught", async () => {
    const el = { dataset: { act: "chat-send" } };

    const pending = act("chat-send", el);

    expect(typeof pending.then).toBe("function");
    await pending;
  });

  it("warns about an unknown action without throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => act("not-a-real-action", { dataset: {} })).not.toThrow();
      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0][0])).toContain("not-a-real-action");
    } finally {
      warn.mockRestore();
    }
  });

  it("does not warn for actions that have a handler", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      act("nav", { dataset: { act: "nav", arg: "dashboard" } });
      act("reindex", { dataset: { act: "reindex" } });
      await act("chat-send", { dataset: { act: "chat-send" } });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("backup validation", () => {
  it("rejects a file with no schema version", () => {
    expect(validateBackup({ courses: [] })).toMatch(/schema version/);
  });

  it("rejects non-object roots", () => {
    expect(validateBackup(null)).toMatch(/does not look like/);
    expect(validateBackup("nope")).toMatch(/does not look like/);
    expect(validateBackup([])).toMatch(/does not look like/);
  });

  it("rejects a collection that is not an array", () => {
    expect(validateBackup({ version: 4, courses: "not an array" })).toBe(
      '"courses" must be an array.',
    );
  });

  it("rejects collection entries that are not objects", () => {
    expect(validateBackup({ version: 4, events: ["oops"] })).toMatch(
      /not an object/,
    );
  });

  it("rejects an array where settings should be an object", () => {
    expect(validateBackup({ version: 4, settings: [] })).toBe(
      '"settings" must be an object.',
    );
  });

  it("accepts an export-shaped object whose settings is a plain object", () => {
    const backup = JSON.parse(
      JSON.stringify(
        stripKey({
          version: CFG.schemaVersion,
          settings: { userName: "Seo" },
          courses: [],
        }),
      ),
    );
    expect(validateBackup(backup)).toBeNull();
  });

  it("refuses a backup larger than browser storage can hold", () => {
    const original = CFG.storage.maxBytes;
    CFG.storage.maxBytes = 20;
    try {
      expect(validateBackup({ version: 4, courses: [{ id: "c1" }] })).toMatch(
        /too large/,
      );
    } finally {
      CFG.storage.maxBytes = original;
    }
  });

  it("rejects an entity id that is not a stable identifier", () => {
    expect(
      validateBackup({
        version: 4,
        courses: [{ id: '"><img src=x onerror=alert(1)>' }],
      }),
    ).toMatch(/invalid id/);
    expect(
      validateBackup({ version: 4, events: [{ id: "ev_ok-1" }] }),
    ).toBeNull();
  });
});

describe("applyBackup", () => {
  it("restores its own export — settings is an object, not an array", () => {
    Store.db.settings.userName = "Seo";
    Store.db.courses = [{ id: "c1", code: "EDU101", title: "Foundations" }];
    Store.db.events = [
      { id: "e1", courseId: "c1", title: "Essay", subtasks: [] },
    ];
    Store.db.lessons = [
      { id: "l1", courseId: "c1", week: 1, topic: "Intro to pedagogy" },
    ];
    const backup = JSON.parse(JSON.stringify(stripKey(Store.db)));

    Store.resetAll();
    expect(Store.db.courses).toHaveLength(0);

    applyBackup(backup);

    expect(Store.db.courses).toHaveLength(1);
    expect(Store.db.events).toHaveLength(1);
    expect(Store.db.lessons).toHaveLength(1);
    expect(Store.db.settings.userName).toBe("Seo");
  });

  it("rebuilds the retrieval index from restored documents", () => {
    const sentence =
      "Retrieval practice beats rereading for long-term recall. ";
    Store.db.documents = [
      {
        id: "d1",
        courseId: "c1",
        name: "notes.txt",
        kind: "other",
        text: sentence.repeat(60),
      },
    ];
    const backup = JSON.parse(JSON.stringify(stripKey(Store.db)));

    Store.resetAll();
    applyBackup(backup);

    expect(Store.db.documents).toHaveLength(1);
    expect(Store.db.chunks.length).toBeGreaterThan(0);
    expect(typeof Store.db.chunks[0].start).toBe("number");
    expect(RAG.search("retrieval practice", { k: 3 }).length).toBeGreaterThan(
      0,
    );
  });

  it("never adopts an API key from the backup file", () => {
    Store.db.settings.apiKey = "live-key-1234567890";

    applyBackup({
      version: CFG.schemaVersion,
      settings: { apiKey: "inserted-by-a-third-party", userName: "Mallory" },
    });

    expect(Store.db.settings.apiKey).toBe("live-key-1234567890");
    expect(Store.db.settings.userName).toBe("Mallory");
  });

  it("rejects a backup from a newer schema version", () => {
    expect(() =>
      applyBackup({ version: CFG.schemaVersion + 1, courses: [] }),
    ).toThrow(/newer version/);
    expect(Store.db.version).toBe(CFG.schemaVersion);
  });
});

describe("settings actions", () => {
  function renderSettingsForm() {
    document.body.innerHTML =
      '<input id="setKey" value="">' +
      '<select id="setProvider"><option value="gemini" selected>Gemini</option></select>' +
      '<input type="checkbox" id="setAiEnabled" checked>' +
      '<input type="checkbox" id="setHybridRAG">' +
      '<input id="setWeekday" value="2">' +
      '<input id="setWeekend" value="4">' +
      '<input id="setWeeks" value="6">' +
      '<select id="setDefaultView"><option value="dashboard" selected>Dashboard</option></select>' +
      '<input id="setTermStart" value="2026-01-05">' +
      '<input id="setTermEnd" value="2026-05-20">' +
      '<span id="aiTestMsg"></span>';
  }

  it("saveSettings writes the form values", () => {
    renderSettingsForm();
    document.querySelector("#setWeekday").value = "3.5";
    document.querySelector("#setWeeks").value = "8";

    saveSettings();

    expect(Store.db.settings.studyWeekday).toBe(3.5);
    expect(Store.db.settings.plannerWeeks).toBe(8);
  });

  it("saveSettings survives a screen without the settings inputs", () => {
    document.body.innerHTML = "";
    expect(() => saveSettings()).not.toThrow();
  });

  it("testAI returns a promise and reports failure instead of throwing", async () => {
    renderSettingsForm();

    const pending = testAI();
    expect(typeof pending.then).toBe("function");

    const result = await pending;
    expect(result.ok).toBe(false);
    expect(document.querySelector("#aiTestMsg").textContent).toBe(
      "No API key configured.",
    );
  });
});

describe("Store export functions", () => {
  it("ICS date formatting produces valid structure", () => {
    Store.db.events = [
      {
        id: "e1",
        title: "Midterm",
        due: "2026-10-15T09:00:00.000Z",
        status: "open",
      },
    ];
    const events = Store.db.events.filter((e) => e.due && e.status !== "done");
    expect(events.length).toBe(1);
    const dt = events[0].due.replace(/[-:]/g, "").slice(0, 15) + "00";
    expect(typeof dt).toBe("string");
    expect(dt.length).toBeGreaterThan(10);
  });

  it("planToCSV emits a header and escapes quotes in labels", () => {
    const csv = planToCSV(
      [
        {
          date: "2026-09-24",
          label: 'Say "hello"',
          courseId: "c1",
          minutes: 45,
          done: false,
        },
      ],
      () => "CS 101",
    );
    expect(csv).toBe(
      'Date,Task,Course,Minutes,Done\n2026-09-24,"Say ""hello""",CS 101,45,false\n',
    );
  });

  it("planToCSV tolerates an empty or missing plan", () => {
    expect(planToCSV([], () => "")).toBe("Date,Task,Course,Minutes,Done\n");
    expect(planToCSV(null, () => "")).toBe(
      "Date,Task,Course,Minutes,Done\n",
    );
  });
});

describe("plan preview round-trip", () => {
  function seedWork() {
    Store.db.settings.studyWeekday = 3;
    Store.db.settings.studyWeekend = 3;
    Store.db.events = [
      {
        id: "e-preview",
        title: "Research essay",
        type: "assignment",
        status: "todo",
        courseId: null,
        due: new Date(Date.now() + 3 * 86400000).toISOString(),
        subtasks: [
          { id: "s-preview-1", title: "Outline", minutes: 60, done: false },
          { id: "s-preview-2", title: "Draft", minutes: 90, done: false },
        ],
      },
    ];
  }

  it("generate stores a preview the view and Accept button can actually read", () => {
    seedWork();
    generatePlan();

    /* The exact read `views/planner.js` and `commitPlanPreview` perform. */
    const preview = UIState.plannerPreview;
    expect(preview).toBeTruthy();
    expect(preview.planItems.length).toBeGreaterThan(0);
    /* A preview must not write the stored plan. */
    expect(Store.db.plan).toEqual([]);
  });

  it("commit adopts the previewed blocks, then clears the preview", () => {
    seedWork();
    generatePlan();
    const preview = UIState.plannerPreview;
    const labels = preview.planItems.map((b) => b.label);
    const minutes = preview.meta.totalMinutes;

    commitPlanPreview();

    expect(Store.db.plan.map((b) => b.label)).toEqual(labels);
    expect(Store.db.planMeta.totalMinutes).toBe(minutes);
    expect(UIState.plannerPreview).toBeNull();
  });

  it("cancel clears the preview without writing a plan", () => {
    seedWork();
    generatePlan();

    cancelPlanPreview();

    expect(UIState.plannerPreview).toBeNull();
    expect(Store.db.plan).toEqual([]);
  });

  it("commit with no preview is a no-op rather than a crash", () => {
    UIState.set("plannerPreview", null);
    expect(() => commitPlanPreview()).not.toThrow();
    expect(Store.db.plan).toEqual([]);
  });
});

describe("AI plan proposal decisions", () => {
  function seedWork() {
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

  /** Mirror what studyPlanProposal hands to the view. */
  function offer() {
    const draft = Planner.generateInteractive({ weeks: 2 });
    draft.meta.provenance = {
      mode: "ai",
      model: "test-model",
      tools: ["get_snapshot"],
      calls: 2,
    };
    UIState.set("planProposal", {
      draft: draft,
      exclude: [],
      ts: Date.now(),
    });
    return draft;
  }

  it("accept writes the proposed blocks through the one persist path", () => {
    seedWork();
    const draft = offer();
    expect(Store.db.plan).toEqual([]);

    acceptPlanProposal();

    expect(Store.db.plan.map((b) => b.label)).toEqual(
      draft.planItems.map((b) => b.label),
    );
    /* Provenance rides along into the stored meta. */
    expect(Store.db.planMeta.provenance.model).toBe("test-model");
    expect(UIState.planProposal).toBeNull();
    expect(UIState.plannerPreview).toBeNull();
  });

  it("reject leaves the student's current plan untouched", () => {
    seedWork();
    Store.db.plan = [{ id: "existing", label: "Mine" }];
    Store.db.planMeta = { weeks: 1, excluded: [] };
    offer();

    rejectPlanProposal();

    expect(Store.db.plan).toEqual([{ id: "existing", label: "Mine" }]);
    expect(Store.db.planMeta.weeks).toBe(1);
    expect(UIState.planProposal).toBeNull();
  });

  it("edit hands the draft to the planner preview instead of saving it", () => {
    seedWork();
    const draft = offer();

    editPlanProposal();

    expect(UIState.plannerPreview).toBe(draft);
    expect(Router.navigate).toHaveBeenCalledWith("planner");
    expect(Store.db.plan).toEqual([]);
  });

  it("keeps the offer live so cancelling the preview is not a dead end", () => {
    seedWork();
    offer();

    editPlanProposal();
    cancelPlanPreview();

    expect(UIState.plannerPreview).toBeNull();
    expect(UIState.planProposal).toBeTruthy();
    expect(UIState.planProposal.draft.planItems.length).toBeGreaterThan(0);
  });

  it("commitPlanPreview clears a live offer as well", () => {
    seedWork();
    offer();
    UIState.set("plannerPreview", UIState.planProposal.draft);

    commitPlanPreview();

    expect(Store.db.plan.length).toBeGreaterThan(0);
    expect(UIState.planProposal).toBeNull();
  });

  it("excluding a task re-plans without it and keeps the offer live", () => {
    seedWork();
    offer();

    toggleProposalExclusion("e-drop");

    const after = UIState.planProposal;
    expect(after.exclude).toEqual(["e-drop"]);
    expect(after.draft.planItems.every((b) => b.eventId === "e-keep")).toBe(
      true,
    );
    expect(after.draft.meta.excluded).toEqual(["Drop me"]);
    expect(Store.db.plan).toEqual([]);
  });

  it("excluding a task again puts it back", () => {
    seedWork();
    offer();

    toggleProposalExclusion("e-drop");
    toggleProposalExclusion("e-drop");

    expect(UIState.planProposal.exclude).toEqual([]);
    expect(
      UIState.planProposal.draft.planItems.some((b) => b.eventId === "e-drop"),
    ).toBe(true);
  });

  it("keeps an open planner preview in step with an edit", () => {
    seedWork();
    offer();
    UIState.set("plannerPreview", UIState.planProposal.draft);

    toggleProposalExclusion("e-drop");

    expect(UIState.plannerPreview).toBe(UIState.planProposal.draft);
    expect(
      UIState.plannerPreview.planItems.every((b) => b.eventId === "e-keep"),
    ).toBe(true);
  });

  it("reports an expired offer instead of throwing or half-acting", () => {
    seedWork();
    UIState.set("planProposal", null);

    expect(() => acceptPlanProposal()).not.toThrow();
    expect(() => rejectPlanProposal()).not.toThrow();
    expect(() => editPlanProposal()).not.toThrow();
    expect(() => toggleProposalExclusion("e-drop")).not.toThrow();
    expect(Store.db.plan).toEqual([]);
  });
});

describe("commitDraft validation", () => {
  it("toggles a subtask and recomputes the parent task status", () => {
    Store.db.events = [
      {
        id: "event-1",
        status: "todo",
        subtasks: [{ id: "sub-1", title: "Read", minutes: 30, done: false }],
      },
    ];

    toggleSubtask("event-1", "sub-1");

    expect(Store.db.events[0].subtasks[0].done).toBe(true);
    expect(Store.db.events[0].status).toBe("done");

    toggleSubtask("event-1", "sub-1");

    expect(Store.db.events[0].subtasks[0].done).toBe(false);
    expect(Store.db.events[0].status).toBe("todo");
  });

  it("filters out lessons without topic", () => {
    const lessons = [
      { include: true, topic: "Week 1" },
      { include: true, topic: "" },
      { include: true },
    ];
    const valid = lessons.filter((l) => l.include !== false && l.topic);
    expect(valid.length).toBe(1);
  });

  it("summarizes plan impact from the generated schedule", () => {
    const summary = summarizeImportPlan(
      { totalMinutes: 135, weeks: 2 },
      {
        events: 3,
        readings: 2,
        lessons: 1,
      },
      [
        { label: "Review: Essay draft", minutes: 30 },
        { label: "Essay draft", minutes: 45 },
      ],
    );

    expect(summary).toContain("2h 15m");
    expect(summary).toContain("2 blocks ready to review");
    /* Nothing is scheduled at this point, so it must not say it is. */
    expect(summary).not.toContain("scheduled block");
    expect(summary).toContain("3 deadlines");
    expect(summary).toContain("2 readings");
    expect(summary).toContain("1 review block");
    expect(summary).toContain("All imported work fits");
  });

  it("filters out events without title", () => {
    const events = [
      { include: true, title: "Midterm" },
      { include: true, title: "" },
      { include: true },
    ];
    const valid = events.filter((e) => e.include !== false && e.title);
    expect(valid.length).toBe(1);
  });

  it("importing offers the schedule instead of replacing the student's plan", () => {
    Store.db.settings.studyWeekday = 3;
    Store.db.settings.studyWeekend = 3;
    Store.db.courses.push({ id: "c1", code: "CS101", title: "Intro CS" });
    Store.db.plan = [{ id: "mine", label: "My own plan", minutes: 60 }];
    Store.db.planMeta = { weeks: 1, unscheduled: [], atRisk: [], excluded: [] };

    UI.draft = {
      courseId: "c1",
      newCourse: null,
      payloads: [
        {
          name: "Syllabus.pdf",
          kind: "syllabus",
          text: "Course syllabus text",
          result: {
            events: [
              {
                include: true,
                title: "Essay",
                type: "assignment",
                due: new Date(Date.now() + 4 * 86400000).toISOString(),
              },
            ],
            readings: [],
            lessons: [],
            tables: [],
            pnu: null,
            standard: null,
          },
        },
      ],
    };

    commitDraft();

    /* The student's plan survives until they confirm the preview. */
    expect(Store.db.plan.map((b) => b.id)).toEqual(["mine"]);
    expect(UIState.plannerPreview).toBeTruthy();
    expect(UIState.plannerPreview.planItems.length).toBeGreaterThan(0);
    /* Commit lands on My courses so the imported course is immediately visible. */
    expect(Router.navigate).toHaveBeenCalledWith("courses");

    /* Confirming is what writes it. */
    commitPlanPreview();
    expect(Store.db.plan.map((b) => b.id)).not.toEqual(["mine"]);
    expect(Store.db.plan.length).toBeGreaterThan(0);
  });

  it("creates a fallback course so an import is never orphaned", () => {
    Store.db.courses = [];
    UI.draft = {
      courseId: null,
      newCourse: { code: "", title: "" },
      payloads: [
        {
          name: "CS301-syllabus.txt",
          kind: "syllabus",
          text: "Course syllabus text",
          result: {
            events: [],
            readings: [],
            lessons: [],
            tables: [],
            pnu: null,
            standard: null,
          },
        },
      ],
    };

    commitDraft();

    expect(Store.db.courses.length).toBe(1);
    expect(Store.db.courses[0].title).toBe("CS301-syllabus");
    /* Data written under the fallback id, not a null one. */
    expect(Store.db.documents.length).toBe(1);
    expect(Store.db.documents[0].courseId).toBe(Store.db.courses[0].id);
    expect(Router.navigate).toHaveBeenCalledWith("courses");
  });

  it("reattaches a draft whose target course was deleted mid-review", () => {
    Store.db.courses = [];
    UI.draft = {
      courseId: "crs_ghost",
      newCourse: null,
      payloads: [
        {
          name: "notes.txt",
          kind: "syllabus",
          text: "text",
          result: {
            events: [],
            readings: [],
            lessons: [],
            tables: [],
            pnu: null,
            standard: null,
          },
        },
      ],
    };

    commitDraft();

    expect(Store.db.courses.length).toBe(1);
    expect(Store.db.courses[0].id).not.toBe("crs_ghost");
    expect(Store.db.documents[0].courseId).toBe(Store.db.courses[0].id);
  });

  it("overwrites an existing course's code and title when the syllabus detects them", () => {
    Store.db.courses = [
      { id: "c1", code: "OLD-101", title: "Old Title", color: "#000" },
    ];
    UI.draft = {
      courseId: "c1",
      newCourse: null,
      payloads: [
        {
          name: "corrected.txt",
          kind: "syllabus",
          text: "text",
          result: {
            events: [],
            readings: [],
            lessons: [],
            tables: [],
            pnu: { course: { code: "CS 301", title: "Data Structures" } },
            standard: null,
          },
        },
      ],
    };

    commitDraft();

    expect(Store.db.courses.length).toBe(1);
    expect(Store.db.courses[0].code).toBe("CS 301");
    expect(Store.db.courses[0].title).toBe("Data Structures");
  });

  it("keeps a manually entered code when the syllabus detects nothing", () => {
    Store.db.courses = [
      { id: "c1", code: "MY-CODE", title: "My Title", color: "#000" },
    ];
    UI.draft = {
      courseId: "c1",
      newCourse: null,
      payloads: [
        {
          name: "notes.txt",
          kind: "notes",
          text: "text",
          result: {
            events: [],
            readings: [],
            lessons: [],
            tables: [],
            pnu: null,
            standard: null,
          },
        },
      ],
    };

    commitDraft();

    expect(Store.db.courses[0].code).toBe("MY-CODE");
    expect(Store.db.courses[0].title).toBe("My Title");
  });

  describe("course kebab actions", () => {
    it("toggles course starred state via action and updates markup", () => {
      Store.db.courses = [
        { id: "crs_kebab_1", code: "CS 101", title: "Intro to CS", starred: false },
      ];
      act("toggle-star-course", { dataset: { id: "crs_kebab_1" } });
      expect(Store.db.courses[0].starred).toBe(true);
      expect(Router.scheduleRender).toHaveBeenCalled();

      // Check courses markup displays Unstar when course is starred
      const starredHtml = courses();
      expect(starredHtml).toContain("Unstar this course");

      // Toggle back
      act("toggle-star-course", { dataset: { id: "crs_kebab_1" } });
      expect(Store.db.courses[0].starred).toBe(false);

      const unstarredHtml = courses();
      expect(unstarredHtml).toContain("Star this course");
    });

    it("toggles course remove/restore from view state and updates markup", () => {
      Store.db.courses = [
        {
          id: "crs_kebab_2",
          code: "MATH 201",
          title: "Calculus",
          removedFromView: false,
        },
      ];

      // Initially active
      let html = courses();
      expect(html).toContain("Remove from view");
      expect(html).toContain('data-removed="false"');
      expect(html).toContain('value="removed-from-view"');

      // Remove from view
      act("toggle-remove-view-course", { dataset: { id: "crs_kebab_2" } });
      expect(Store.db.courses[0].removedFromView).toBe(true);

      // Now markup reflects removed state and shows Restore to view
      html = courses();
      expect(html).toContain("Restore to view");
      expect(html).toContain('data-removed="true"');

      // Restore to view
      act("toggle-remove-view-course", { dataset: { id: "crs_kebab_2" } });
      expect(Store.db.courses[0].removedFromView).toBe(false);

      html = courses();
      expect(html).toContain("Remove from view");
      expect(html).toContain('data-removed="false"');
    });
  });

  describe("course cover generator and title layout", () => {
    it("wraps long titles into balanced lines so they fit safely without clipping", () => {
      const wrapped = wrapTitleLines("Managing the Learning Environment", 20);
      expect(wrapped).toEqual(["Managing the", "Learning Environment"]);
      expect(wrapped.length).toBe(2);

      const singleWord = wrapTitleLines("Thermodynamics", 20);
      expect(singleWord).toEqual(["Thermodynamics"]);

      const emptyWrap = wrapTitleLines("", 20);
      expect(emptyWrap).toEqual(["COURSE"]);
    });

    it("generates 2:1 SVG banners with safe margins and wrapped title lines", () => {
      const uri = generateCourseCover({
        title: "Managing the Learning Environment",
        code: "PROFED05",
        style: "modern",
      });

      expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
      const decodedSvg = decodeURIComponent(uri.replace("data:image/svg+xml;charset=utf-8,", ""));
      expect(decodedSvg).toContain('viewBox="0 0 700 350"');
      expect(decodedSvg).toContain("PROFED05");
      expect(decodedSvg).toContain("MANAGING THE");
      expect(decodedSvg).toContain("LEARNING ENVIRONMENT");
      expect(decodedSvg).toContain("EDUCATION &amp; PEDAGOGY");
    });
  });
});


