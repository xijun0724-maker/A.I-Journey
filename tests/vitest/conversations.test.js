// @vitest-environment happy-dom
/**
 * Conversation semantics for the assistant (Gemini-style):
 *
 *  1. "New" returns to the landing page; the previous conversation is kept.
 *  2. Recents lists one row per conversation, not one row per prompt.
 *  3. "New" starts a *second* conversation; both stay listed.
 *  4. Clicking a Recents row resumes that conversation instead of re-sending.
 *  5. The model only sees the conversation that is open.
 *  6. The message cap is a per-conversation budget: a long chat evicts its
 *     own oldest messages and nobody else's.
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
import { CFG } from "../../src/config/constants.js";
import { UIState } from "../../src/core/scope.js";
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
  setApiKey("test-key-0123456789abcdef");

  globalThis.fetch = (_url, init) => {
    requests.push(String((init && init.body) || ""));
    return Promise.resolve({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Here you go." } }],
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

/* The cap was `list.slice(-max)` over the flat log, so the budget was spent by
   whichever conversation was being written to: a long-lived chat silently
   deleted older conversations, including the Recents row that named them. */
describe("the message cap", () => {
  const MAX = CFG.maxChatMessages || 100;

  function fill(cid, prefix, n, start) {
    for (let i = 0; i < n; i++) {
      Store.chat.appendTo(cid, {
        id: prefix + i,
        role: "assistant",
        content: prefix + i,
        ts: (start || 0) + i,
      });
    }
  }

  it("evicts the growing conversation's own oldest messages, not another's", () => {
    /* An older conversation, already at the cap. */
    const older = Store.chat.append({
      id: "o0",
      role: "user",
      content: "older opener",
      ts: 1,
    });
    fill(older, "old ", MAX - 1, 2);
    expect(Store.chat.all().length).toBe(MAX);

    /* A newer conversation that then grows past the cap. */
    Store.chat.newConversation();
    const newer = Store.chat.append({
      id: "n0",
      role: "user",
      content: "newer opener",
      ts: 10000,
    });
    fill(newer, "new ", MAX, 10001);

    const contents = Store.chat.all().map((m) => m.content);
    /* The older conversation is untouched — every message still there. */
    expect(contents).toContain("older opener");
    expect(contents.filter((c) => c.startsWith("old "))).toHaveLength(MAX - 1);
    /* …and it is still a named row in Recents. */
    const rows = Store.chat.conversations();
    const kept = rows.find((c) => c.cid === older);
    expect(kept).toBeTruthy();
    expect(kept.title).toBe("older opener");

    /* The conversation that grew pays for its own growth: it holds MAX
       messages again, and the message it dropped is its own first one. */
    expect(contents.filter((c) => c.startsWith("new "))).toHaveLength(MAX);
    expect(contents).not.toContain("newer opener");
  });

  it("keeps the flat log in order after a trim", () => {
    const cid = Store.chat.append({ id: "a", role: "user", content: "one", ts: 1 });
    fill(cid, "m", MAX + 1, 2);

    const log = Store.chat.all();
    expect(log).toHaveLength(MAX);
    /* The opener and the first fill message are gone; order is otherwise
       exactly as written. */
    expect(log[0].content).toBe("m1");
    expect(log[log.length - 1].content).toBe("m" + MAX);
  });
});
