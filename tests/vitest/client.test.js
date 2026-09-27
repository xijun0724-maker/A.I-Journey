// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { setApiKey, clearApiKey } from "../../src/utils/secure.js";
import {
  parseJson,
  chat,
  status,
  usable,
  checkTokenBudget,
  messageChars,
} from "../../src/ai/client.js";
import { CFG } from "../../src/config/constants.js";

beforeEach(() => {
  Store.resetAll();
  clearApiKey();
});

describe("parseJson", () => {
  it("parses valid JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips markdown code fences", () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("finds JSON object in surrounding text", () => {
    expect(parseJson('Here is the result: {"a":1} done.')).toEqual({ a: 1 });
  });

  it("returns null for non-JSON", () => {
    expect(parseJson("hello world")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseJson("")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseJson(null)).toBeNull();
  });

  it("strips trailing commas", () => {
    expect(parseJson('{"a":1,}')).toEqual({ a: 1 });
  });
});

describe("status", () => {
  it("returns offline when AI disabled", () => {
    Store.db.settings.aiEnabled = false;
    const s = status();
    expect(s.on).toBe(false);
    expect(s.why).toContain("switched off");
  });

  it("returns offline when no API key", () => {
    Store.db.settings.aiEnabled = true;
    clearApiKey();
    const s = status();
    expect(s.on).toBe(false);
    expect(s.why).toContain("No API key");
  });

  it("returns offline when key too short (rejected at storage)", () => {
    Store.db.settings.aiEnabled = true;
    setApiKey("short");
    const s = status();
    expect(s.on).toBe(false);
    expect(s.why).toContain("No API key");
  });

  it("returns online when key is valid, naming the model and endpoint", () => {
    Store.db.settings.aiEnabled = true;
    setApiKey("a".repeat(20));
    const s = status();
    expect(s.on).toBe(true);
    expect(s.label).toContain("OpenRouter");
    expect(s.label).toContain(CFG.openrouter.model);
  });

  it("labels the status with the selected model", () => {
    Store.db.settings.aiEnabled = true;
    setApiKey("sk-or-" + "a".repeat(20));
    Store.db.settings.model = "deepseek/deepseek-v4-flash-0731:free";
    const s = status();
    expect(s.on).toBe(true);
    expect(s.label).toContain("deepseek/deepseek-v4-flash-0731:free");
  });
});

describe("usable", () => {
  it("returns false when AI disabled", () => {
    Store.db.settings.aiEnabled = false;
    expect(usable()).toBe(false);
  });

  it("returns false when no key", () => {
    Store.db.settings.aiEnabled = true;
    clearApiKey();
    expect(usable()).toBe(false);
  });

  it("returns true when enabled and key is long enough", () => {
    Store.db.settings.aiEnabled = true;
    setApiKey("a".repeat(20));
    expect(usable()).toBe(true);
  });
});

describe("chat", () => {
  it("returns error when AI disabled", async () => {
    Store.db.settings.aiEnabled = false;
    const r = await chat([{ role: "user", content: "hi" }]);
    expect(r.ok).toBe(false);
    expect(r.off).toBe(true);
  });

  it("returns error when no API key", async () => {
    Store.db.settings.aiEnabled = true;
    clearApiKey();
    const r = await chat([{ role: "user", content: "hi" }]);
    expect(r.ok).toBe(false);
    expect(r.off).toBe(true);
  });

  it("returns error when key too short", async () => {
    Store.db.settings.aiEnabled = true;
    setApiKey("short");
    const r = await chat([{ role: "user", content: "hi" }]);
    expect(r.ok).toBe(false);
    expect(r.off).toBe(true);
  });

  it("does not reach the network when the signal is already aborted", async () => {
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");
    const ctrl = new AbortController();
    ctrl.abort();
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = () => {
      called = true;
      return Promise.resolve({ ok: true, json: async () => ({}) });
    };
    try {
      const r = await chat([{ role: "user", content: "hi" }], {
        signal: ctrl.signal,
      });
      expect(called).toBe(false);
      expect(r.ok).toBe(false);
      expect(r.cancelled).toBe(true);
      expect(r.retryable).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("reports a cancel - not a retry or a timeout - when aborted mid-flight", async () => {
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");
    const ctrl = new AbortController();
    const original = globalThis.fetch;
    let attempts = 0;
    globalThis.fetch = (_url, init) => {
      attempts += 1;
      return new Promise((_resolve, reject) => {
        /* Abort once the request is genuinely in flight. */
        const onAbort = () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        };
        if (init.signal.aborted) return onAbort();
        init.signal.addEventListener("abort", onAbort);
        setTimeout(() => ctrl.abort(), 0);
      });
    };
    try {
      const r = await chat([{ role: "user", content: "hi" }], {
        signal: ctrl.signal,
        timeout: 30000,
      });
      expect(attempts).toBe(1);
      expect(r.ok).toBe(false);
      expect(r.cancelled).toBe(true);
      expect(r.error).toBe("Cancelled.");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("drops middle history turns to fit within token budget", () => {
    const system = { role: "system", content: "system prompt" };
    const middle1 = { role: "user", content: "m".repeat(100) };
    const middle2 = { role: "assistant", content: "a".repeat(100) };
    const tail = { role: "user", content: "latest" };
    const b = checkTokenBudget([system, middle1, middle2, tail], { maxChars: 150 });
    expect(b.truncated).toBe(true);
    expect(b.dropped).toBeGreaterThan(0);
    expect(messageChars(b.messages)).toBeLessThanOrEqual(150);
    expect(b.messages[0]).toEqual(system);
    expect(b.messages[b.messages.length - 1]).toEqual(tail);
  });

  it("early-refuses when system and user messages together exceed the character ceiling", async () => {
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");
    const bigSystem = { role: "system", content: "s".repeat(15000) };
    const bigUser = { role: "user", content: "u".repeat(10000) };
    const r = await chat([bigSystem, bigUser], { maxChars: 20000 });
    expect(r.ok).toBe(false);
    expect(r.off).toBe(true);
    expect(r.error).toContain("That question is too long for one request");
  });

  it("early-refuses when a single message exceeds the character ceiling", async () => {
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");
    const huge = "a".repeat(25000);
    const r = await chat([{ role: "user", content: huge }]);
    expect(r.ok).toBe(false);
    expect(r.off).toBe(true);
    expect(r.error).toContain("That question is too long for one request");
  });

  it("bounds retries by deadline and aborts once deadline expires", async () => {
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = () => {
      calls += 1;
      const err = new Error("timeout");
      err.name = "AbortError";
      return Promise.reject(err);
    };
    try {
      const start = Date.now();
      const r = await chat([{ role: "user", content: "hi" }], {
        timeout: 60,
        deadline: Date.now() + 60,
        retries: 3,
        retryDelay: 1,
      });
      expect(calls).toBe(1);
      expect(r.ok).toBe(false);
      expect(Date.now() - start).toBeLessThan(1000);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("reports expired key in status() when TTL has lapsed", () => {
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");
    const raw = JSON.parse(sessionStorage.getItem("journeyai.secure.v2"));
    raw.keys.openrouter.lastUsed = Date.now() - 35 * 24 * 60 * 60 * 1000;
    sessionStorage.setItem("journeyai.secure.v2", JSON.stringify(raw));

    const s = status();
    expect(s.on).toBe(false);
    expect(s.why).toContain("expired after 30 days");
  });
});
