/**
 * Tests for src/core/scope.js — filtering, UIState
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/core/store.js";
import {
  UIState,
  courses,
  courseIds,
  inScope,
  events,
  lessons,
  readings,
  docs,
  eventProgress,
} from "../../src/core/scope.js";

beforeEach(() => {
  Store.load();
  UIState.courseId = "all";
  UIState.view = "dashboard";
});

describe("UIState", () => {
  it("has sensible defaults", () => {
    expect(UIState.view).toBe("dashboard");
    expect(UIState.courseId).toBe("all");
    expect(UIState.chatPending).toBe(false);
    expect(UIState.draft).toBeNull();
  });

  it("is mutable", () => {
    UIState.view = "tasks";
    expect(UIState.view).toBe("tasks");
    UIState.view = "dashboard";
  });
});

describe("courses()", () => {
  it("returns all courses when courseId is 'all'", () => {
    Store.db.courses = [
      { id: "c1", code: "CS101" },
      { id: "c2", code: "MA201" },
    ];
    UIState.courseId = "all";
    expect(courses()).toHaveLength(2);
  });

  it("filters by courseId when set", () => {
    Store.db.courses = [
      { id: "c1", code: "CS101" },
      { id: "c2", code: "MA201" },
    ];
    UIState.courseId = "c1";
    const result = courses();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
  });

  it("returns a copy, not the original array", () => {
    Store.db.courses = [{ id: "c1" }];
    UIState.courseId = "all";
    const result = courses();
    result.push({ id: "c2" });
    expect(Store.db.courses).toHaveLength(1);
  });
});

describe("courseIds()", () => {
  it("returns only the ids of in-scope courses", () => {
    Store.db.courses = [
      { id: "c1", code: "CS101" },
      { id: "c2", code: "MA201" },
    ];
    UIState.courseId = "c1";
    expect(courseIds()).toEqual(["c1"]);
  });
});

describe("inScope()", () => {
  it("returns true when courseId is 'all'", () => {
    UIState.courseId = "all";
    expect(inScope({ courseId: "c1" })).toBe(true);
  });

  it("returns true when object matches the current courseId", () => {
    UIState.courseId = "c1";
    expect(inScope({ courseId: "c1" })).toBe(true);
  });

  it("returns false when object does not match", () => {
    UIState.courseId = "c1";
    expect(inScope({ courseId: "c2" })).toBe(false);
  });
});

describe("events()", () => {
  beforeEach(() => {
    Store.db.events = [
      { id: "e1", courseId: "c1", status: "todo" },
      { id: "e2", courseId: "c1", status: "done" },
      { id: "e3", courseId: "c2", status: "todo" },
    ];
  });

  it("returns all events when courseId is 'all'", () => {
    UIState.courseId = "all";
    expect(events()).toHaveLength(3);
  });

  it("filters by courseId", () => {
    UIState.courseId = "c1";
    expect(events()).toHaveLength(2);
  });

  it("filters by status 'open'", () => {
    UIState.courseId = "all";
    expect(events({ status: "open" })).toHaveLength(2);
  });

  it("filters by status 'done'", () => {
    UIState.courseId = "all";
    expect(events({ status: "done" })).toHaveLength(1);
  });
});

describe("lessons()", () => {
  it("returns lessons sorted by start+week", () => {
    Store.db.lessons = [
      { id: "l1", courseId: "c1", week: 2, start: "2026-01-12" },
      { id: "l2", courseId: "c1", week: 1, start: "2026-01-05" },
    ];
    const result = lessons();
    expect(result[0].week).toBe(1);
    expect(result[1].week).toBe(2);
  });
});

describe("readings()", () => {
  it("filters readings by scope", () => {
    Store.db.readings = [
      { id: "r1", courseId: "c1" },
      { id: "r2", courseId: "c2" },
    ];
    UIState.courseId = "c1";
    expect(readings()).toHaveLength(1);
    expect(readings()[0].id).toBe("r1");
  });
});

describe("docs()", () => {
  it("filters documents by scope", () => {
    Store.db.documents = [
      { id: "d1", courseId: "c1" },
      { id: "d2", courseId: "c2" },
    ];
    UIState.courseId = "c1";
    expect(docs()).toHaveLength(1);
    expect(docs()[0].id).toBe("d1");
  });
});

describe("eventProgress()", () => {
  it("delegates to Tasks.progress()", () => {
    const e = {
      subtasks: [
        { done: true },
        { done: false },
      ],
    };
    expect(eventProgress(e)).toBe(50);
  });
});
