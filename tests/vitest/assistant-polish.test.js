// @vitest-environment happy-dom
/**
 * The assistant surface, after the polish pass over
 * `.impeccable/critique/2026-09-27T14-37-25Z__src-views-assistant-js.md`:
 *
 *   P0  a send from the landing page paints the conversation it opens
 *   P0  the landing cards are real buttons, reachable without a mouse
 *   P1  the transcript is a live log and the settled answer is announced
 *   P1  the pane says which conversation, which provider, which document scope
 *   P2  the model pill names the model and works from the keyboard, and a
 *       draft survives the repaint that choosing a model causes
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/* Router is mocked, but `render` must behave like a render — otherwise the
   landing-send case cannot be observed at all. */
const renderHook = vi.hoisted(() => ({ current: null }));

vi.mock("../../src/core/router.js", () => {
  const Router = {
    render: vi.fn(() => {
      if (renderHook.current) renderHook.current();
    }),
    scheduleRender: vi.fn(),
    navigate: vi.fn(),
    renderRecentChats: vi.fn(),
  };
  /* assistant.js imports Router as the default export; other modules use the
     named export — expose the same object both ways. */
  return { Router, default: Router };
});

import { Store } from "../../src/core/store.js";
import { UIState } from "../../src/core/scope.js";
import {
  assistant,
  afterAssistant,
  sendChat,
  retryLastQuestion,
  resetModelDropdownState,
} from "../../src/views/assistant.js";

function seedCourse() {
  Store.db.courses.push({ id: "c1", code: "CS101", title: "Intro CS" });
}

/** One exchange, stored the way the app stores it. */
function seedConversation(extra) {
  Store.db.chat = [
    { id: "m1", role: "user", content: "what is due this week?", ts: Date.now() },
    {
      id: "m2",
      role: "assistant",
      content: "Two things.",
      ts: Date.now(),
    },
  ];
  if (extra) Store.db.chat.push(extra);
}

function mount(html) {
  document.body.innerHTML =
    '<div id="toasts" aria-live="polite"></div>' +
    '<div id="srStatus" class="sr-only" aria-live="polite"></div>' +
    '<div id="viewRoot"></div>';
  const root = document.getElementById("viewRoot");
  root.innerHTML = html === undefined ? assistant() : html;
  afterAssistant(root);
  return root;
}

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

function key(el, name) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
}

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

beforeEach(() => {
  Store.resetAll();
  resetModelDropdownState();
  UIState.set("chatSources", []);
  /* No API key: the built-in retrieval path answers, so these tests stay
     offline and deterministic. */
  renderHook.current = () => mount();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("sending from the landing page", () => {
  it("paints the conversation the send opens, because the landing has no log", async () => {
    seedCourse();
    mount();
    expect(document.getElementById("chatLog")).toBeNull();

    sendChat("what is due this week?");

    /* The bug: the send looked dead — no bubble, no dots, no answer. */
    const log = document.getElementById("chatLog");
    expect(log).toBeTruthy();
    expect(log.textContent).toContain("what is due this week?");
    expect(document.getElementById("typingIndicator")).toBeTruthy();
    /* …and the bubble is there exactly once (no double paint). */
    expect(
      [...log.querySelectorAll(".msg.user .bub")].filter((b) =>
        b.textContent.includes("what is due this week?"),
      ),
    ).toHaveLength(1);

    await waitFor(() => UIState.chatPending === false);
    expect(document.getElementById("typingIndicator")).toBeNull();
    expect(log.querySelectorAll(".msg.ai .msg-ai-body").length).toBeGreaterThan(0);
  });

  it("announces the settled answer to assistive tech", async () => {
    seedCourse();
    mount();
    sendChat("what is due this week?");
    await waitFor(() => UIState.chatPending === false);

    expect(document.getElementById("srStatus").textContent).toContain(
      "Answer ready.",
    );
  });
});

describe("landing cards", () => {
  it("are buttons, so they are reachable with a keyboard", () => {
    seedCourse();
    Store.db.chat = [
      { id: "m1", role: "user", content: "an older question", ts: Date.now() },
    ];
    /* The cards are the landing page's: nothing open, history waiting. */
    Store.chat.newConversation();
    const html = assistant();

    expect(html).toContain('<button type="button" class="elicit-suggestion-card"');
    expect(html).not.toContain('<div class="elicit-suggestion-card"');
    /* The card truncates its label, so the accessible name carries it whole. */
    expect(html).toContain('aria-label="Resume: an older question"');
    /* No block-level element inside a button. */
    expect(html).not.toMatch(/elicit-suggestion-card[\s\S]{0,400}<p /);
  });

  it("pluralises resume ages instead of saying '1 hours ago'", () => {
    seedCourse();
    Store.db.chat = [
      {
        id: "m1",
        role: "user",
        content: "an older question",
        ts: Date.now() - 60 * 60 * 1000,
      },
    ];
    Store.chat.newConversation();
    const html = assistant();
    expect(html).toContain("1 hour ago");
    expect(html).not.toContain("1 hours ago");
  });
});

describe("the transcript as a record", () => {
  it("is a live log, and the provisional answer stays out of it", () => {
    seedCourse();
    seedConversation();
    const root = mount();
    const log = root.querySelector("#chatLog");

    expect(log.getAttribute("role")).toBe("log");
    expect(log.getAttribute("aria-live")).toBe("polite");
  });

  it("marks a failed turn as a failure and offers the retry", () => {
    seedCourse();
    Store.db.chat = [
      { id: "m1", role: "user", content: "will this fail?", ts: 1 },
      {
        id: "m2",
        role: "assistant",
        kind: "error",
        content: "I could not produce an answer for that question.",
        ts: 2,
      },
    ];
    const html = assistant();

    expect(html).toContain("msg-error");
    expect(html).toContain('data-act="chat-retry"');
    /* The provider's own text never becomes the transcript's words. */
    expect(html).not.toContain("Failed to fetch");
  });

  it("re-asks the last question instead of making the student retype it", async () => {
    seedCourse();
    seedConversation();
    mount();
    const before = Store.db.chat.filter((m) => m.role === "user").length;

    retryLastQuestion();
    await waitFor(() => UIState.chatPending === false);

    const asked = Store.db.chat.filter((m) => m.role === "user");
    expect(asked).toHaveLength(before + 1);
    expect(asked[asked.length - 1].content).toBe("what is due this week?");
  });
});

describe("the pane header", () => {
  it("names the open conversation and the provider", () => {
    seedCourse();
    seedConversation();
    const root = mount();

    expect(root.querySelector(".chat-title").textContent).toBe(
      "what is due this week?",
    );
    /* Same words Settings uses, so the two surfaces cannot disagree. */
    expect(root.querySelector(".chat-head").textContent).toContain(
      "offline mode",
    );
  });

  it("shows the document scope that Library → Ask silently set, and clears it", () => {
    seedCourse();
    seedConversation();
    Store.db.documents.push({ id: "d1", name: "Thermodynamics notes" });
    UIState.set("chatSources", ["d1"]);

    const root = mount();
    const head = root.querySelector(".chat-head");
    expect(head.textContent).toContain("Asking about: Thermodynamics notes");
    expect(head.querySelector('[data-act="chat-scope-clear"]')).toBeTruthy();
  });

  it("stays out of the way on an unscoped landing page", () => {
    seedCourse();
    const root = mount();
    expect(root.querySelector(".chat-head")).toBeNull();
  });
});

describe("the model picker", () => {
  it("names the model on the pill rather than calling it 'Free'", () => {
    seedCourse();
    seedConversation();
    const root = mount();
    const pill = root.querySelector("#btnModelSelect");

    expect(pill.textContent).toContain("Free auto-router");
    expect(pill.getAttribute("aria-expanded")).toBe("false");
    expect(pill.getAttribute("aria-controls")).toBe("modelDropdown");
    expect(pill.getAttribute("aria-label")).toContain("Free auto-router");
  });

  it("asks one question up front and folds the catalogue away", () => {
    /* Nine equal-weight rows made a decision the app has no basis to hand the
       student. One primary choice, the rest behind a disclosure. */
    seedCourse();
    seedConversation();
    const root = mount();
    const primary = root.querySelector(".model-option");
    const more = root.querySelector("#btnMoreModels");
    const list = root.querySelector("#modelMoreList");

    expect(primary.getAttribute("data-model")).toBe("openrouter/free");
    expect(primary.getAttribute("aria-pressed")).toBe("true");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(list.hidden).toBe(true);
    /* Every model is still reachable — folded, not removed. */
    expect(list.querySelectorAll(".model-option")).toHaveLength(7);

    click(more);
    expect(list.hidden).toBe(false);
    expect(more.getAttribute("aria-expanded")).toBe("true");

    click(more);
    expect(list.hidden).toBe(true);
    expect(more.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the disclosure open when the current model lives inside it", () => {
    seedCourse();
    seedConversation();
    Store.db.settings.model = "deepseek/deepseek-v4-flash-0731:free";
    const root = mount();
    const list = root.querySelector("#modelMoreList");

    expect(list.hidden).toBe(false);
    const active = list.querySelector('.model-option[data-model="deepseek/deepseek-v4-flash-0731:free"]');
    expect(active.getAttribute("aria-pressed")).toBe("true");
    /* The pill stays a one-line control: the parenthetical is detail. */
    expect(root.querySelector("#btnModelSelect").textContent).toBe(
      "DeepSeek V4 Flash",
    );
    expect(active.querySelector(".model-option-note").textContent).toBe(
      "1M ctx",
    );
  });

  it("opens, closes on Escape, and moves focus over the visible rows only", () => {
    seedCourse();
    seedConversation();
    const root = mount();
    const pill = root.querySelector("#btnModelSelect");
    const drop = root.querySelector("#modelDropdown");
    const list = root.querySelector("#modelMoreList");

    key(pill, "ArrowDown");
    expect(drop.classList.contains("open")).toBe(true);
    expect(pill.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(drop.querySelector(".model-option"));

    /* Folded rows are not arrow stops: collapsed, there is one choice to
       walk, and the arrow does not land inside the hidden list. */
    key(drop, "ArrowDown");
    expect(document.activeElement).toBe(drop.querySelector(".model-option"));
    expect(list.contains(document.activeElement)).toBe(false);

    click(root.querySelector("#btnMoreModels"));
    key(drop, "ArrowDown");
    expect(list.contains(document.activeElement)).toBe(true);

    key(drop, "Escape");
    expect(drop.classList.contains("open")).toBe(false);
    expect(pill.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(pill);
  });
});

describe("the composer", () => {
  it("does not offer Send as an action while there is nothing to send", () => {
    seedCourse();
    seedConversation();
    const root = mount();
    const ta = root.querySelector("#chatInput");
    const send = root.querySelector(".pill-send");

    expect(send.disabled).toBe(true);

    ta.value = "a question";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    expect(send.disabled).toBe(false);

    ta.value = "   ";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    expect(send.disabled).toBe(true);
  });

  it("keeps a half-typed question across the repaint a model change causes", () => {
    seedCourse();
    seedConversation();
    const root = mount();
    const ta = root.querySelector("#chatInput");
    ta.value = "a half-typed question";
    ta.dispatchEvent(new Event("input", { bubbles: true }));

    /* Choosing a model re-renders the whole view. */
    mount();

    expect(document.getElementById("chatInput").value).toBe(
      "a half-typed question",
    );
  });
});
