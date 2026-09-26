/**
 * AI module — orchestrates client, prompts, offline fallbacks, and snapshot.
 */

import { CFG } from "../config/constants.js";
import { Store } from "../core/store.js";
import { RAG } from "../domain/rag.js";
import { Hybrid } from "../domain/rag-embeddings.js";
import { Tasks } from "../domain/tasks.js";
import { Coach } from "../domain/coach.js";
import { Dashboard } from "../domain/dashboard.js";
import { NLP } from "../domain/nlp.js";
import { Planner } from "../domain/planner.js";
import {
  chat,
  usable,
  status,
  parseJson,
  test,
  messageChars,
  checkTokenBudget,
  recordUsage,
} from "./client.js";
import { prompts } from "./prompts.js";
import { offlineAnswer, offlineStudyPlan } from "./offline.js";
import { snapshot } from "./snapshot.js";
import {
  StudyPlanAgent,
  runTool,
  parseAgentAction,
  agentSystemPrompt,
} from "./agent.js";

export {
  settings,
  usable,
  status,
  normalizeGeminiModel,
  chat,
  parseJson,
  test,
  messageChars,
  checkTokenBudget,
  recordUsage,
} from "./client.js";
export { prompts } from "./prompts.js";
export { offlineAnswer, offlineStudyPlan } from "./offline.js";
export { snapshot } from "./snapshot.js";
export { Hybrid } from "../domain/rag-embeddings.js";
export {
  StudyPlanAgent,
  AGENT_TOOLS,
  runTool,
  parseAgentAction,
  agentSystemPrompt,
} from "./agent.js";

/**
 * Validate [n] citation markers in AI text against the numbered sources
 * that were actually supplied in the prompt context.
 */
export function validateCitations(text, sources) {
  const list = Array.isArray(sources) ? sources : [];
  const maxN = list.length;
  const referenced = [];
  const invalid = [];
  const str = String(text == null ? "" : text);
  const re = /\[(\d+)\]/g;
  let match;
  while ((match = re.exec(str)) !== null) {
    const n = parseInt(match[1], 10);
    if (!Number.isFinite(n)) continue;
    if (n >= 1 && n <= maxN) {
      if (referenced.indexOf(n) === -1) referenced.push(n);
    } else if (invalid.indexOf(n) === -1) {
      invalid.push(n);
    }
  }
  return {
    ok: invalid.length === 0,
    referenced: referenced,
    invalid: invalid,
    sourceCount: maxN,
  };
}

/** Strip citation markers that point outside the supplied source range. */
export function sanitizeCitations(text, sources) {
  const list = Array.isArray(sources) ? sources : [];
  const maxN = list.length;
  return String(text == null ? "" : text).replace(
    /\[(\d+)\]/g,
    function (full, digits) {
      const n = parseInt(digits, 10);
      return n >= 1 && n <= maxN ? full : "";
    },
  );
}

function applyCitations(text, sources) {
  const citations = validateCitations(text, sources);
  const safe =
    citations.invalid.length > 0 ? sanitizeCitations(text, sources) : text;
  return { text: safe, citations: citations };
}

/**
 * Describe where an answer came from. This is provenance, not confidence:
 * no number here is calibrated against correctness, so nothing pretends to
 * measure truth. What can be said honestly is
 *
 *   - how much material retrieval actually matched (`passages`, `docs`),
 *   - whether the answer cites any of it and every marker pointed at a real
 *     passage (`cited`, `allCitationsValid`),
 *   - whether the text was composed by a model or extracted from the
 *     student's own files (`mode`),
 *   - the one thing the citation check *does* gate: an answer with no
 *     validated citation never earns the `grounded` band, whatever else
 *     looks good.
 *
 * Bands: "grounded" > "supported" > "weak" > "ungrounded".
 * Pure function — safe to call with any partial result object.
 */
export function answerProvenance(res) {
  res = res || {};
  const sources = Array.isArray(res.sources) ? res.sources : [];
  const citations = res.citations || null;
  const mode = res.mode === "ai" && !res.aiError ? "ai" : "offline";

  const docs = {};
  sources.forEach(function (s) {
    if (s && s.docId != null) docs[s.docId] = 1;
  });
  const docCount = Object.keys(docs).length;
  const passages = sources.length;
  const cited = !!(citations && citations.referenced && citations.referenced.length);
  const allCitationsValid = !!(citations && citations.ok);

  let band;
  if (!passages || !allCitationsValid || !cited) {
    /* Nothing retrieved, a citation pointed outside the sources, or the
       answer cites nothing it could be checked against. A retrieval miss
       wearing citations is worse than no badge — the lowest band must be
       the honest default. */
    band = !passages || !allCitationsValid ? "ungrounded" : "weak";
  } else if (mode === "ai") {
    band = "grounded";
  } else {
    band = "supported";
  }

  return {
    band: band,
    mode: mode,
    passages: passages,
    docs: docCount,
    cited: cited,
    allCitationsValid: allCitationsValid,
    model: res.model || null,
  };
}

function withProvenance(result) {
  result.provenance = answerProvenance(result);
  return result;
}

/**
 * Choose the guidance level for one answer.
 *
 * A scaffold should fade as competence grows; a crutch should not. The
 * verdicts the recall drill already records decide the level when the learner
 * has left the choice open ("Automatic" in Settings), and an explicit choice —
 * by the caller or in Settings — is never overridden.
 *
 * Ladder, one step at a time:
 *   - fewer than 8 attempts, or under 40% recall: full answers — the safe
 *     default, and where a learner who is still struggling should stay
 *   - 8+ attempts at 40% or better: guiding questions (Socratic) — they can
 *     produce something, so stop handing over the answer
 *   - 20+ attempts at 60% or better: a single nudge (Hint) — most struggle
 *   - between those bands: Socratic, until the evidence clears the next bar
 *
 * @param {object} opts - `answer()` options; `guidanceLevel` wins outright
 * @returns {"explain"|"socratic"|"hint"}
 */
export function resolveGuidanceLevel(opts) {
  opts = opts || {};
  if (opts.guidanceLevel) return opts.guidanceLevel;
  const mode = Store.db.settings.tutorMode || "auto";
  if (mode !== "auto") return mode;
  const r = Coach.recallStats();
  /* Struggling learners keep full answers at every sample size — fading is a
     reward for production, not a penalty for needing the answer. */
  if (r.rate < 0.4) return "explain";
  if (r.attempts >= 20) return r.rate >= 0.6 ? "hint" : "socratic";
  if (r.attempts >= 8) return "socratic";
  return "explain";
}

export function answer(question, opts = {}) {
  opts = opts || {};
  const k = opts.k || 5;
  const chatHistory = opts.chatHistory || [];
  const guidanceLevel = resolveGuidanceLevel(opts);

  let ragQuery = question;
  if (question.split(/\s+/).length <= 6 && chatHistory.length > 0) {
    const keywords = NLP.extractKeywords(question);
    if (keywords) ragQuery = keywords + " " + question;
  }

  const ctxOpts = { k, docIds: opts.docIds };
  const ctxReady = Hybrid.enabled()
    ? Hybrid.context(ragQuery, ctxOpts)
    : Promise.resolve(RAG.context(ragQuery, ctxOpts));

  return ctxReady.then(function (ctx) {
    /* The student may have stopped while retrieval was still running. */
    if (opts.signal && opts.signal.aborted) {
      return { text: "", mode: "cancelled", cancelled: true, sources: [] };
    }
    if (!usable()) {
      const offline = applyCitations(
        offlineAnswer(question, ctx, { db: Store.db }, RAG),
        ctx.sources,
      );
      return withProvenance({
        text: offline.text,
        mode: "offline",
        sources: ctx.sources,
        citations: offline.citations,
      });
    }

    const messages =
      guidanceLevel === "explain"
        ? prompts.tutor(question, ctx, null, chatHistory)
        : prompts.socratic(question, ctx, null, chatHistory, guidanceLevel);
    const maxTokens = guidanceLevel === "hint" ? 150 : 1024;
    return chat(messages, {
      timeout: CFG.timeouts.apiAnswer,
      maxTokens,
      signal: opts.signal,
    }).then((r) => {
      if (r && r.cancelled) {
        return { text: "", mode: "cancelled", cancelled: true, sources: [] };
      }
      if (r.ok) {
        const checked = applyCitations(r.text, ctx.sources);
        return withProvenance({
          text: checked.text,
          mode: "ai",
          model: r.model,
          sources: ctx.sources,
          citations: checked.citations,
          usage: r.usage || null,
        });
      }
      const offline = applyCitations(
        offlineAnswer(question, ctx, { db: Store.db }, RAG),
        ctx.sources,
      );
      return withProvenance({
        text: offline.text,
        mode: "offline",
        sources: ctx.sources,
        citations: offline.citations,
        aiError: r.error,
        usage: r.usage || null,
      });
    });
  });
}

/**
 * Ask the agent for a study plan, then attach the concrete schedule it is
 * proposing.
 *
 * The model supplies the narrative (what to do first, what to watch out for,
 * which study method to use); the blocks come from the same
 * `Planner.generateInteractive` the manual path uses. The model never authors
 * the blocks, so it cannot invent work, and nothing is written to the plan
 * until the student accepts.
 *
 * @param {object} [opts] - Same options as studyPlan (signal, exclude, ...)
 * @returns {Promise<object>} The studyPlan result plus `draft` (omit when
 *   there is nothing schedulable or the run was cancelled)
 */
export async function studyPlanProposal(opts = {}) {
  opts = opts || {};
  const res = await studyPlan(opts);
  if (!res || res.cancelled) return res;

  const draft = Planner.generateInteractive({
    weeks: Store.db.settings.plannerWeeks,
    exclude: opts.exclude || [],
  });
  /* Nothing to schedule, or the student excluded everything: say so rather
     than offering an empty plan to accept. */
  if (!draft.planItems.length) return res;

  draft.meta.provenance = {
    mode: res.mode || "offline",
    model: res.model || null,
    tools: (res.toolsUsed || []).slice(),
    calls: (res.usage && res.usage.calls) || 0,
    at: new Date().toISOString(),
  };
  return Object.assign({}, res, { draft: draft });
}

export function studyPlan(opts = {}) {
  opts = opts || {};
  const snap = snapshot(Tasks, Coach, Dashboard);

  if (usable() && opts.agent !== false) {
    return StudyPlanAgent(
      "Build me a personalised study plan for the coming weeks based on my deadlines, workload and library.",
      opts,
    );
  }

  if (!usable()) {
    return Promise.resolve({ text: offlineStudyPlan(snap), mode: "offline" });
  }

  const messages = prompts.recommend(snap);
  return chat(messages, {
    timeout: CFG.timeouts.apiRefine,
    signal: opts.signal,
  }).then((r) => {
    if (r && r.cancelled) {
      return { text: "", mode: "cancelled", cancelled: true };
    }
    if (r.ok) return { text: r.text, mode: "ai", model: r.model };
    return { text: offlineStudyPlan(snap), mode: "offline", aiError: r.error };
  });
}

export default {
  settings: () => Store.db.settings,
  usable,
  status,
  chat,
  parseJson,
  messageChars,
  checkTokenBudget,
  recordUsage,
  test,
  prompts,
  validateCitations,
  sanitizeCitations,
  answerProvenance,
  Hybrid,
  StudyPlanAgent,
  runTool,
  parseAgentAction,
  agentSystemPrompt,
  offlineAnswer,
  snapshot,
  answer,
  studyPlan,
  studyPlanProposal,
};
