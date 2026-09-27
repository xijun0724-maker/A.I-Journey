// @vitest-environment happy-dom
/**
 * The action dispatch registry (core/actions/index.js).
 *
 * Direct actions, static handlers and context handlers are three tables, but a
 * caller only ever crosses `act()` and `KNOWN_ACTIONS`. These tests pin the
 * parity invariant (nothing served can be unknown) and the behaviour of the
 * direct actions that used to live in a parallel if-ladder.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  act,
  KNOWN_ACTIONS,
  buildDispatch,
} from "../../src/core/actions/index.js";
import { Router } from "../../src/core/router.js";
import { UIState } from "../../src/core/state.js";

const DIRECT_ACTIONS = [
  "nav",
  "view",
  "go-import",
  "ask",
  "tab",
  "course-view",
  "course-open-roadmap",
  "roadmap-view",
  "scope-course",
  "scope-clear",
  "scope-clear-to-courses",
  "task-ask",
  "cal-prev",
  "cal-next",
  "cal-today",
  "cal-day-view",
  "cal-day-new",
];

beforeEach(() => {
  UIState.set("courseId", "all");
  UIState.set("view", "dashboard");
  UIState.set("tab", {});
  // The direct handlers route/render; stub the router so these stay unit-level.
  vi.spyOn(Router, "scheduleRender").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the registry is a single source of truth", () => {
  it("has no dispatch-table handler that KNOWN_ACTIONS does not know", () => {
    const table = buildDispatch(null, null, null);
    const unknown = Object.keys(table).filter((n) => !KNOWN_ACTIONS.has(n));
    expect(unknown).toEqual([]);
  });

  it("registers every direct action in KNOWN_ACTIONS", () => {
    const missing = DIRECT_ACTIONS.filter((n) => !KNOWN_ACTIONS.has(n));
    expect(missing).toEqual([]);
  });
});

describe("direct actions through act()", () => {
  it("nav routes and seeds the courses/roadmap tabs", () => {
    const nav = vi.spyOn(Router, "navigate").mockImplementation(() => {});

    act("nav", { dataset: { act: "nav", arg: "roadmap" } });

    expect(UIState.tab.courses).toBe("roadmap");
    expect(UIState.tab.roadmap).toBe("roadmap");
    expect(nav).toHaveBeenCalledWith("roadmap");
  });

  it("scope-course focuses a course and scope-clear returns to all", () => {
    act("scope-course", { dataset: { act: "scope-course", id: "c9" } });
    expect(UIState.courseId).toBe("c9");

    act("scope-clear", { dataset: { act: "scope-clear" } });
    expect(UIState.courseId).toBe("all");
  });
});
