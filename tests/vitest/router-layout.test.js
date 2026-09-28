// @vitest-environment happy-dom
/**
 * The layout seam (core/router.js).
 *
 * Views return their body only; `Router.render()` composes the page frame and
 * the scope chip. These tests observe the rendered output in #viewRoot — the
 * interface a user (and the CSS) actually reads — and pin the single-wrap and
 * `padded: false` guarantees a string-matching router could not give.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Router } from "../../src/core/router.js";
import { Store } from "../../src/core/store.js";
import { UIState } from "../../src/core/scope.js";

function viewRoot() {
  const el = document.getElementById("viewRoot");
  expect(el).toBeTruthy();
  return el;
}

function paddedFrames(html) {
  return (html.match(/view-padded/g) || []).length;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="viewRoot" tabindex="-1"></div>';
  Store.resetAll();
  UIState.set("courseId", "all");
  UIState.set("view", "dashboard");
});

afterEach(() => {
  delete Router.viewDefs["layout-a"];
  delete Router.viewDefs["layout-chat"];
  document.body.innerHTML = "";
});

describe("Router.render layout seam", () => {
  it("wraps a view body in exactly one padded frame", () => {
    Router.registerView("layout-a", {
      title: "A",
      fn: () => '<p id="probe">hello</p>',
    });
    UIState.set("view", "layout-a");

    Router.render();

    const html = viewRoot().innerHTML;
    expect(paddedFrames(html)).toBe(1);
    expect(html).toBe('<div class="view-padded"><p id="probe">hello</p></div>');
  });

  it("injects the scope chip inside the padded frame for a focused course", () => {
    Store.db.courses = [{ id: "c1", code: "CS101", title: "Intro" }];
    Router.registerView("layout-a", {
      title: "A",
      fn: () => '<p id="probe">hello</p>',
    });
    UIState.set("view", "layout-a");
    UIState.set("courseId", "c1");

    Router.render();

    const html = viewRoot().innerHTML;
    expect(html).toContain("Focused on");
    expect(html).toContain("CS101");
    expect(paddedFrames(html)).toBe(1);
    expect(html.endsWith('<p id="probe">hello</p></div>')).toBe(true);
  });

  it("does not pad a view that opts out with padded: false", () => {
    Router.registerView("layout-chat", {
      title: "Chat",
      fn: () => '<div class="chat-area"></div>',
      padded: false,
    });
    UIState.set("view", "layout-chat");
    UIState.set("courseId", "all");

    Router.render();

    const html = viewRoot().innerHTML;
    expect(paddedFrames(html)).toBe(0);
    expect(html).toBe('<div class="chat-area"></div>');
  });

  it("still shows the chip for an opt-out view, without a padded frame", () => {
    Store.db.courses = [{ id: "c1", code: "CS101" }];
    Router.registerView("layout-chat", {
      title: "Chat",
      fn: () => '<div class="chat-area"></div>',
      padded: false,
    });
    UIState.set("view", "layout-chat");
    UIState.set("courseId", "c1");

    Router.render();

    const html = viewRoot().innerHTML;
    expect(html).toContain("Focused on");
    expect(paddedFrames(html)).toBe(0);
    expect(html.endsWith('<div class="chat-area"></div>')).toBe(true);
  });

  it("wraps the not-found view so it is still padded", () => {
    UIState.set("view", "no-such-view");

    Router.render();

    const html = viewRoot().innerHTML;
    expect(paddedFrames(html)).toBe(1);
    expect(html).toContain("Page not found");
  });
});
