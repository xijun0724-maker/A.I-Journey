// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { UIState } from "../../src/core/scope.js";
import { clearApiKey, setApiKey } from "../../src/utils/secure.js";
import { RAG } from "../../src/domain/rag.js";
import {
  isPending,
  abortPending,
  sendChat,
  assistant,
  requestStudyPlan,
} from "../../src/views/assistant.js";
import { Planner } from "../../src/domain/planner.js";
import { initActionDelegation } from "../../src/app/actions-delegation.js";

function buildDom() {
  document.body.innerHTML =
    '<div id="toasts" aria-live="polite"></div>' +
    '<div class="chat-log" id="chatLog"></div>' +
    '<div id="viewRoot"></div>' +
    '<textarea id="chatInput"></textarea>';
}

/* The data-act delegation lives on `document`, so register it once. */
beforeAll(() => {
  initActionDelegation();
});

function waitFor(predicate, ms = 2000) {
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

function keyed() {
  Store.db.settings.aiEnabled = true;
  setApiKey("test-key-0123456789abcdef");
}

let originalFetch = null;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  Store.resetAll();
  clearApiKey();
  RAG.invalidate();
  buildDom();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("assistant Stop control", () => {
  it("reports nothing pending when idle", () => {
    expect(isPending()).toBe(false);
    expect(abortPending()).toBe(false);
  });

  it("aborts an in-flight answer and records no reply", async () => {
    keyed();
    globalThis.fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        const onAbort = () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        };
        if (init.signal.aborted) return onAbort();
        init.signal.addEventListener("abort", onAbort);
      });

    sendChat("what is on my plate?");
    expect(UIState.chatPending).toBe(true);
    expect(isPending()).toBe(true);

    expect(abortPending()).toBe(true);
    expect(isPending()).toBe(false);

    await waitFor(() => UIState.chatPending === false);
    expect(Store.db.chat.map((m) => m.role)).toEqual(["user"]);
    expect(document.getElementById("typingIndicator")).toBeNull();
    expect(document.getElementById("toasts").textContent).toMatch(/stopped/i);
  });

  it("clears the controller once an answer completes so a stale abort cannot fire", async () => {
    keyed();
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Here you go." } }],
        }),
      });

    sendChat("hello there");
    await waitFor(() => UIState.chatPending === false);

    expect(Store.db.chat.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(Store.db.chat[1].content).toContain("Here you go.");
    expect(isPending()).toBe(false);
    expect(abortPending()).toBe(false);
  });
});

/**
 * The proposal card is rendered from UIState, never from the stored message:
 * after a reload there is no proposal to act on, so there must be no button
 * pretending there is.
 */
describe("study-plan proposal card", () => {
  function seedWork() {
    Store.resetAll();
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
    Store.db.chat.push({
      id: "m1",
      role: "assistant",
      content: "## This week\n- revise",
      ts: Date.now(),
    });
  }

  function offer(exclude) {
    const draft = Planner.generateInteractive({ weeks: 2, exclude: exclude });
    draft.meta.provenance = {
      mode: "ai",
      model: "test-model",
      tools: ["get_snapshot"],
      calls: 2,
    };
    UIState.set("planProposal", {
      draft: draft,
      exclude: exclude || [],
      ts: Date.now(),
    });
    return draft;
  }

  beforeEach(() => {
    seedWork();
  });

  it("renders the accept/edit/reject choice and the provenance", () => {
    offer();

    const html = assistant();

    expect(html).toContain('data-act="plan-proposal-accept"');
    expect(html).toContain('data-act="plan-proposal-edit"');
    expect(html).toContain('data-act="plan-proposal-reject"');
    expect(html).toContain("Drafted by the AI (test-model)");
    expect(html).toContain("2 model calls");
    expect(html).toContain("Nothing is saved until you accept");
    /* One toggle per task in the draft. */
    expect(html).toContain('data-act="plan-proposal-exclude" data-id="e-keep"');
    expect(html).toContain('data-act="plan-proposal-exclude" data-id="e-drop"');
  });

  it("shows no card at all when there is no proposal", () => {
    UIState.set("planProposal", null);

    const html = assistant();

    expect(html).not.toContain("plan-proposal");
  });

  it("marks an excluded task and says the AI notes predate the change", () => {
    offer(["e-drop"]);

    const html = assistant();

    expect(html).toContain(
      'data-id="e-drop" role="checkbox" aria-checked="true"',
    );
    expect(html).toContain(
      'data-id="e-keep" role="checkbox" aria-checked="false"',
    );
    expect(html).toContain("task(s) left out");
  });

  it("never stores the offer, or its buttons, in the transcript", () => {
    offer();

    assistant();

    const stored = Store.db.chat.map((m) => m.content).join("\n");
    expect(stored).not.toContain("plan-proposal");
    expect(stored).not.toContain("data-act");
  });
});

/**
 * The whole point of Step 7: asking for a plan must produce an offer, and the
 * plan must only change when the student clicks Accept.
 */
describe("ask for a plan, then decide", () => {
  function seedWork() {
    Store.db.settings.studyWeekday = 3;
    Store.db.settings.studyWeekend = 3;
    Store.db.events = [
      {
        id: "e1",
        title: "Midterm essay",
        type: "assignment",
        status: "todo",
        courseId: null,
        due: new Date(Date.now() + 4 * 86400000).toISOString(),
        subtasks: [{ id: "s1", title: "Draft", minutes: 90, done: false }],
      },
    ];
  }

  beforeEach(() => {
    buildDom();
    seedWork();
  });

  it("offers the plan without touching it, and commits only on Accept", async () => {
    requestStudyPlan();
    await waitFor(() => UIState.chatPending === false);

    /* Offered, not applied. */
    expect(UIState.planProposal).toBeTruthy();
    expect(UIState.planProposal.draft.planItems.length).toBeGreaterThan(0);
    expect(Store.db.plan).toEqual([]);
    expect(Store.db.planMeta).toBeNull();

    const card = document.getElementById("planProposalCard");
    expect(card).toBeTruthy();
    expect(card.textContent).toContain("Nothing is saved until you accept");

    /* Accept through the real click delegation. */
    card.querySelector('[data-act="plan-proposal-accept"]').click();

    expect(Store.db.plan.length).toBeGreaterThan(0);
    expect(Store.db.planMeta).toBeTruthy();
    expect(UIState.planProposal).toBeNull();
    expect(assistant()).not.toContain("plan-proposal");
  });

  it("keeps the existing plan when the student declines", async () => {
    Store.db.plan = [{ id: "mine", label: "My old plan" }];
    Store.db.planMeta = { weeks: 1, unscheduled: [], atRisk: [], excluded: [] };

    requestStudyPlan();
    await waitFor(() => UIState.chatPending === false);

    document
      .getElementById("planProposalCard")
      .querySelector('[data-act="plan-proposal-reject"]')
      .click();

    expect(Store.db.plan.map((b) => b.id)).toEqual(["mine"]);
    expect(UIState.planProposal).toBeNull();
    expect(assistant()).not.toContain("plan-proposal");
  });
});
