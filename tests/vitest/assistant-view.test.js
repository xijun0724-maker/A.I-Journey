// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/core/router.js", () => {
  const Router = {
    render: vi.fn(),
    scheduleRender: vi.fn(),
    navigate: vi.fn(),
    renderRecentChats: vi.fn(),
  };
  /* assistant.js imports Router as the default export; other modules use
     the named export — expose the same object both ways. */
  return { Router, default: Router };
});

import { Store } from "../../src/core/store.js";
import { Router } from "../../src/core/router.js";
import { CFG } from "../../src/config/constants.js";
import { assistant, afterAssistant, resetModelDropdownState } from "../../src/views/assistant.js";

function buildDom(html) {
  document.body.innerHTML =
    '<div id="toasts" aria-live="polite"></div><div id="viewRoot">' +
    html +
    "</div>";
}

/* The input pill (and with it the model dropdown) only renders in the
   active-chat branch, so seed a transcript. */
function seedChat() {
  Store.db.chat = [
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
  ];
}

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

/* happy-dom does not expose its listener registry, so count document-level
   click listeners by intercepting registration (dispatch still works, since
   the original methods are used underneath). */
let tracker = null;
let origAdd = null;
let origRemove = null;

function trackDocClickListeners() {
  origAdd = document.addEventListener.bind(document);
  origRemove = document.removeEventListener.bind(document);
  let count = 0;
  document.addEventListener = function (type, fn, opts) {
    if (type === "click") count++;
    return origAdd(type, fn, opts);
  };
  document.removeEventListener = function (type, fn, opts) {
    if (type === "click") count--;
    return origRemove(type, fn, opts);
  };
  return {
    get count() {
      return count;
    },
  };
}

describe("model dropdown listener hygiene", () => {
  beforeEach(() => {
    Store.resetAll();
    resetModelDropdownState();
    tracker = trackDocClickListeners();
  });

  afterEach(() => {
    document.addEventListener = origAdd;
    document.removeEventListener = origRemove;
    origAdd = origRemove = null;
    tracker = null;
  });

  it("rebinding the view does not stack document click listeners", () => {
    seedChat();
    buildDom(assistant());
    afterAssistant(document.getElementById("viewRoot"));
    expect(tracker.count).toBe(1);

    /* Re-render (new markup, new after() pass): still exactly one closer. */
    buildDom(assistant());
    afterAssistant(document.getElementById("viewRoot"));
    expect(tracker.count).toBe(1);

    /* Once the dropdown is gone from the markup, the handler is dropped. */
    buildDom("");
    afterAssistant(document.getElementById("viewRoot"));
    expect(tracker.count).toBe(0);
  });

  it("a closer registered before teardown retires itself on the next outside click", () => {
    seedChat();
    buildDom(assistant());
    afterAssistant(document.getElementById("viewRoot"));
    expect(tracker.count).toBe(1);

    /* The view is replaced without a cleanup pass… */
    buildDom("");
    /* …the first outside click removes the stale listener itself. */
    document.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(tracker.count).toBe(0);
  });

  it("keeps closing an open dropdown on outside clicks while it exists", () => {
    seedChat();
    buildDom(assistant());
    afterAssistant(document.getElementById("viewRoot"));

    const drop = document.getElementById("modelDropdown");
    expect(drop).not.toBeNull();
    drop.classList.add("open");

    document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(drop.classList.contains("open")).toBe(false);
    expect(tracker.count).toBe(1);
  });
});

describe("model dropdown applies settings through the shared path", () => {
  beforeEach(() => {
    Store.resetAll();
    resetModelDropdownState();
    Router.render.mockClear();
  });

  it("switching model from the dropdown goes through the shared save path", () => {
    Store.db.settings.model = CFG.openrouter.model;
    seedChat();
    buildDom(assistant());
    afterAssistant(document.getElementById("viewRoot"));

    const deepseek = [...document.querySelectorAll(".model-option")].find(
      (b) => b.dataset.model === "deepseek/deepseek-v4-flash-0731:free",
    );
    expect(deepseek).toBeTruthy();

    click(deepseek);

    expect(Store.db.settings.model).toBe(
      "deepseek/deepseek-v4-flash-0731:free",
    );
    expect(Router.render).toHaveBeenCalled();
  });

  it("switching back to the auto-router restores the default model", () => {
    Store.db.settings.model = "deepseek/deepseek-v4-flash-0731:free";
    seedChat();
    buildDom(assistant());
    afterAssistant(document.getElementById("viewRoot"));

    const auto = [...document.querySelectorAll(".model-option")].find(
      (b) => b.dataset.model === CFG.openrouter.model,
    );
    expect(auto).toBeTruthy();

    click(auto);

    expect(Store.db.settings.model).toBe(CFG.openrouter.model);
  });
});

/* P2-2: the landing mimicked a research tool — a dead "Find papers" button,
   "What are you researching today?" and a "Research agent" meta line — none
   of which describe a study planner for coursework. */
describe("assistant landing voice", () => {
  beforeEach(() => {
    Store.resetAll();
  });

  it("shows one primary action — import — when the term is empty", () => {
    const html = assistant();
    expect(html).toContain("Import a syllabus");
    expect(html).toContain('data-act="go-import"');
    /* No chat chrome before there is something to reason about. */
    expect(html).not.toContain("chatInput");
    expect(html).not.toContain("btnModelSelect");
  });

  it("does not promise paper search or call itself a research agent", () => {
    Store.db.courses.push({ id: "c1", code: "CS101", title: "Intro CS" });
    const html = assistant();
    expect(html).not.toContain("Find papers");
    expect(html).not.toContain("Research agent");
    expect(html).not.toContain("researching today");
    expect(html).toContain("Ask about your study materials");
  });

  it("renders the search card and suggestions once a course exists", () => {
    Store.db.courses.push({ id: "c1", code: "CS101", title: "Intro CS" });
    const html = assistant();
    expect(html).toContain("chatInput");
    expect(html).toContain("elicit-card");
  });
});

/* P1-7: the widget stated "high confidence 91%" — a number calibrated on
   plumbing, not truth. It is a provenance line now: where the text came
   from, whether it can be checked, and never a percentage. */
describe("answer provenance line", () => {
  function seedAnswer(msg) {
    Store.db.chat = [
      { role: "user", content: "question", ts: Date.now() },
      Object.assign(
        { id: "m1", role: "assistant", content: "answer", ts: Date.now() },
        msg,
      ),
    ];
  }

  function renderLog() {
    document.body.innerHTML = '<div id="viewRoot"></div>';
    document.getElementById("viewRoot").innerHTML = assistant();
    return document.getElementById("viewRoot");
  }

  it("states where the answer came from instead of a confidence percentage", () => {
    seedAnswer({
      mode: "ai",
      model: "deepseek/deepseek-v4-flash-0731:free",
      provenance: {
        band: "grounded",
        mode: "ai",
        passages: 4,
        docs: 2,
        cited: true,
        allCitationsValid: true,
        model: "deepseek/deepseek-v4-flash-0731:free",
      },
    });
    const html = renderLog().innerHTML;
    expect(html).toContain("Grounded in your documents");
    expect(html).toContain("4 passages from 2 documents");
    expect(html).toContain("composed by deepseek/deepseek-v4-flash-0731:free");
    expect(html).not.toMatch(/\d+%/);
    expect(html).not.toContain("conf-widget");
  });

  it("caps the wording at supported for an offline extract", () => {
    seedAnswer({
      mode: "offline",
      provenance: {
        band: "supported",
        mode: "offline",
        passages: 3,
        docs: 1,
        cited: true,
        allCitationsValid: true,
      },
    });
    const html = renderLog().innerHTML;
    expect(html).toContain("Supported by your documents");
    expect(html).toContain("extracted from your files");
    expect(html).not.toContain("Grounded");
  });

  it("warns when the answer cites nothing checkable", () => {
    seedAnswer({
      mode: "ai",
      provenance: {
        band: "weak",
        mode: "ai",
        passages: 3,
        docs: 1,
        cited: false,
        allCitationsValid: true,
      },
    });
    const html = renderLog().innerHTML;
    expect(html).toContain("uncited");
  });

  it("tells the student to verify independently when nothing matched", () => {
    seedAnswer({
      mode: "offline",
      provenance: {
        band: "ungrounded",
        mode: "offline",
        passages: 0,
        docs: 0,
        cited: false,
        allCitationsValid: true,
      },
    });
    const html = renderLog().innerHTML;
    expect(html).toContain("No matching passages");
    expect(html).toContain("verify independently");
    expect(html).toContain("no passages");
  });

  it("renders nothing for messages stored before the change", () => {
    seedAnswer({ mode: "offline" }); /* no provenance field at all */
    const html = renderLog().innerHTML;
    expect(html).not.toContain("prov-widget");
  });

  it("escapes the model name before it reaches the DOM", () => {
    seedAnswer({
      mode: "ai",
      provenance: {
        band: "grounded",
        mode: "ai",
        passages: 2,
        docs: 1,
        cited: true,
        allCitationsValid: true,
        model: '<script>alert(1)</script>',
      },
    });
    const html = renderLog().innerHTML;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
