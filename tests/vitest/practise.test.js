// @vitest-environment happy-dom
/**
 * Retrieval practice used to be reachable only after a chat answer, so the
 * learner who never asked the tutor a question never practised at all.
 *
 * These cases pin the second entrance: a Library document or a Planner
 * review block opens the same drill, with no question and no model call,
 * and its verdicts land in the same log the guidance level fades on.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { RAG } from "../../src/domain/rag.js";
import { Coach } from "../../src/domain/coach.js";
import {
  assistant,
  practiseDocument,
  practiseCourse,
  markRecallResult,
} from "../../src/views/assistant.js";

const THERMO =
  "Thermodynamics studies heat, work and entropy in closed systems. " +
  "The second law states that entropy in an isolated system never decreases over time. " +
  "Engines convert thermal energy into mechanical work, and no engine is perfectly efficient, " +
  "so thermodynamics limits what any real machine can do.";

beforeEach(() => {
  Store.resetAll();
  RAG.invalidate();
  document.body.innerHTML = '<div id="toasts"></div>';
  Store.db.documents = [
    { id: "doc1", courseId: "c1", name: "Thermo notes", text: THERMO },
    { id: "doc2", courseId: "c2", name: "Empty stub", text: "" },
  ];
  RAG.reindexAll();
});

describe("practiseDocument", () => {
  it("opens a drill for a document without a chat question", () => {
    expect(Store.db.chat).toHaveLength(0);

    expect(practiseDocument("doc1")).toBe(true);
    expect(Store.db.chat).toHaveLength(1);

    const drill = Store.db.chat[0];
    expect(drill.kind).toBe("recall");
    expect(drill.role).toBe("assistant");
    expect(drill.questions.length).toBeGreaterThan(0);
    expect(drill.title).toContain("Thermo notes");
  });

  it("renders as a normal message, so it survives navigation and re-render", () => {
    practiseDocument("doc1");
    const html = assistant();

    expect(html).toContain("recall-widget");
    expect(html).toContain('data-recall-card="recall-doc1-0"');
    expect(html).toContain("Thermo notes");
    /* Still closed: the answer is revealed on demand, not printed beside it. */
    expect(html).not.toContain("<details open");
  });

  it("namespaces card ids per document so two drills can coexist", () => {
    practiseDocument("doc1");
    Store.db.documents.push({
      id: "docB",
      courseId: "c1",
      name: "Notes B",
      text: THERMO.replace("Thermodynamics", "Fluid mechanics"),
    });
    RAG.reindexAll();
    practiseDocument("docB");

    const html = assistant();
    expect(html).toContain('data-recall-card="recall-doc1-0"');
    expect(html).toContain('data-recall-card="recall-docb-0"');
  });

  it("feeds a verdict into the same stats the guidance level reads", () => {
    practiseDocument("doc1");
    document.body.innerHTML = '<div id="toasts"></div>' + assistant();

    markRecallResult("recall-doc1-0", "got");
    expect(Coach.recallStats()).toMatchObject({ attempts: 1, hits: 1 });
  });

  it("refuses a document that is no longer in the library", () => {
    expect(practiseDocument("missing")).toBe(false);
    expect(Store.db.chat).toHaveLength(0);
    expect(document.getElementById("toasts").textContent).toMatch(
      /no longer in your library/i,
    );
  });

  it("refuses a document with no indexed passages instead of an empty drill", () => {
    expect(practiseDocument("doc2")).toBe(false);
    expect(Store.db.chat).toHaveLength(0);
  });
});

describe("practiseCourse", () => {
  it("drills the first document of that course that can support one", () => {
    expect(practiseCourse("c1")).toBe(true);
    expect(Store.db.chat[0].title).toContain("Thermo notes");
  });

  it("says so when the course has nothing indexed", () => {
    expect(practiseCourse("c2")).toBe(false);
    expect(Store.db.chat).toHaveLength(0);
    expect(document.getElementById("toasts").textContent).toMatch(
      /indexed passages/i,
    );
  });
});
