// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Router } from "../../src/core/router.js";
import { Store } from "../../src/core/store.js";
import { UIState } from "../../src/core/scope.js";
import { esc } from "../../src/utils/helpers.js";

describe("Router.mark() SVG generation", () => {
  it("returns SVG for known icons", () => {
    const svg = Router.mark("dashboard");
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 16 16"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain("<rect");
  });

  it("returns SVG for tasks icon", () => {
    const svg = Router.mark("tasks");
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 16 16"');
  });

  it("returns empty string for unknown icon", () => {
    expect(Router.mark("nonexistent")).toBe("");
  });
});

describe("Router.icons registry", () => {
  it("has icons for all navigation items", () => {
    Router.navGroups.forEach((g) => {
      g.items.forEach((item) => {
        expect(Router.icons).toHaveProperty(item.icon);
        expect(Router.icons[item.icon]).toBeTruthy();
      });
    });
  });

  it("all icon values are SVG path strings", () => {
    Object.values(Router.icons).forEach((val) => {
      expect(typeof val).toBe("string");
      expect(val.length).toBeGreaterThan(0);
    });
  });
});

describe("Router.viewDefs", () => {
  beforeEach(() => {
    // Clean up any test views
    delete Router.viewDefs["test-view"];
  });

  it("registerView stores a view definition", () => {
    Router.registerView("test-view", {
      title: "Test View",
      fn: () => "<div>test</div>",
    });
    expect(Router.viewDefs["test-view"]).toBeDefined();
    expect(Router.viewDefs["test-view"].title).toBe("Test View");
  });

  it("registerView overwrites duplicate registrations", () => {
    Router.registerView("test-view", { title: "V1" });
    Router.registerView("test-view", { title: "V2" });
    expect(Router.viewDefs["test-view"].title).toBe("V2");
  });
});

describe("Router.navGroups structure", () => {
  it("has exactly one group", () => {
    expect(Router.navGroups.length).toBe(1);
  });

  it("group targets #navMain", () => {
    expect(Router.navGroups[0].target).toBe("#navMain");
  });

  it("each item has id, label, and icon", () => {
    Router.navGroups.forEach((g) => {
      g.items.forEach((item) => {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("label");
        expect(item).toHaveProperty("icon");
        expect(typeof item.id).toBe("string");
        expect(typeof item.label).toBe("string");
        expect(typeof item.icon).toBe("string");
      });
    });
  });

  it("has dashboard as first nav item", () => {
    expect(Router.navGroups[0].items[0].id).toBe("dashboard");
  });

  it("orders navigation items based on information hierarchy", () => {
    const ids = Router.navGroups[0].items.map((i) => i.id);
    expect(ids).toEqual([
      "dashboard",
      "roadmap",
      "planner",
      "calendar",
      "tasks",
      "library",
    ]);
  });

  it("has roadmap and library in nav", () => {
    const ids = Router.navGroups[0].items.map((i) => i.id);
    expect(ids).toContain("roadmap");
    expect(ids).toContain("library");
    expect(ids).not.toContain("assistant");
    expect(ids).not.toContain("courses");
    expect(ids).not.toContain("import");
    expect(ids).not.toContain("settings");
  });

  it("no settings, import, or assistant in navGroups", () => {
    const allIds = Router.navGroups.flatMap((g) => g.items.map((i) => i.id));
    expect(allIds).not.toContain("import");
    expect(allIds).not.toContain("settings");
    expect(allIds).not.toContain("assistant");
  });
});

describe("Router navigation", () => {
  it("navigate is a function", () => {
    expect(typeof Router.navigate).toBe("function");
  });

  it("Router has all expected API methods", () => {
    expect(typeof Router.mark).toBe("function");
    expect(typeof Router.registerView).toBe("function");
    expect(typeof Router.renderNav).toBe("function");
    expect(typeof Router.render).toBe("function");
    expect(typeof Router.scheduleRender).toBe("function");
    expect(typeof Router.onStoreChange).toBe("function");
    expect(typeof Router.navigate).toBe("function");
    expect(typeof Router.init).toBe("function");
  });
});

/** The app's front door: a blank session opens on the assistant landing, so
 *  no syllabus import is needed before the first question. */
describe("start view", () => {
  afterEach(() => {
    delete Router.viewDefs["assistant"];
    UIState.view = "dashboard";
  });

  it("opens the assistant landing when the view is unset", () => {
    Router.registerView("assistant", {
      title: "Journey A.I",
      fn: () => "<div>landing</div>",
    });
    document.body.innerHTML = '<div id="viewRoot"></div><div id="navMain"></div>';
    /* An unrecognised (i.e. first-visit) view resolves through the same
       default the router uses on boot. */
    UIState.view = "not-a-real-view";

    Router.render();

    expect(UIState.view).toBe("assistant");
    expect(document.getElementById("viewRoot").textContent).toContain("landing");
  });
});

describe("esc() HTML escaping", () => {
  it("escapes HTML entities", () => {
    expect(esc("<script>")).toBe("&lt;script&gt;");
    expect(esc("a&b")).toBe("a&amp;b");
    expect(esc('"quote"')).toBe("&quot;quote&quot;");
  });

  it("returns empty string for falsy input", () => {
    expect(esc("")).toBe("");
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  it("leaves normal text unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
    expect(esc("abc 123")).toBe("abc 123");
  });
});

/**
 * The Store -> Router repaint policy: bootstrap subscribes this function
 * to `Store.on("change")`, so it is the one place that decides what a
 * mutation repaints. Chat appends repaint Recents only (the assistant
 * paints its transcript incrementally); everything else repaints the view.
 */
function waitFor(predicate, ms = 500) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > ms) return reject(new Error("timed out"));
      setTimeout(tick, 5);
    };
    tick();
  });
}

describe("Router.onStoreChange repaint policy", () => {
  let list;

  beforeEach(() => {
    Store.resetAll();
    document.body.innerHTML =
      '<div id="recentChatList"></div><div id="viewRoot"></div>';
    list = document.getElementById("recentChatList");
    Router.registerView("policy-view", {
      title: "Policy",
      fn: () => '<div id="policyMarker">view</div>',
    });
    UIState.view = "policy-view";
    document.getElementById("viewRoot").innerHTML = '<div id="stale"></div>';
  });

  afterEach(() => {
    delete Router.viewDefs["policy-view"];
    UIState.view = "dashboard";
  });

  it("repaints only Recents for a chat append, leaving the view alone", () => {
    Store.db.chat = [{ role: "user", content: "hello there" }];

    Router.onStoreChange({ entity: "chat", op: "append", id: "c1" });

    expect(list.querySelectorAll(".recent-chat-link")).toHaveLength(1);
    expect(list.textContent).toContain("hello there");
    /* The transcript � and any half-typed draft in it � was not rebuilt. */
    expect(document.getElementById("viewRoot").innerHTML).toContain("stale");
  });

  it("repaints the whole view for any other mutation", async () => {
    Router.onStoreChange({ entity: "events", op: "save", id: "e1" });

    await waitFor(() => document.getElementById("policyMarker"));
    expect(document.getElementById("stale")).toBeNull();
  });
});
