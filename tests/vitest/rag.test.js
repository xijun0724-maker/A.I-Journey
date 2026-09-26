import { describe, it, expect } from "vitest";
import { RAG } from "../../src/domain/rag.js";
import { Store } from "../../src/core/store.js";
import { CFG } from "../../src/config/constants.js";

describe("RAG.stem", () => {
  it("returns short words unchanged (≤4 chars)", () => {
    expect(RAG.stem("cat")).toBe("cat");
    expect(RAG.stem("is")).toBe("is");
    expect(RAG.stem("story")).toBe("story");
  });

  it("stems -ies to -y for longer words", () => {
    expect(RAG.stem("histories")).toBe("history");
  });

  it("stems -sses then strips trailing s", () => {
    expect(RAG.stem("addresses")).toBe("addre");
  });

  it("stems -ing for longer words", () => {
    expect(RAG.stem("running")).toBe("runn");
    expect(RAG.stem("making")).toBe("mak");
  });

  it("stems -ed for longer words", () => {
    expect(RAG.stem("walked")).toBe("walk");
    expect(RAG.stem("jumped")).toBe("jump");
  });

  it("stems -s for longer words", () => {
    expect(RAG.stem("computers")).toBe("computer");
    expect(RAG.stem("houses")).toBe("house");
  });
});

describe("RAG.tokenize", () => {
  it("tokenizes and lowercases", () => {
    const tokens = RAG.tokenize("Hello World");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
  });

  it("removes stopwords", () => {
    const tokens = RAG.tokenize("the quick brown fox");
    expect(tokens).not.toContain("the");
  });

  it("removes single character tokens", () => {
    const tokens = RAG.tokenize("a b c test");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("b");
  });

  it("removes pure numbers", () => {
    const tokens = RAG.tokenize("test 12345 word");
    expect(tokens).not.toContain("12345");
  });

  it("keeps a short number that qualifies a word", () => {
    expect(RAG.tokenize("Week 3")).toContain("3");
    expect(RAG.tokenize("Chapter 12 reading")).toContain("12");
  });

  it("drops bare numbers, number lists and long digit runs", () => {
    expect(RAG.tokenize("2024")).toEqual([]);
    expect(RAG.tokenize("12 34 56")).toEqual([]);
    expect(RAG.tokenize("see 123456")).not.toContain("123456");
    /* A number after a number is a list marker, not a reference. */
    expect(RAG.tokenize("chapter 12 99")).not.toContain("99");
  });

  it("does not treat a stop-word as the word a number qualifies", () => {
    expect(RAG.tokenize("the 3")).not.toContain("3");
  });

  it("returns empty array for empty input", () => {
    expect(RAG.tokenize("")).toEqual([]);
    expect(RAG.tokenize(null)).toEqual([]);
  });
});

describe("RAG.view", () => {
  it("normalizes whitespace", () => {
    const result = RAG.view("hello   world");
    expect(result.text).toBe("hello world");
  });

  it("removes carriage returns", () => {
    const result = RAG.view("hello\r\nworld");
    expect(result.text).toBe("hello\nworld");
  });

  it("builds character map", () => {
    const result = RAG.view("abc");
    expect(result.map).toEqual([0, 1, 2]);
  });
});

describe("RAG.chunkText", () => {
  it("returns array of text chunks for long text", () => {
    const text =
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph with enough content to exceed the minimum chunk size threshold.";
    const chunks = RAG.chunkText(text);
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("returns empty array for empty text", () => {
    expect(RAG.chunkText("")).toEqual([]);
    expect(RAG.chunkText(null)).toEqual([]);
  });

  it("returns empty for very short text (below 30 chars)", () => {
    const chunks = RAG.chunkText("Short.");
    expect(chunks.length).toBe(0);
  });
});

describe("RAG.context", () => {
  it("returns empty context when no documents indexed", () => {
    Store.resetAll();
    const ctx = RAG.context("machine learning");
    expect(ctx.chunks).toEqual([]);
    expect(ctx.sources).toEqual([]);
    expect(ctx.contextText).toBe("");
  });

  it("returns matching chunks for relevant query", () => {
    Store.resetAll();
    Store.db.documents = [
      {
        id: "doc1",
        courseId: "c1",
        name: "CS101 Notes",
        text: "Machine learning is a subset of artificial intelligence. Neural networks are used for deep learning. Supervised learning requires labeled training data.",
      },
    ];
    RAG.reindexAll();
    const ctx = RAG.context("neural networks");
    expect(ctx.chunks.length).toBeGreaterThan(0);
    expect(ctx.sources.length).toBeGreaterThan(0);
    expect(ctx.contextText).toContain("CS101 Notes");
  });

  it("respects courseId filter", () => {
    Store.resetAll();
    Store.db.documents = [
      {
        id: "doc1",
        courseId: "c1",
        name: "CS Notes",
        text: "Computer science fundamentals. Algorithms and data structures are essential.",
      },
      {
        id: "doc2",
        courseId: "c2",
        name: "Math Notes",
        text: "Linear algebra matrices and vectors. Eigenvalues and eigenvectors.",
      },
    ];
    RAG.reindexAll();
    const ctx = RAG.context("algorithms", { courseId: "c1" });
    expect(ctx.chunks.every((c) => c.courseId === "c1")).toBe(true);
  });

  it("falls back to selected source passages for broad questions", () => {
    Store.resetAll();
    Store.db.documents = [
      {
        id: "pdf1",
        courseId: "c1",
        name: "Lecture PDF",
        text: "This lecture introduces graph traversal, adjacency lists, breadth first search, and depth first search with worked examples and complexity notes.",
      },
    ];
    RAG.reindexAll();
    const ctx = RAG.context("what is in this pdf", { docIds: ["pdf1"] });
    expect(ctx.chunks.length).toBeGreaterThan(0);
    expect(ctx.contextText).toContain("graph traversal");
  });

  it("rebuilds a missing index before reading a selected source", () => {
    Store.resetAll();
    Store.db.documents = [
      {
        id: "pdf2",
        courseId: "c1",
        name: "Imported PDF",
        text: "This document contains the course overview, assessment rules, and the weekly topics for the semester.",
      },
    ];
    Store.db.chunks = [];
    RAG.invalidate();
    const ctx = RAG.context("what is in this file", { docIds: ["pdf2"] });
    expect(ctx.sources.length).toBeGreaterThan(0);
    expect(ctx.sources[0].docId).toBe("pdf2");
  });

  it("returns terms array", () => {
    Store.resetAll();
    const ctx = RAG.context("machine learning");
    expect(Array.isArray(ctx.terms)).toBe(true);
    expect(ctx.terms.length).toBeGreaterThan(0);
  });

  it("keeps retrieved passages inside their own budget, not the chat budget", () => {
    Store.resetAll();
    Store.db.documents = [
      {
        id: "big",
        courseId: "c1",
        name: "Big notes",
        text: "entropy and heat engines. ".repeat(600),
      },
    ];
    RAG.reindexAll();
    const ctx = RAG.context("entropy");
    const chars = ctx.chunks.reduce((n, c) => n + c.text.length, 0);
    expect(ctx.chunks.length).toBeGreaterThan(0);
    expect(chars).toBeLessThanOrEqual(CFG.maxContextChars);
    expect(CFG.maxContextChars).toBeLessThan(CFG.maxChatChars);
  });
});

/**
 * An unmatched query used to return the first k chunks in document order with
 * `score: 0`, which `RAG.context` then numbered `[1]…[k]` as if they were
 * sources - a retrieval miss wearing citations.
 */
describe("RAG.search honesty", () => {
  function seed() {
    Store.resetAll();
    Store.db.documents = [
      {
        id: "d1",
        courseId: "c1",
        name: "Physics",
        text: "Thermodynamics covers heat, entropy and the second law in closed systems, with worked examples and problem sets.",
      },
      {
        id: "d2",
        courseId: "c2",
        name: "Poetry",
        text: "The sonnet form uses fourteen lines of iambic pentameter and a volta near the end of the poem.",
      },
    ];
    RAG.reindexAll();
  }

  it("returns nothing when no term matches, instead of arbitrary chunks", () => {
    seed();
    expect(RAG.search("quantum chromodynamics")).toEqual([]);

    const ctx = RAG.context("quantum chromodynamics");
    expect(ctx.sources).toEqual([]);
    expect(ctx.contextText).toBe("");
  });

  it("returns nothing for a query made only of stop-words", () => {
    seed();
    expect(RAG.search("what is the of and")).toEqual([]);
  });

  it("does not fall back to document order for an unscoped miss", () => {
    seed();
    expect(RAG.search("what is in this pdf")).toEqual([]);
  });

  it("still reads a document the student explicitly selected", () => {
    seed();
    const hits = RAG.search("what is in this pdf", { docIds: ["d1"] });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].docId).toBe("d1");
    /* Labelled honestly: not a match, a deliberate read of a chosen file. */
    expect(hits[0].score).toBe(0);
  });

  it("drops a hit an order of magnitude weaker than the best match", () => {
    Store.resetAll();
    const docs = [];
    for (let i = 0; i < 20; i++) {
      docs.push({
        id: "common" + i,
        courseId: "c1",
        name: "Weekly plan " + i,
        text:
          "Week plan for topic " +
          i +
          ". This week covers review sessions, practice questions and a short reflection on the week's reading list.",
      });
    }
    docs.push({
      id: "rare",
      courseId: "c1",
      name: "Zygote paper",
      text: "Zygote zygote zygote. The zygote divides rapidly in the first hours after fertilisation.",
    });
    Store.db.documents = docs;
    RAG.reindexAll();

    const hits = RAG.search("zygote week");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].docId).toBe("rare");
    /* "week" is in almost every chunk, so it carries almost no information. */
    expect(hits.every((h) => h.docId === "rare")).toBe(true);

    /* The floor is a floor, not a hard filter. */
    const loose = RAG.search("zygote week", { minRelative: 0 });
    expect(loose.some((h) => h.docId.indexOf("common") === 0)).toBe(true);
  });
});

/**
 * Two P1-5 remainders from the 2026-09-23 audit:
 * - CFG.chunkOverlap only engaged when a paragraph exceeded 1.7×chunkSize, so
 *   the documented overlap never happened for ordinary (paragraph-boundary)
 *   chunks — a sentence cut at a boundary was retrievable from one chunk only.
 * - RAG.index stored a full copy of every chunk's text in `idx.byId`, roughly
 *   doubling the library's memory footprint.
 */
describe("chunk overlap at paragraph boundaries", () => {
  function para(prefix, i) {
    return (
      prefix +
      " Paragraph number " +
      i +
      " carries its own complete thought with several sentences of body text so the chunker treats it as a substantial run of content worth keeping whole. It continues with a second sentence that mentions entropy and isolated systems, and a third that closes the argument neatly. A fourth sentence stretches the paragraph out with further technical vocabulary, naming reversible processes, heat engines and the cycling of energy between reservoirs. A fifth sentence keeps going in the same measured register, adding enough bulk that the paragraph stands comfortably on its own when the document is divided into overlapping chunks for retrieval. The sixth and final sentence adds still more bulk so that pairing this paragraph with a short neighbour would exceed the chunk size and split them apart."
    );
  }

  function seedParagraphs(paras) {
    Store.resetAll();
    Store.db.documents = [
      { id: "ov", courseId: "c1", name: "Notes", text: paras.join("\n\n") },
    ];
    RAG.reindexAll();
    return RAG.chunkText(Store.db.documents[0].text);
  }

  it("resumes the next chunk inside the previous one, so boundary sentences are shared", () => {
    const chunks = seedParagraphs([
      para("First.", 1),
      para("Second.", 2),
      para("Third.", 3),
    ]);
    expect(chunks.length).toBe(3);

    const tail = chunks[0].slice(-CFG.chunkOverlap).replace(/^\s+/, "");
    expect(tail.length).toBeGreaterThan(50);
    /* The second chunk opens with the window it carried back… */
    expect(chunks[1].startsWith(tail)).toBe(true);
    /* …and the third does the same to the second. */
    const tail2 = chunks[1].slice(-CFG.chunkOverlap).replace(/^\s+/, "");
    expect(chunks[2].startsWith(tail2)).toBe(true);
  });

  it("does not carry into a neighbour too short to pay for the window", () => {
    const mid =
      "Mid. A short closing paragraph with enough content to pass the thirty character floor and survive as a chunk of its own, but not enough to justify an overlap window.";
    const chunks = seedParagraphs([para("First.", 1), mid]);
    /* The short paragraph is its own run (pairing it with the long one
       exceeds chunkSize) but is far smaller than 3× the overlap, so it
       must not grow by a 150-character copy of its neighbour. */
    expect(chunks.length).toBe(2);
    expect(chunks[1].startsWith("Mid.")).toBe(true);
    expect(chunks[1].length).toBeLessThan(CFG.chunkOverlap * 3);
  });

  it("keeps over-ceiling sweeps inside the first chunk's tail as before", () => {
    Store.resetAll();
    const big =
      Array.from({ length: 12 }, (_, i) =>
        "Sentence " +
        i +
        " elaborates the thermodynamic argument with just enough words to fill the space between sentence boundaries in this very long single paragraph run."
      ).join(" ") + " Tail close.";
    Store.db.documents = [{ id: "big", courseId: "c1", name: "Big", text: big }];
    RAG.reindexAll();
    const chunks = RAG.chunkText(big);
    expect(chunks.length).toBeGreaterThan(1);
    /* Consecutive sweep pieces still overlap. */
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1].slice(-40);
      expect(chunks[i].includes(prevTail.trim()) || chunks[i - 1].includes(chunks[i].slice(0, 40).trim())).toBe(true);
    }
  });
});

describe("index entries do not duplicate document text", () => {
  function seed() {
    Store.resetAll();
    Store.db.documents = [
      {
        id: "d1",
        courseId: "c1",
        name: "Physics",
        text:
          "Thermodynamics covers heat, entropy and the second law in closed systems, with worked examples and problem sets for every week of the term.",
      },
    ];
    RAG.reindexAll();
  }

  it("resolves .text lazily from the document store instead of storing a copy", () => {
    seed();
    const idx = RAG.index();
    const id = Object.keys(idx.byId)[0];
    expect(id).toBeTruthy();
    const entry = idx.byId[id];

    /* Reads still work… */
    expect(typeof entry.text).toBe("string");
    expect(entry.text.length).toBeGreaterThan(0);
    expect(Store.db.documents[0].text.includes(entry.text)).toBe(true);

    /* …but as a getter, not a materialised string on the entry. */
    const desc = Object.getOwnPropertyDescriptor(entry, "text");
    expect(typeof desc.get).toBe("function");
    expect(desc.value).toBeUndefined();
  });

  it("text still flows through search results and context after the change", () => {
    seed();
    const hits = RAG.search("entropy closed systems");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text.length).toBeGreaterThan(0);

    const ctx = RAG.context("entropy closed systems");
    expect(ctx.contextText).toContain("entropy");
    expect(ctx.sources[0].snippet.length).toBeGreaterThan(0);
    /* Search results are materialised copies — plain values, readable freely. */
    expect(typeof Object.getOwnPropertyDescriptor(hits[0], "text").value).toBe("string");
  });

  it("index entries always carry the metadata the prompt renders", () => {
    seed();
    for (const entry of Object.values(RAG.index().byId)) {
      expect(entry.docName).toBeTruthy();
      expect(typeof entry.idx).toBe("number");
    }
  });
});

describe("synonym expansion (multi-query recall)", () => {
  function seed() {
    Store.resetAll();
    Store.db.documents = [
      {
        id: "syl",
        courseId: "c1",
        name: "Syllabus",
        text:
          "The midterm evaluation is worth 30 percent. Continuous assessment happens every session of the term.",
      },
    ];
    RAG.reindexAll();
  }

  it("finds a passage that only uses a synonym of the queried word", () => {
    seed();
    const hits = RAG.search("exam");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].docId).toBe("syl");
  });

  it("ranks a direct term match above a synonym-only match", () => {
    Store.resetAll();
    Store.db.documents = [
      {
        id: "direct",
        courseId: "c1",
        name: "Exam guide",
        text: "This exam covers chapters one to three of the textbook material.",
      },
      {
        id: "syn",
        courseId: "c1",
        name: "Policy",
        text: "The evaluation is worth thirty percent of the final grade for the term.",
      },
    ];
    RAG.reindexAll();
    const hits = RAG.search("exam");
    expect(hits.length).toBeGreaterThan(1);
    expect(hits[0].docId).toBe("direct");
  });

  it("does not invent results when neither the term nor its synonyms match", () => {
    seed();
    expect(RAG.search("quantum chromodynamics")).toEqual([]);
  });
});

describe("near-duplicate suppression (precision)", () => {
  it("drops a chunk that is mostly contained in a higher-scoring one", () => {
    Store.resetAll();
    /* Two indexed ranges of the same document that overlap almost entirely,
       as a sweep remainder would after an over-ceiling split. */
    const text =
      "Thermodynamics covers heat, entropy and the second law in closed systems with worked examples for every week of the term.";
    Store.db.documents = [{ id: "d1", courseId: "c1", name: "Physics", text }];
    Store.db.chunks = [
      { id: "d1#0", docId: "d1", courseId: "c1", docName: "Physics", idx: 0, start: 0, len: text.length },
      { id: "d1#1", docId: "d1", courseId: "c1", docName: "Physics", idx: 1, start: 10, len: text.length - 10 },
    ];
    RAG.invalidate();
    const hits = RAG.search("thermodynamics entropy");
    expect(hits.length).toBe(1);
    expect(["d1#0", "d1#1"]).toContain(hits[0].id);
  });

  it("keeps ordinary overlapping neighbours that share only the overlap window", () => {
    const para = (i) =>
      "Paragraph " + i + " discusses entropy and closed systems in its own right with enough distinct body sentences to stand alone as a source of citations for retrieval. " +
      "It adds a second clause about heat engines and reservoirs, a third about reversible processes, and a fourth closing the argument neatly so the chunker keeps it whole. " +
      "A fifth sentence pads the paragraph further with technical vocabulary naming work, energy and the second law. " +
      "The sixth and final sentence adds still more bulk so that pairing this paragraph with a short neighbour would exceed the chunk size and split them apart.";
    Store.resetAll();
    Store.db.documents = [
      { id: "doc", courseId: "c1", name: "Notes", text: [para(1), para(2), para(3)].join("\n\n") },
    ];
    RAG.reindexAll();
    const hits = RAG.search("entropy closed systems heat engines");
    /* Three distinct paragraphs — neighbours share the 150-char window only,
       so all must survive to be cited. */
    expect(hits.length).toBe(3);
  });
});

describe("the incremental index path is gone (audit Step 3)", () => {
  it("has no RAG.updateIndex left to diverge from Store.db.chunks", () => {
    expect(RAG.updateIndex).toBeUndefined();
  });

  it("keeps exactly one build path: reindex all, invalidate, rebuild lazily", () => {
    Store.resetAll();
    Store.db.documents = [
      {
        id: "d1",
        courseId: "c1",
        name: "Physics",
        text: "Entropy grows in closed systems and never decreases over time.",
      },
    ];
    RAG.reindexAll();
    expect(RAG._idx).toBeNull();
    expect(RAG.index().n).toBeGreaterThan(0);
  });
});
