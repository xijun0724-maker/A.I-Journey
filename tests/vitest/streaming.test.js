// @vitest-environment happy-dom
/**
 * Step 6 of docs/audit-2026-09-25.md — stream the answer instead of
 * withholding it until the whole thing exists.
 *
 * These tests pin the request shape (`stream: true` against OpenRouter's
 * chat-completions endpoint), the frame reader (split lines, split chunks,
 * `[DONE]`), the one rule that protects the transcript from a half-shown
 * answer being retried into a spliced one, and the provisional bubble the
 * tokens paint.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { setApiKey, clearApiKey } from "../../src/utils/secure.js";
import { RAG } from "../../src/domain/rag.js";
import { chat } from "../../src/ai/client.js";
import { answer } from "../../src/ai/index.js";
import { showLive, hideLive } from "../../src/views/assistant.js";
import { CFG } from "../../src/config/constants.js";

function keyed() {
  Store.db.settings.aiEnabled = true;
  setApiKey("sk-or-" + "a".repeat(20));
}

/** A Response stand-in whose body is a readable stream of `chunks`. */
function sse(chunks, opts = {}) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: opts.ok !== false,
    status: opts.status || 200,
    body: {
      getReader() {
        return {
          read() {
            if (opts.failAt === i) {
              const err = new Error(opts.failMessage || "stream broke");
              if (opts.failStatus) err.status = opts.failStatus;
              if (opts.failName) err.name = opts.failName;
              return Promise.reject(err);
            }
            if (i >= chunks.length) {
              return Promise.resolve({ done: true, value: undefined });
            }
            return Promise.resolve({ done: false, value: enc.encode(chunks[i++]) });
          },
        };
      },
    },
    json: async () => Promise.reject(new Error("a stream is not JSON")),
  };
}

/** One OpenRouter frame carrying `text`. */
const openrouterFrame = (text) =>
  'data: {"choices":[{"delta":{"content":"' + text + '"}}]}\n\n';

let originalFetch = null;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  Store.resetAll();
  clearApiKey();
  RAG.invalidate();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("a request that asked to stream", () => {
  it("posts to OpenRouter's endpoint and reports each delta", async () => {
    keyed();
    let url = null;
    let body = null;
    globalThis.fetch = (u, init) => {
      url = u;
      body = JSON.parse(init.body);
      return Promise.resolve(
        sse([openrouterFrame("Hel"), openrouterFrame("lo"), "data: [DONE]\n\n"]),
      );
    };

    const seen = [];
    const r = await chat([{ role: "user", content: "hi" }], {
      onToken: (delta, total) => seen.push([delta, total]),
    });

    expect(url).toBe(CFG.openrouter.baseUrl);
    expect(body.stream).toBe(true);
    expect(seen).toEqual([
      ["Hel", "Hel"],
      ["lo", "Hello"],
    ]);
    expect(r.ok).toBe(true);
    expect(r.text).toBe("Hello");
    expect(r.streamed).toBe(true);
    expect(r.model).toBeTruthy();
  });

  it("reassembles a frame the transport split across chunks", async () => {
    keyed();
    globalThis.fetch = () =>
      Promise.resolve(
        sse([
          'data: {"choices":[{"delta":{"con',
          'tent":"Split frame"}}]}\n\ndata: {"choices":[{"delta":{"content":" too"}}]}\n\n',
        ]),
      );

    const seen = [];
    const r = await chat([{ role: "user", content: "hi" }], {
      onToken: (delta) => seen.push(delta),
    });

    expect(seen).toEqual(["Split frame", " too"]);
    expect(r.text).toBe("Split frame too");
  });

  it("sends the OpenRouter request shape: bearer auth and the chosen model", async () => {
    keyed();
    Store.db.settings.model = "deepseek/deepseek-v4-flash-0731:free";
    let init = null;
    globalThis.fetch = (_u, i) => {
      init = i;
      return Promise.resolve(sse([openrouterFrame("One."), "data: [DONE]\n\n"]));
    };

    const r = await chat([{ role: "user", content: "hi" }], {
      onToken: () => {},
    });

    const body = JSON.parse(init.body);
    expect(init.headers.Authorization).toContain("Bearer ");
    expect(init.headers["X-Title"]).toBe("Journey A.I");
    expect(body.model).toBe("deepseek/deepseek-v4-flash-0731:free");
    expect(body.stream).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.text).toBe("One.");
  });
});

describe("a request that did not", () => {
  it("keeps the one-shot request and the plain completion shape", async () => {
    keyed();
    let url = null;
    let sent = null;
    globalThis.fetch = (u, init) => {
      url = u;
      sent = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "All at once." } }],
        }),
      });
    };

    const r = await chat([{ role: "user", content: "hi" }]);

    expect(url).toBe(CFG.openrouter.baseUrl);
    expect(sent.stream).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.text).toBe("All at once.");
    expect(r.streamed).toBeUndefined();
  });

  it("falls back to JSON when there is no stream to read", async () => {
    keyed();
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "No body here." } }],
        }),
      });

    const r = await chat([{ role: "user", content: "hi" }], {
      onToken: () => {},
    });

    expect(r.ok).toBe(true);
    expect(r.text).toBe("No body here.");
  });
});

describe("the transcript cannot be spliced from two attempts", () => {
  it("does not retry once a delta has been shown", async () => {
    keyed();
    let calls = 0;
    globalThis.fetch = () => {
      calls++;
      return Promise.resolve(
        sse([openrouterFrame("Half an answer")], {
          failAt: 1,
          failStatus: 429,
          failMessage: "rate limited",
        }),
      );
    };

    const r = await chat([{ role: "user", content: "hi" }], {
      onToken: () => {},
      retries: 3,
      retryDelay: 1,
    });

    expect(calls).toBe(1);
    expect(r.ok).toBe(false);
    expect(r.retryable).toBe(true);
  });

  it("still retries a 429 when nothing was shown", async () => {
    keyed();
    let calls = 0;
    globalThis.fetch = () => {
      calls++;
      return Promise.resolve({
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ error: { message: "rate limited" } }),
      });
    };

    const r = await chat([{ role: "user", content: "hi" }], {
      retries: 1,
      retryDelay: 1,
    });

    expect(calls).toBe(2);
    expect(r.ok).toBe(false);
  });
});

describe("answer() hands its tokens to the caller", () => {
  it("streams the model's text through and still settles on the checked one", async () => {
    keyed();
    globalThis.fetch = () =>
      Promise.resolve(
        sse([
          openrouterFrame("Photosynthesis "),
          openrouterFrame("makes sugar."),
          "data: [DONE]\n\n",
        ]),
      );

    const seen = [];
    const res = await answer("how do plants feed themselves?", {
      onToken: (delta, total) => seen.push([delta, total]),
    });

    expect(seen.map((s) => s[0]).join("")).toBe("Photosynthesis makes sugar.");
    expect(seen[seen.length - 1][1]).toBe("Photosynthesis makes sugar.");
    expect(res.mode).toBe("ai");
    expect(res.text).toBe("Photosynthesis makes sugar.");
  });
});

describe("the provisional bubble", () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="chatLog"><div class="msg ai" id="typingIndicator"></div></div>';
  });

  afterEach(() => {
    hideLive();
    document.body.innerHTML = "";
  });

  it("replaces the typing dots on the first delta and keeps Stop", () => {
    showLive("Hello **world**");

    const el = document.getElementById("liveAnswer");
    expect(el).toBeTruthy();
    expect(el.querySelector(".msg-ai-body").innerHTML).toContain(
      "<strong>world</strong>",
    );
    expect(el.querySelector('[data-act="chat-stop"]')).toBeTruthy();
    expect(document.getElementById("typingIndicator")).toBeNull();
  });

  it("keeps painting as more tokens arrive", async () => {
    showLive("Hello");
    showLive("Hello there");
    /* Further paints inside the throttle window are batched. */
    await new Promise((r) => setTimeout(r, 130));

    expect(document.getElementById("liveAnswer").textContent).toContain(
      "Hello there",
    );
  });

  it("is dropped entirely once the answer settles", async () => {
    showLive("Hello");
    hideLive();
    /* A paint it still owed must not resurrect it. */
    await new Promise((r) => setTimeout(r, 130));

    expect(document.getElementById("liveAnswer")).toBeNull();
  });
});
