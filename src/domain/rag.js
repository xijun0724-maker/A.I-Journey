/**
 * Document chunking plus a BM25 retrieval index over everything in the Library.
 * Runs entirely in the browser so the assistant still works with no API key and no network.
 */

import { CFG } from "../config/constants.js";
import { Store } from "../core/store.js";
import { sortBy } from "../utils/helpers.js";

export const RAG = {};

/* Paragraphs merge into one chunk until they reach chunkSize × MERGE_CEIL;
   past it the segment is split on sentence boundaries. (CFG.rag.mergeCeil.) */
const MERGE_CEIL = CFG.rag.mergeCeil || 1.7;

RAG.STOP = (function () {
  const words =
    "a an the and or but if then than that this these those of to in on at by for with from as is are was were be been being it its into over under not no do does did done have has had will would can could should may might must about above after again against all am any because before below between both down during each few further here how i just me more most my no nor now off once only other our out own same she he they them we you your so such there their what when where which while who whom why s t dont isn t very s il re ve ll d m o y".split(
      " ",
    );
  const o = {};
  words.forEach(function (w) {
    o[w] = 1;
  });
  return o;
})();

RAG.stem = function (t) {
  if (t.length <= 4) return t;
  return t
    .replace(/ies$/, "y")
    .replace(/(sses|shes|ches|xes)$/, "s")
    .replace(/ing$/, "")
    .replace(/edly$/, "")
    .replace(/ed$/, "")
    .replace(/s$/, "");
};

/* Domain lexicon: a syllabus says "evaluation" where the student asks "exam",
   and exact-match BM25 never bridges that gap by itself. Raw words are
   grouped, then stemmed once here so lookups hit the same terms the index
   stored. Expands recall as multi-query; RAG.search weights the bridge down
   so the student's own words still dominate. */
RAG.SYN = (function () {
  const groups = [
    ["exam", "test", "quiz", "evaluation", "assessment"],
    ["assignment", "homework", "task", "exercise"],
    ["deadline", "due", "submission"],
    ["lecture", "lesson", "session", "class"],
    ["reading", "textbook", "article"],
    ["grade", "mark", "score"],
    ["project", "capstone", "portfolio"],
    ["syllabus", "outline", "curriculum"],
    ["schedule", "timetable", "plan"],
  ];
  const syn = {};
  groups.forEach(function (g) {
    const stems = {};
    g.forEach(function (w) {
      stems[RAG.stem(w)] = 1;
    });
    const all = Object.keys(stems);
    all.forEach(function (key) {
      syn[key] = all.filter(function (s) {
        return s !== key;
      });
    });
  });
  return syn;
})();

/**
 * Tokenizer: lowercases, drops punctuation, stop-words and single characters,
 * and stems what is left.
 *
 * A short number is kept only when it *follows* a word ("Week 3",
 * "Chapter 12", "2024" is not kept on its own), because bare numbers are page
 * numbers, dates and list markers; indexing them makes every chunk look like a
 * match for any question containing a digit. Five-digit-plus runs are dropped
 * even then - they are part numbers, not references.
 */
RAG.tokenize = function (s) {
  const raw = String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(function (t) {
      return t.length > 0;
    });
  const out = [];
  let prevWasWord = false;
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (/^\d+$/.test(t)) {
      if (prevWasWord && t.length <= 4) out.push(t);
      /* "3 4 5" is a list, not a reference - do not chain numbers. */
      prevWasWord = false;
      continue;
    }
    if (t.length <= 1 || RAG.STOP[t]) {
      prevWasWord = false;
      continue;
    }
    out.push(RAG.stem(t));
    prevWasWord = true;
  }
  return out;
};

RAG.view = function (text) {
  const src = String(text || "");
  let norm = "",
    prevSpace = false;
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src.charAt(i);
    if (ch === "\r") continue;
    if (ch === " " || ch === "\t") {
      if (prevSpace) continue;
      prevSpace = true;
    } else {
      prevSpace = false;
    }
    norm += ch;
    map.push(i);
  }
  return { text: norm, map: map };
};

RAG.chunkRanges = function (text) {
  const src = String(text || "");
  const view = RAG.view(src),
    norm = view.text,
    map = view.map;
  if (!norm.trim()) return [];
  const segs = [],
    blank = /\n[ \t]*\n/g;
  let last = 0,
    m;
  while ((m = blank.exec(norm))) {
    segs.push([last, m.index]);
    last = m.index + m[0].length;
  }
  segs.push([last, norm.length]);
  const runs = [];
  segs.forEach(function (seg) {
    let a = seg[0],
      b = seg[1];
    while (a < b && /\s/.test(norm.charAt(a))) a++;
    while (b > a && /\s/.test(norm.charAt(b - 1))) b--;
    if (b > a) runs.push([a, b]);
  });
  const out = [];
  function keep(a, b) {
    if (b <= a) return;
    const start = map[a],
      end = map[b - 1];
    if (typeof start !== "number" || typeof end !== "number") return;
    const len = end - start + 1;
    if (len > 30) out.push({ start: start, len: len });
  }
  let i = 0;
  let carryStart = null; // where the next segment resumes (overlap carry)
  while (i < runs.length) {
    let a = carryStart != null ? carryStart : runs[i][0];
    carryStart = null;
    while (a < norm.length && /\s/.test(norm.charAt(a))) a++;
    let b = a,
      j = i;
    while (j < runs.length) {
      const end = runs[j][1];
      if (b > a && end - a > CFG.chunkSize) break;
      b = end;
      j++;
      if (b - a >= CFG.chunkSize * MERGE_CEIL) break;
    }
    if (j === i) {
      j = i + 1;
      b = runs[i][1];
    }
    while (b - a > CFG.chunkSize * MERGE_CEIL) {
      let cut = norm.lastIndexOf(". ", a + CFG.chunkSize);
      if (cut <= a + CFG.chunkSize * 0.4) cut = a + CFG.chunkSize;
      keep(a, cut + 1);
      const next = cut + 1 - CFG.chunkOverlap;
      a = next > a ? next : a + 1;
      while (a < b && /\s/.test(norm.charAt(a))) a++;
    }
    keep(a, b);
    i = Math.max(i + 1, j - 1);
    /* Overlap is a property of consecutive chunks, not only of the
       over-ceiling sweep above: the next segment resumes `chunkOverlap`
       characters before this one ends, so a sentence cut at the boundary
       is retrievable from both neighbours. Skipped when the next segment
       is too small to pay for the window — a chunk that is mostly a copy
       of its neighbour would pollute the index, not improve it. */
    const nextOwn = i < runs.length ? runs[i][1] - runs[i][0] : 0;
    if (
      CFG.chunkOverlap > 0 &&
      b - a > CFG.chunkOverlap &&
      nextOwn > CFG.chunkOverlap * 3
    ) {
      carryStart = b - CFG.chunkOverlap;
    }
  }
  return out;
};

RAG.chunkText = function (text) {
  const src = String(text || "");
  return RAG.chunkRanges(src).map(function (r) {
    return src.substr(r.start, r.len);
  });
};

RAG.chunkTextOf = function (c) {
  if (typeof c.len !== "number") return c.text || "";
  const doc = Store.doc(c.docId);
  if (!doc || typeof doc.text !== "string") return "";
  return doc.text.substr(c.start, c.len);
};

RAG.reindexAll = function () {
  const db = Store.db,
    out = [];
  try {
    (db.documents || []).forEach(function (doc) {
      const ranges = RAG.chunkRanges(doc.text);
      doc.chunkCount = ranges.length;
      ranges.forEach(function (r, i) {
        out.push({
          id: doc.id + "#" + i,
          docId: doc.id,
          courseId: doc.courseId,
          docName: doc.name,
          idx: i,
          start: r.start,
          len: r.len,
        });
      });
    });
    db.chunks = out;
    RAG.invalidate();
  } catch (_e) {
    if (typeof console !== "undefined" && console.warn)
      console.warn("RAG reindex failed", _e);
  }
  return out.length;
};

RAG.invalidate = function () {
  RAG._idx = null;
};

/**
 * Incrementally update the index for a single document.
 * @param {string} docId - Document ID
 * @param {string} text - Full document text
 * @param {boolean} isRemoval - If true, remove the document from index
 */
RAG.updateIndex = function (docId, text, isRemoval = false) {
  const idx = RAG.index(); // ensures initialized
  if (isRemoval) {
    // Remove all chunks for this docId
    Object.keys(idx.byId).forEach((cid) => {
      if (idx.byId[cid].docId === docId) {
        delete idx.byId[cid];
        delete idx.len[cid];
        idx.n--;
        Object.keys(idx.post).forEach((term) => delete idx.post[term][cid]);
      }
    });
    // Recalc avg
    const total = Object.values(idx.len).reduce((a, b) => a + b, 0);
    idx.avg = idx.n ? total / idx.n : 1;
    return;
  }
  // Add/update chunks for this document
  const ranges = RAG.chunkRanges(text);
  ranges.forEach((r, i) => {
    const cid = docId + "#" + i;
    const chunkText = text.substr(r.start, r.len);
    const toks = RAG.tokenize(chunkText);
    if (!toks.length) return;
    // Remove old chunk if exists
    if (idx.byId[cid]) {
      Object.keys(idx.post).forEach((term) => delete idx.post[term][cid]);
      idx.n--;
    }
    idx.byId[cid] = {
      id: cid,
      docId,
      start: r.start,
      len: r.len,
      /* Incremental path: the supplied text may not be persisted yet, so
         this entry keeps its own copy (one document, not the library). */
      text: chunkText,
    };
    idx.len[cid] = toks.length;
    idx.n++;
    const tf = {};
    toks.forEach((t) => (tf[t] = (tf[t] || 0) + 1));
    Object.keys(tf).forEach((t) => {
      if (!idx.post[t]) idx.post[t] = {};
      idx.post[t][cid] = tf[t];
    });
  });
  // Recalc avg
  const total = Object.values(idx.len).reduce((a, b) => a + b, 0);
  idx.avg = idx.n ? total / idx.n : 1;
};

RAG.index = function () {
  if (RAG._idx) return RAG._idx;
  const chunks = Store.db.chunks || [];
  const idx = {
    n: 0,
    post: {},
    len: {},
    byId: {},
    avg: 1,
    k1: CFG.rag.bm25k1,
    b: CFG.rag.bm25b,
  };
  let total = 0,
    indexed = 0;
  chunks.forEach(function (c) {
    const text = RAG.chunkTextOf(c);
    if (!text) return;
    /* The entry carries the chunk's coordinates, not a second copy of its
       text: reading `.text` resolves lazily through the document store, so
       the index no longer doubles every document's footprint in memory.
       (defineProperty, not Object.assign — assign would invoke the getter
       and materialise the string immediately.) */
    const entry = Object.assign({}, c);
    Object.defineProperty(entry, "text", {
      get: function () {
        return RAG.chunkTextOf(c);
      },
      enumerable: true,
      configurable: true,
    });
    idx.byId[c.id] = entry;
    const toks = RAG.tokenize(text);
    if (!toks.length) return;
    indexed++;
    idx.len[c.id] = toks.length;
    total += toks.length;
    const tf = {};
    toks.forEach(function (t) {
      tf[t] = (tf[t] || 0) + 1;
    });
    Object.keys(tf).forEach(function (t) {
      if (!idx.post[t]) idx.post[t] = {};
      idx.post[t][c.id] = tf[t];
    });
  });
  idx.n = indexed;
  idx.avg = indexed ? total / indexed : 1;
  RAG._idx = idx;
  return idx;
};

RAG.search = function (query, opts) {
  opts = opts || {};
  const k = opts.k || 5;
  let idx = RAG.index();
  if (!idx.n && (Store.db.documents || []).length) {
    RAG.reindexAll();
    idx = RAG.index();
  }
  let allowed = null;
  if (opts.courseId && opts.courseId !== "all") {
    allowed = {};
    (Store.db.chunks || []).forEach(function (c) {
      if (c.courseId === opts.courseId) allowed[c.id] = 1;
    });
  }
  if (opts.docIds && opts.docIds.length) {
    allowed = {};
    (Store.db.chunks || []).forEach(function (c) {
      if (opts.docIds.indexOf(c.docId) !== -1) allowed[c.id] = 1;
    });
  }
  /* Document-order results are only defensible when the student narrowed the
     corpus themselves: "what is in this PDF?" is a legitimate read of a file
     they explicitly selected, even when no term matches it. Unscoped, an
     unmatched query must return nothing - labelling arbitrary chunks
     [1]...[k] is exactly how a retrieval miss becomes a confident citation. */
  const scoped = !!(
    (opts.docIds && opts.docIds.length) ||
    (opts.courseId && opts.courseId !== "all")
  );
  const fallback = function () {
    if (!scoped) return [];
    return Object.keys(idx.byId)
      .filter(function (cid) {
        return !allowed || allowed[cid];
      })
      .sort(function (a, b) {
        const left = idx.byId[a],
          right = idx.byId[b];
        return (
          (left.docName || "").localeCompare(right.docName || "") ||
          left.idx - right.idx
        );
      })
      .slice(0, k)
      .map(function (cid) {
        return Object.assign({ score: 0 }, idx.byId[cid]);
      });
  };
  /* Multi-query: expand the query with domain synonyms so a passage
     phrased differently ("evaluation" vs "exam") still ranks. Expanded
     terms score at synWeight so the student's own words stay on top. */
  const baseTerms = RAG.tokenize(query);
  const terms = baseTerms.slice();
  const seenTerm = {};
  baseTerms.forEach(function (t) {
    seenTerm[t] = 1;
  });
  baseTerms.forEach(function (t) {
    (RAG.SYN[t] || []).forEach(function (s) {
      if (seenTerm[s]) return;
      seenTerm[s] = 1;
      terms.push(s);
    });
  });
  if (!idx.n || !terms.length) return fallback();
  const scores = {};
  terms.forEach(function (term) {
    const weight = baseTerms.indexOf(term) !== -1 ? 1 : CFG.rag.synWeight;
    const postings = idx.post[term];
    if (!postings) return;
    const cids = Object.keys(postings);
    const idf = Math.log(1 + (idx.n - cids.length + 0.5) / (cids.length + 0.5));
    cids.forEach(function (cid) {
      if (allowed && !allowed[cid]) return;
      const f = postings[cid],
        len = idx.len[cid] || 1;
      const s =
        weight *
        idf *
        ((f * (idx.k1 + 1)) /
          (f + idx.k1 * (1 - idx.b + (idx.b * len) / idx.avg)));
      scores[cid] = (scores[cid] || 0) + s;
    });
  });
  const phrase = String(query || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  Object.keys(scores).forEach(function (cid) {
    const c = idx.byId[cid];
    if (!c) return;
    const low = c.text.toLowerCase();
    if (phrase.length > 6 && low.indexOf(phrase) !== -1)
      scores[cid] += CFG.rag.phraseBonus;
  });
  if (!Object.keys(scores).length) {
    return fallback();
  }
  const ranked = sortBy(Object.keys(scores), function (cid) {
    return -scores[cid];
  });
  /* Near-duplicate suppression: a sweep remainder or an overlap window can
     put two largely identical passages in the results; citing both spends the
     context budget on one sentence twice. Measured against the shorter chunk
     so a small excerpt fully inside a big passage is caught, while ordinary
     neighbours (which share only the 150-char overlap window) survive. */
  const dedupAt =
    CFG.rag.dedupOverlap != null ? CFG.rag.dedupOverlap : 0.6;
  const kept = [];
  ranked.forEach(function (cid) {
    const c = idx.byId[cid];
    if (!c) return;
    const dup = kept.some(function (kid) {
      const o = idx.byId[kid];
      if (!o || o.docId !== c.docId) return false;
      const overlap =
        Math.min(o.start + o.len, c.start + c.len) -
        Math.max(o.start, c.start);
      const shorter = Math.min(o.len, c.len);
      return shorter > 0 && overlap / shorter >= dedupAt;
    });
    if (!dup) kept.push(cid);
  });
  /* Relevance floor: a hit scoring under `minRelative` of the best match is
     tail noise rather than a source, so it never becomes a numbered citation. */
  const best = scores[kept[0]] || 0;
  const relative =
    opts.minRelative != null ? opts.minRelative : CFG.rag.minRelative;
  const floor = best * (relative > 0 ? relative : 0);
  return kept
    .filter(function (cid) {
      return scores[cid] >= floor;
    })
    .slice(0, k)
    .map(function (cid) {
      return Object.assign(
        { score: Math.round(scores[cid] * 100) / 100 },
        idx.byId[cid],
      );
    });
};

RAG.sentences = function (text) {
  return String(text || "")
    .replace(/([.!?])\s+/g, "$1\u0001")
    .split("\u0001")
    .map(function (s) {
      return s.replace(/\s+/g, " ").trim();
    })
    .filter(function (s) {
      return s.length > 25;
    });
};

RAG.extract = function (question, chunks, maxSentences) {
  const terms = RAG.tokenize(question);
  const scored = [];
  chunks.forEach(function (c, ci) {
    RAG.sentences(c.text).forEach(function (s, si) {
      const toks = RAG.tokenize(s);
      if (!toks.length) return;
      let hit = 0;
      terms.forEach(function (t) {
        if (toks.indexOf(t) !== -1) hit += 1;
        else if (
          toks.some(function (x) {
            return x.length > 4 && (x.indexOf(t) === 0 || t.indexOf(x) === 0);
          })
        )
          hit += 0.5;
      });
      if (!hit) return;
      const density = hit / Math.sqrt(toks.length);
      const score = density * 6 + (ci === 0 ? 0.6 : 0) + (si === 0 ? 0.3 : 0);
      scored.push({ score: score, text: s, ref: ci + 1 });
    });
  });
  return sortBy(scored, function (s) {
    return -s.score;
  }).slice(0, maxSentences || 5);
};

RAG.context = function (question, opts) {
  opts = opts || {};
  try {
    const chunks = Array.isArray(opts.chunks)
      ? opts.chunks
      : RAG.search(question, {
          k: opts.k || 5,
          courseId: opts.courseId,
          docIds: opts.docIds,
        });
    const budget = CFG.maxContextChars || CFG.maxChatChars;
    let used = 0;
    const picked = [];
    chunks.forEach(function (c) {
      if (used + c.text.length > budget) return;
      used += c.text.length;
      picked.push(c);
    });
    const sources = picked.map(function (c, i) {
      return {
        n: i + 1,
        docId: c.docId,
        docName: c.docName,
        idx: c.idx,
        courseId: c.courseId,
        score: typeof c.score === "number" ? c.score : 0,
        snippet:
          c.text.slice(0, CFG.rag.snippetLength) +
          (c.text.length > CFG.rag.snippetLength ? "…" : ""),
      };
    });
    const contextText = picked
      .map(function (c, i) {
        return (
          "[" +
          (i + 1) +
          "] " +
          c.docName +
          " (passage " +
          (c.idx + 1) +
          ")\n" +
          c.text
        );
      })
      .join("\n\n");
    return {
      chunks: picked,
      sources: sources,
      contextText: contextText,
      terms: RAG.tokenize(question),
    };
  } catch (_e) {
    return { chunks: [], sources: [], contextText: "", terms: [] };
  }
};

RAG.glossary = function (chunks, limit) {
  const counts = {};
  chunks.forEach(function (c) {
    const seen = {};
    RAG.tokenize(c.text).forEach(function (t) {
      if (!seen[t]) {
        seen[t] = 1;
        counts[t] = (counts[t] || 0) + 1;
      }
    });
  });
  return sortBy(Object.keys(counts), function (t) {
    return -counts[t];
  }).slice(0, limit || 6);
};

export default RAG;
