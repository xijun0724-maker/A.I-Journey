// @vitest-environment happy-dom
/**
 * Conversation semantics for the assistant (Gemini-style):
 *
 *  1. "New" returns to the landing page; the previous conversation is kept.
 *  2. Recents lists one row per conversation, not one row per prompt.
 *  3. "New" starts a *second* conversation; both stay listed.
 *  4. Clicking a Recents row resumes that conversation instead of re-sending.
 *  5. The model only sees the conversation that is open.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

vi.mock("../../src/core/router.js", () => {
  const Router = {
    render: vi.fn(),
    scheduleRender: vi.fn(),
    navigate: vi.fn(),
    renderRecentChats: vi.fn(),
  };
  /* assistant.js imports Router as the default export; actions/index.js
     imports the named one — expose the same object both ways. */
  return { Router, default: Router };
});

import { Store } from "../../src/core/store.js";
import { UIState } from "../../src/core/state.js";
import { Router } from "../../src/core/router.js";
import { setApiKey, clearApiKey } from "../../src/utils/secure.js";
import { RAG } from "../../src/domain/rag.js";
import { renderRecents } from "../../src/utils/format.js";
import { assistant, sendChat } from "../../src/views/assistant.js";
import { initActionDelegation } from "../../src/app/actions-delegation.js";

beforeAll(() => {
  initActionDelegation();
});

let originalFetch = null;
let requests = [];

function buildDom(html) {
  document.body.innerHTML =
    '<div id="toasts" aria-live="polite"></div>' +
    '<div id="viewRoot">' +
    (html || "") +
    "</div>" +
    '<div class="chat-log" id="chatLog"></div>' +
    '<textarea id="chatInput"></textarea>' +
    '<div id="recentChatList"></div>' +
    '<button class="sb-new-chat" data-act="chat-new">New</button>';
}

/** One conversation, two exchanges, stored the way legacy data looks. */
function seedConversation() {
  Store.db.chat = [
    { id: "m1", role: "user", content: "first question", ts: 1 },
    { id: "m2", role: "assistant", content: "answer one", ts: 2 },
    { id: "m3", role: "user", content: "follow-up question", ts: 3 },
    { id: "m4", role: "assistant", content: "answer two", ts: 4 },
  ];
}

function recents() {
  /* Mirror what the router renders into the sidebar. */
  renderRecents(
    document.getElementById("recentChatList"),
    Store.chat.conversations(),
    { activeCid: Store.chat.activeId() },
  );
  return [...document.querySelectorAll("#recentChatList .recent-chat-link")];
}

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function clickNew() {
  click(document.querySelector('[data-act="chat-new"]'));
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

async function send(text) {
  sendChat(text);
  await waitFor(() => UIState.chatPending === false);
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  Store.resetAll();
  clearApiKey();
  RAG.invalidate();
  Router.navigate.mockClear();
  requests = [];

  Store.db.settings.aiEnabled = true;
  Store.db.settings.provider = "gemini";
  setApiKey("test-key-0123456789abcdef", "gemini");

  globalThis.fetch = (_url, init) => {
    requests.push(String((init && init.body) || ""));
    return Promise.resolve({
      ok: true,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: "Here you go." }] } },
        ],
      }),
    });
  };
  buildDom(assistant());
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("New chat button", () => {
  it("returns to the landing page without destroying the conversation", () => {
    seedConversation();
    buildDom(assistant());
    expect(document.querySelector("#chatLog")).toBeTruthy();

    clickNew();

    /* Symptom 1: New must land on the Journey A.I landing page. */
    expect(assistant()).toContain("elicit-landing");
    /* The old conversation is preserved, not wiped. */
    expect(Store.db.chat).toHaveLength(4);
    /* …and still shows up as exactly one row in Recents. */
    expect(recents()).toHaveLength(1);
  });
});

describe("Recents list", () => {
  it("stays one row while a conversation grows", async () => {
    await send("first question");
    await send("follow-up question");

    const rows = recents();
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("first question");
  });

  it("lists a second conversation as its own row after New", async () => {
    seedConversation();
    buildDom(assistant());

    clickNew();
    await send("brand new topic");

    const rows = recents();
    expect(rows).toHaveLength(2);

    /* The open view shows only the new conversation. */
    const html = assistant();
    expect(html).toContain("brand new topic");
    expect(html).not.toContain("first question");
  });

  it("resumes a conversation when its row is clicked, without re-sending", async () => {
    seedConversation();
    clickNew();
    await send("brand new topic");

    const before = Store.db.chat.length;
    const older = recents().find((r) =>
      r.textContent.includes("first question"),
    );
    expect(older).toBeTruthy();

    click(older);
    /* One tick: catches a handler that defers a re-send to a rAF/timer. */
    await new Promise((r) => setTimeout(r, 20));

    expect(Store.db.chat.length).toBe(before);
    const html = assistant();
    expect(html).toContain("first question");
    expect(html).not.toContain("brand new topic");
  });

  it("sends only the open conversation to the model", async () => {
    seedConversation();
    clickNew();
    await send("brand new topic");

    const body = requests[requests.length - 1];
    expect(body).toContain("brand new topic");
    expect(body).not.toContain("first question");
  });
});
