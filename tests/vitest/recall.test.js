// @vitest-environment happy-dom
/**
 * Retrieval practice only works if the learner has to produce the answer.
 * The drill used to ask `What does the text say about "<first 60 chars of the
 * answer>"?` inside an already-open <details>, which is item matching with the
 * answer printed next to it.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { RAG } from "../../src/domain/rag.js";
import { generateRecallQuestions } from "../../src/ai/offline.js";
import { markRecallResult } from "../../src/views/assistant.js";
import { Coach } from "../../src/domain/coach.js";

const THERMO =
  "Thermodynamics studies heat, work and entropy in closed systems. " +
  "The second law states that entropy in an isolated system never decreases over time. " +
  "Engines convert thermal energy into mechanical work, and no engine is perfectly efficient, " +
  "so thermodynamics limits what any real machine can do.";

function ctxOf(chunks) {
  return { chunks: chunks, sources: [], contextText: "", terms: [] };
}

function thermoCtx() {
  return ctxOf([{ docName: "Thermo notes", idx: 4, text: THERMO }]);
}

beforeEach(() => {
  Store.resetAll();
  RAG.invalidate();
});

describe("generateRecallQuestions", () => {
  it("never puts the answer, or its opening words, in the question", () => {
    const questions = generateRecallQuestions(thermoCtx(), 3);

    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q.question).not.toContain(q.answer);
      expect(q.question).not.toContain(q.answer.slice(0, 60));
      expect(q.question).not.toContain(q.answer.slice(0, 30));
    }
    /* And not the old truncation-with-ellipsis either. */
    for (const q of questions) {
      expect(q.question).not.toMatch(/What does the text say about/);
    }
  });

  it("asks for production from memory and names where to check", () => {
    const [first] = generateRecallQuestions(thermoCtx(), 1);

    expect(first.question).toMatch(/Without looking/);
    expect(first.question).toContain("Thermo notes");
    /* The anchor is a term from the sentence, not the sentence itself. */
    const anchor = (first.question.match(/\u201c(.+?)\u201d/) || [])[1] || "";
    expect(anchor.length).toBeGreaterThan(3);
    expect(first.answer.toLowerCase()).toContain(anchor.toLowerCase());
  });

  it("anchors on the term the passage keeps returning to", () => {
    const questions = generateRecallQuestions(thermoCtx(), 3);
    const entropyQuestion = questions.find(
      (q) => q.answer.indexOf("isolated") !== -1,
    );

    expect(entropyQuestion).toBeTruthy();
    expect(entropyQuestion.question).toContain("entropy");
    /* Not the incidental words: these are in one sentence only. */
    expect(entropyQuestion.question).not.toContain("decreases");
    expect(entropyQuestion.question).not.toContain("isolated");
  });

  it("falls back to a generic prompt when no term is worth using", () => {
    const questions = generateRecallQuestions(
      ctxOf([
        {
          docName: "Notes",
          idx: 0,
          text: "It is up to us to do so, and it is up to you to do it too.",
        },
      ]),
      1,
    );

    expect(questions.length).toBe(1);
    expect(questions[0].question).toMatch(/Without looking/);
    expect(questions[0].question).not.toContain(
      questions[0].answer.slice(0, 30),
    );
  });

  it("labels the source with the document and passage", () => {
    const [first] = generateRecallQuestions(thermoCtx(), 1);
    expect(first.source).toBe("Thermo notes — passage 5");
  });

  it("covers every passage first, then caps and never overruns", () => {
    const ctx = ctxOf([
      { docName: "A", idx: 0, text: THERMO },
      { docName: "B", idx: 1, text: THERMO },
      { docName: "C", idx: 2, text: THERMO },
    ]);

    /* One per passage before any passage gets a second question. */
    const three = generateRecallQuestions(ctx, 3);
    expect(three).toHaveLength(3);
    expect(three.map((q) => q.source.split(" — ")[0])).toEqual(["A", "B", "C"]);

    expect(generateRecallQuestions(ctx, 2)).toHaveLength(2);
    /* Asking for more back-fills extra sentences from the same passages. */
    expect(generateRecallQuestions(ctx, 9).length).toBe(9);
    expect(generateRecallQuestions(ctx, 2).length).toBeLessThanOrEqual(2);
    expect(generateRecallQuestions(ctxOf([]), 3)).toEqual([]);
  });

  it("is deterministic and varies its prompt shape across questions", () => {
    const ctx = ctxOf([
      { docName: "A", idx: 0, text: THERMO },
      { docName: "B", idx: 1, text: THERMO },
      { docName: "C", idx: 2, text: THERMO },
    ]);

    const once = generateRecallQuestions(ctx, 3).map((q) => q.question);
    const twice = generateRecallQuestions(ctx, 3).map((q) => q.question);

    expect(twice).toEqual(once);
    expect(new Set(once).size).toBeGreaterThan(1);
  });
});

/** The widget as the student actually receives it, after a real chat turn. */
describe("recall widget in the chat", () => {
  let originalFetch;

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

  beforeEach(async () => {
    document.body.innerHTML =
      '<div id="toasts"></div>' +
      '<div class="chat-log" id="chatLog"></div>' +
      '<textarea id="chatInput"></textarea>';
    Store.db.documents = [
      { id: "d1", courseId: "c1", name: "Thermo notes", text: THERMO },
    ];
    RAG.reindexAll();

    const { setApiKey } = await import("../../src/utils/secure.js");
    Store.db.settings.aiEnabled = true;
    Store.db.settings.provider = "gemini";
    setApiKey("test-key-0123456789abcdef", "gemini");

    originalFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  { text: "Entropy never decreases in an isolated system." },
                ],
              },
            },
          ],
        }),
      });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("asks a question whose answer is not on screen", async () => {
    const { sendChat } = await import("../../src/views/assistant.js");

    sendChat("what does thermodynamics say about entropy?");
    await waitFor(() => document.getElementById("planProposalCard") === null);
    await waitFor(() => document.querySelectorAll(".recall-card").length > 0);

    const card = document.querySelector(".recall-card");
    expect(card).toBeTruthy();

    /* Revealed on demand: the answer is not already showing. */
    expect(card.hasAttribute("open")).toBe(false);

    const question = card.querySelector("summary").textContent;
    const answer = card.querySelector(".recall-a").textContent;
    expect(question).toMatch(/Without looking/);
    expect(question).not.toContain(answer.slice(0, 30));
    expect(answer).toContain("Thermodynamics");

    /* And it can be self-marked where the student reads it. */
    expect(
      card.querySelector('[data-act="recall-mark"][data-arg="got"]'),
    ).toBeTruthy();
    expect(document.querySelector(".recall-hint").textContent).toMatch(
      /from memory/i,
    );
  });
});

describe("recall self-mark", () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="toasts"></div>' +
      '<details class="recall-card" data-recall-card="recall-0">' +
      '<summary>q</summary><div class="recall-a">a' +
      '<div class="recall-mark">Was that right?</div></div></details>';
  });

  it("records a recalled item as one completed practice, not invented minutes", () => {
    expect(markRecallResult("recall-0", "got")).toBe(true);

    const today = Store.db.activity[Store.db.activity.length - 1];
    expect(today.completed).toBe(1);
    expect(today.minutes).toBe(0);
    /* The verdict is the signal the guidance level fades on. */
    expect(today.recall).toEqual({ hits: 1, misses: 0 });
    expect(
      document
        .querySelector('[data-recall-card="recall-0"]')
        .classList.contains("recalled"),
    ).toBe(true);
  });

  it("logs a miss as an attempt, but still invents no minutes", () => {
    markRecallResult("recall-0", "miss");

    const card = document.querySelector('[data-recall-card="recall-0"]');
    expect(card.classList.contains("missed")).toBe(true);
    const today = Store.db.activity[Store.db.activity.length - 1];
    expect(today.minutes).toBe(0);
    expect(today.completed).toBe(0);
    expect(today.recall).toEqual({ hits: 0, misses: 1 });
    expect(Coach.recallStats()).toMatchObject({ attempts: 1, misses: 1 });
    expect(document.getElementById("toasts").textContent).toMatch(
      /from memory/i,
    );
  });

  it("ignores a missing or unusable id instead of throwing", () => {
    expect(() => markRecallResult("", "got")).not.toThrow();
    expect(() => markRecallResult(null, "got")).not.toThrow();
    expect(() => markRecallResult(undefined, "miss")).not.toThrow();
    expect(markRecallResult("", "got")).toBe(false);
    expect(Store.db.activity).toHaveLength(0);
  });

  it("passes real activity through Coach, so the log stays one shape", () => {
    const spy = { minutes: 0, completed: 0 };
    const original = Coach.logActivity;
    Coach.logActivity = function (minutes, completed) {
      spy.minutes += minutes;
      spy.completed += completed;
    };
    try {
      markRecallResult("recall-0", "got");
      expect(spy.completed).toBe(1);
    } finally {
      Coach.logActivity = original;
    }
  });
});
