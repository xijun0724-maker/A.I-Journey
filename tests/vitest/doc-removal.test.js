// @vitest-environment happy-dom
/**
 * Removing a document must remove it from retrieval too.
 *
 * The Store drops the document's chunks, but the BM25 index is a cached
 * build: the merge that landed on 2026-09-27 dropped the invalidation along
 * with the incremental `RAG.updateIndex(id, "", true)` call it replaced, so a
 * deleted document kept scoring and its passages resolved to null text —
 * which made `RAG.context` throw and quietly return nothing.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { RAG } from "../../src/domain/rag.js";
import { deleteDocument } from "../../src/core/actions/courses.js";

const THERMO =
  "Thermodynamics studies heat, work and entropy in closed systems. " +
  "The second law states that entropy in an isolated system never decreases.";

beforeEach(() => {
  const root = document.createElement("div");
  root.id = "modalRoot";
  document.body.innerHTML = "";
  document.body.appendChild(root);
  const toasts = document.createElement("div");
  toasts.id = "toasts";
  document.body.appendChild(toasts);

  Store.resetAll();
  RAG.invalidate();
  Store.db.documents = [
    { id: "doc1", courseId: "c1", name: "Thermo notes", text: THERMO },
  ];
  RAG.reindexAll();
});

async function confirmDelete() {
  deleteDocument("doc1");
  const ok = document.querySelector("[data-ok]");
  expect(ok, "the confirmation dialog must render").toBeTruthy();
  ok.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("deleteDocument", () => {
  it("finds the document's passages while it exists", () => {
    expect(RAG.search("thermodynamics").length).toBeGreaterThan(0);
  });

  it("drops those passages from search once the document is gone", async () => {
    /* Prime the cached index first: this is the real sequence (the student
       searched, then deleted), and a stale `_idx` is the bug being pinned. */
    expect(RAG.search("thermodynamics").length).toBeGreaterThan(0);

    await confirmDelete();

    expect(Store.db.documents).toHaveLength(0);
    expect(Store.db.chunks).toHaveLength(0);
    expect(RAG.search("thermodynamics")).toEqual([]);
  });

  it("does not break retrieval for the documents that remain", async () => {
    Store.db.documents.push({
      id: "doc2",
      courseId: "c1",
      name: "Fluid notes",
      text: "Fluid mechanics covers pressure, flow and viscosity in pipes.",
    });
    RAG.reindexAll();
    expect(RAG.search("thermodynamics").length).toBeGreaterThan(0);

    await confirmDelete();

    const hits = RAG.search("fluid mechanics pressure");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].docId).toBe("doc2");
  });
});
