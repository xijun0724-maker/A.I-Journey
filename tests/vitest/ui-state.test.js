// @vitest-environment happy-dom
/**
 * Tests for src/core/scope.js — the UI namespace shared with core actions.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

let UI;
let UIState;

beforeEach(async () => {
  document.body.innerHTML = '<div id="toasts"></div>';
  vi.resetModules();
  ({ UI, UIState } = await import("../../src/core/scope.js"));
});

describe("UI namespace", () => {
  it("exposes the helpers core actions call", () => {
    ["toastSaved", "courses", "inScope", "events", "readings"].forEach(
      (name) => expect(typeof UI[name]).toBe("function"),
    );
    expect(UI.state).toBeTruthy();
  });

  it("toastSaved() renders an ok toast", () => {
    UI.toastSaved("Settings saved.");
    const toasts = document.getElementById("toasts");
    expect(toasts.innerHTML).toContain("Settings saved.");
    expect(toasts.innerHTML).toContain("toast-item ok");
  });

  it("toastSaved() falls back to a generic message", () => {
    UI.toastSaved();
    expect(document.getElementById("toasts").innerHTML).toContain("Saved.");
  });
});

/**
 * Regression: the proxy used to read its *target* while `setPath` replaced the
 * live root with a copy, so every `UIState.set()` was invisible to the next
 * read - `chatPending` was permanently false and `plannerPreview` permanently
 * undefined, silently killing the plan-preview flow.
 */
describe("UIState.set is visible to reads", () => {
  it("round-trips a top-level key", () => {
    expect(UIState.chatPending).toBe(false);
    UIState.set("chatPending", true);
    expect(UIState.chatPending).toBe(true);
    UIState.set("chatPending", false);
    expect(UIState.chatPending).toBe(false);
  });

  it("round-trips a key the initial state never declared", () => {
    const preview = { planItems: [1, 2] };
    UIState.set("plannerPreview", preview);
    expect(UIState.plannerPreview).toBe(preview);
  });

  it("updates a dotted path and preserves its siblings", () => {
    UIState.set("tab", { tasks: "due", plan: "week" });
    UIState.set("tab.tasks", "priority");
    expect(UIState.tab.tasks).toBe("priority");
    expect(UIState.tab.plan).toBe("week");
  });

  it("keeps direct assignment visible too (the router pattern)", () => {
    UIState.view = "tasks";
    expect(UIState.view).toBe("tasks");
  });

  it("notifies subscribers for both set() and direct writes", () => {
    const seen = [];
    const off = UIState.subscribe("chatSources", (v) => seen.push(v));
    UIState.set("chatSources", ["d1"]);
    UIState.chatSources = ["d2"];
    off();
    UIState.set("chatSources", ["d3"]);
    expect(seen).toEqual([["d1"], ["d2"]]);
  });
});
