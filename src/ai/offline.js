/**
 * Offline fallback responses when AI API is unavailable.
 */
import { Store } from "../core/store.js";
import { RAG } from "../domain/rag.js";

export function offlineAnswer(question, ctx) {
  if (!ctx.chunks.length) {
    return (
      "I could not find anything about that in your uploaded materials.\n\n**What I checked:** " +
      (Store.db.documents.length
        ? Store.db.documents.length +
          " document(s) in your Library, using keyword retrieval."
        : "your Library is empty — nothing has been uploaded yet.") +
      "\n\n**To get a grounded answer, you can:**\n- Upload the relevant textbook chapter, lecture notes or handout in the Library\n- Add an API key in Settings so I can reason beyond your documents\n- Ask a narrower question about material you have already uploaded"
    );
  }
  const picks = RAG.extract(question, ctx.chunks, 5);
  const terms = RAG.glossary(ctx.chunks, 7);
  const out = [];
  if (picks.length) {
    out.push(
      "Based on your uploaded materials, here is what I found for **" +
        question.replace(/[*_`]/g, "") +
        "**:\n",
    );
    out.push(
      picks
        .map((p, i) => i + 1 + ". " + p.text + " [" + p.ref + "]")
        .join("\n"),
    );
  } else {
    out.push(
      "The passages I retrieved do not contain a direct answer to that question. The closest material is quoted under **Sources** below — try rephrasing with terms from your notes.",
    );
  }
  if (terms.length)
    out.push(
      "\n**Key terms appearing in the matched passages:** " + terms.join(", "),
    );
  out.push("\n**Sources**");
  out.push(
    ctx.sources
      .map((s) => "- [" + s.n + "] " + s.docName + " — passage " + (s.idx + 1))
      .join("\n"),
  );
  out.push(
    "\n_Offline mode: this answer is extracted directly from your documents rather than reasoned over. Add an API key in Settings for an explained, conversational answer._",
  );
  return out.join("\n");
}

export function offlineStudyPlan(snap) {
  const lines = [];
  lines.push("## This week");
  const dueSoon = snap.upcomingDeadlines.filter(
    (d) => d.daysLeft <= 7 && d.daysLeft >= 0,
  );
  if (dueSoon.length) {
    dueSoon.forEach((d) => {
      lines.push(
        "- **" +
          d.title +
          "** (" +
          d.course +
          ") — " +
          d.daysLeft +
          " days left, " +
          d.progress +
          "% done",
      );
    });
  } else {
    lines.push("- No deadlines this week — use time to get ahead.");
  }
  lines.push("");
  lines.push("## Start now");
  const open = snap.upcomingDeadlines
    .filter((d) => d.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3);
  if (open.length) {
    open.forEach((d) => {
      lines.push(
        "- Begin **" +
          d.title +
          "** — estimated " +
          d.minutesLeft +
          " minutes remaining",
      );
    });
  }
  lines.push("");
  lines.push("## Study tips");
  lines.push(
    "- Use active recall: close your notes and try to write down what you remember",
  );
  lines.push(
    "- Space your study sessions across multiple days instead of cramming",
  );
  lines.push("- Practice with past papers or create your own quiz questions");
  return lines.join("\n");
}

/** Content words in a sentence: no stop-words, no -ing/-ed/-ly forms. */
function candidateWords(sentence) {
  return (String(sentence || "").match(/[A-Za-z][A-Za-z-]{4,}/g) || []).filter(
    function (word) {
      const lower = word.toLowerCase();
      if (RAG.STOP[lower] || RAG.STOP[RAG.stem(lower)]) return false;
      return !/(ing|edly|ly|ed)$/.test(lower);
    },
  );
}

/**
 * The most specific word in a sentence, used as the anchor for a recall
 * prompt. Deliberately never the sentence itself: a question that quietly
 * contains the answer turns retrieval practice into item matching.
 *
 * Heuristic, and stated as one: the longest content word that the rest of the
 * passage also uses is preferred, because a term the passage keeps coming back
 * to is usually the concept being taught rather than an incidental detail
 * ("isolated", "decreases"). Ties fall back to the longest word, then the
 * first one, so the same passage always produces the same question.
 *
 * @param {string} sentence - The sentence to be recalled
 * @param {string} [passage] - The surrounding text, for the "keeps coming
 *   back to" test
 * @returns {string} A term, or "" when the sentence has none worth using
 */
function keyTermOf(sentence, passage) {
  const words = candidateWords(sentence);
  if (!words.length) return "";
  const siblings = RAG.sentences(passage || "").filter(function (s) {
    return s !== sentence;
  });
  const recurs = function (word) {
    const stem = RAG.stem(word.toLowerCase());
    return siblings.some(function (s) {
      return RAG.tokenize(s).indexOf(stem) !== -1;
    });
  };
  let best = "";
  words.forEach(function (word) {
    if (!best) {
      best = word;
      return;
    }
    const bestRecurs = recurs(best);
    const wordRecurs = recurs(word);
    if (wordRecurs && !bestRecurs) best = word;
    else if (wordRecurs === bestRecurs && word.length > best.length)
      best = word;
  });
  return best;
}

/**
 * Recall prompts, in the order they are handed out. Every one asks the
 * student to produce something from memory first - explain, claim, example -
 * and only then compare against the passage, which is what produces the
 * testing effect. None of them quotes the passage.
 */
const RECALL_TEMPLATES = [
  function (term, where) {
    return term
      ? "Without looking: explain \u201c" +
          term +
          "\u201d in your own words, then reveal and compare with " +
          where +
          "."
      : "Without looking: summarise the idea in this passage in your own words, then reveal and compare with " +
          where +
          ".";
  },
  function (term, where) {
    return term
      ? "Without looking: what does " +
          where +
          " claim about \u201c" +
          term +
          "\u201d, and why does it matter?"
      : "Without looking: what is the main claim in this passage, and why does it matter?";
  },
  function (term, where) {
    return term
      ? "Without looking: give your own example of \u201c" +
          term +
          "\u201d at work, then check it against " +
          where +
          "."
      : "Without looking: give your own example of the idea in this passage, then check it against " +
          where +
          ".";
  },
];

/**
 * Generate retrieval practice questions from context chunks.
 *
 * The question never contains the answer's text; the answer sentence is the
 * thing to be recalled and is revealed on demand. Returns an array of
 * { id, question, answer, source } objects.
 */
export function generateRecallQuestions(ctx, maxQuestions = 3) {
  if (!ctx.chunks.length) return [];
  const picks = [];
  ctx.chunks.forEach((chunk, ci) => {
    const sentences = RAG.sentences(chunk.text);
    sentences.forEach((s, si) => {
      if (s.length > 40 && s.length < 300) {
        picks.push({
          text: s,
          ref: ci + 1,
          sentenceIdx: si,
          docName: chunk.docName || "",
          passage: typeof chunk.idx === "number" ? chunk.idx + 1 : null,
          passageText: chunk.text,
        });
      }
    });
  });
  if (!picks.length) return [];
  const selected = [];
  const usedChunks = new Set();
  picks.forEach(p => {
    if (selected.length >= maxQuestions) return;
    if (!usedChunks.has(p.ref)) {
      selected.push(p);
      usedChunks.add(p.ref);
    }
  });
  if (selected.length < maxQuestions) {
    picks.forEach(p => {
      if (selected.length >= maxQuestions) return;
      if (!selected.includes(p)) selected.push(p);
    });
  }
  return selected.map(function (p, i) {
    const where = p.docName || "your notes";
    return {
      id: `recall-${i}`,
      question: RECALL_TEMPLATES[i % RECALL_TEMPLATES.length](
        keyTermOf(p.text, p.passageText),
        where,
      ),
      answer: p.text,
      source: p.docName
        ? p.docName +
          " \u2014 passage " +
          (p.passage != null ? p.passage : p.ref)
        : "Passage " + p.ref,
    };
  });
}