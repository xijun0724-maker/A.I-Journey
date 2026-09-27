// @vitest-environment happy-dom
/**
 * RAG owns its cache (domain/rag.js).
 *
 * The index is a cache over Store.db.chunks. These tests observe the seam a
 * caller sees: `RAG.observe()` and `RAG.search()`. No mutation path is told to
 * invalidate — the Store change event is the only trigger.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { RAG } from "../../src/domain/rag.js";

const THERMO =
  "Thermodynamics studies heat, work and entropy in closed systems. " +
  "The second law states that entropy in an isolated system never decreases. " +
  "Entropy is a measure of disorder in a thermodynamic system. ";

beforeEach(() => {
  Store.resetAll();
  RAG.invalidate();
  Store.db.documents = [
    { id: "doc1", courseId: "c1", name: "Thermo notes", text: THERMO.repeat(4) },
  ];
  RAG.reindexAll();
});

describe("RAG.observe", () => {
  it("is idempotent — repeated calls return the same unsubscribe", () => {
    expect(RAG.observe()).toBe(RAG.observe());
  });

  it("invalidates the cached index when a document is removed through the Store", () => {
    // Prime the cache so a stale index is the bug being pinned.
    expect(RAG.search("thermodynamics").length).toBeGreaterThan(0);

    Store.documents.remove("doc1");

    expect(Store.db.chunks).toHaveLength(0);
    expect(RAG.search("thermodynamics")).toEqual([]);
  });

  it("invalidates on an `all` change (a reset)", () => {
    expect(RAG.search("thermodynamics").length).toBeGreaterThan(0);

    Store.resetAll();

    expect(RAG.search("thermodynamics")).toEqual([]);
  });
});
