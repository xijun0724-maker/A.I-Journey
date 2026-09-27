import { CFG } from "../config/constants.js";
import { Store } from "../core/store.js";
import { UIState } from "../core/state.js";
import { answer, studyPlanProposal } from "../ai/index.js";
import { generateRecallQuestions } from "../ai/offline.js";
import { Tasks } from "../domain/tasks.js";
import { Coach } from "../domain/coach.js";
import { esc, uid, sortBy, minutesToHM } from "../utils/helpers.js";
import { planProvenance } from "../utils/format.js";
import { mdToHtml } from "../utils/markdown.js";
import { q, toast } from "../utils/dom.js";
import { applyModel } from "../core/actions/settings.js";
import Router from "../core/router.js";
import { RAG } from "../domain/rag.js";

/* ── incremental chat rendering helpers ────────────────────────────── */

/*
 * Provenance line, not a confidence badge. Nothing here measures truth — a
 * percentage would calibrate the student on the machine's say-so. What can
 * be said honestly is where the text came from and whether it can be checked:
 * the band is capped at "supported" unless the answer carries at least one
 * citation that was validated against the retrieved passages.
 */
function renderProvenance(p) {
  if (!p || !p.band) return ""; /* pre-migration messages: no line */
  const labels = {
    grounded: "Grounded in your documents",
    supported: "Supported by your documents",
    weak: "From your documents, but uncited — verify before relying on it",
    ungrounded: "No matching passages — verify independently",
  };
  const label = labels[p.band] || labels.ungrounded;
  const where =
    p.docs > 0
      ? p.passages +
        " passage" +
        (p.passages === 1 ? "" : "s") +
        " from " +
        p.docs +
        (p.docs === 1 ? " document" : " documents")
      : "no passages";
  const via =
    p.mode === "ai" ? " · composed by " + (p.model || "the model") : " · extracted from your files";
  return (
    '<div class="prov-widget prov-' +
    esc(p.band) +
    '" role="status">' +
    '<span class="prov-band"></span><span class="prov-label">' +
    esc(label) +
    '</span><span class="prov-detail">' +
    esc(where + via) +
    "</span></div>"
  );
}

function renderAiMeta(m) {
  let meta = "";
  if (m.mode === "offline")
    meta += '<div class="msg-meta">offline retrieval · no API key used</div>';
  if (m.model)
    meta += '<div class="msg-meta">answered by ' + esc(m.model) + "</div>";
  return meta;
}

function renderCites(m) {
  if (!m.citations || !m.citations.length) return "";
  let h = '<div class="cites">';
  m.citations.forEach(function (c) {
    h +=
      '<div class="cite"><span class="src">[' +
      c.n +
      "] " +
      esc(c.docName) +
      "</span> · passage " +
      (c.idx + 1) +
      '<div class="tiny muted mt-s">' +
      esc((c.snippet || "").slice(0, 200)) +
      "</div></div>";
  });
  return h + "</div>";
}

function msgHtml(m) {
  if (m.role === "user") {
    return (
      '<div class="msg user"><div class="bub">' +
      "<div>" +
      esc(m.content) +
      "</div></div></div>"
    );
  }
  /* A drill opened from the Library or a review block: the questions are the
     message, so it re-renders after navigation instead of evaporating. */
  if (m.kind === "recall") {
    return (
      '<div class="msg ai"><div class="msg-ai-body">' +
      (m.title
        ? '<div class="tiny muted mb-sm">' + esc(m.title) + "</div>"
        : "") +
      renderRecallQuestions(m.questions) +
      "</div></div>"
    );
  }
  return (
    '<div class="msg ai">' +
    '<div class="msg-ai-body">' +
    mdToHtml(m.content) +
    renderProvenance(m.provenance) +
    renderCites(m) +
    renderAiMeta(m) +
    "</div></div>"
  );
}

function appendMsg(m) {
  const log = q("#chatLog");
  if (!log) return;
  log.insertAdjacentHTML("beforeend", msgHtml(m));
  log.scrollTop = log.scrollHeight;
}

const TYPING_HTML =
  '<div class="msg ai" id="typingIndicator">' +
  '<div class="msg-ai-body"><div class="typing-row">' +
  '<div class="typing"><span></span><span></span><span></span></div>' +
  '<button class="pill-stop" data-act="chat-stop" aria-label="Stop generating">Stop</button>' +
  "</div></div></div>";

/* The in-flight chat/plan request, if any. `chat-stop` aborts it, which both
   cancels the fetch and stops the agent loop before its next paid call. */
let pendingAbort = null;

function beginAbort() {
  if (typeof AbortController === "undefined") return null;
  pendingAbort = new AbortController();
  return pendingAbort;
}

function endAbort(ctrl) {
  if (pendingAbort === ctrl) pendingAbort = null;
}

/** True while a request is cancellable (drives the Stop affordance). */
export function isPending() {
  return !!(pendingAbort && !pendingAbort.signal.aborted);
}

/** Abort the in-flight assistant request. Returns whether one was running. */
export function abortPending() {
  if (!isPending()) {
    pendingAbort = null;
    return false;
  }
  pendingAbort.abort();
  pendingAbort = null;
  return true;
}

function settleCancelled() {
  UIState.set("chatPending", false);
  hideTyping();
  hideLive();
  toast("Stopped. Nothing was added to the transcript.", "info", "Cancelled");
}

function showTyping() {
  const log = q("#chatLog");
  if (!log || q("#typingIndicator")) return;
  log.insertAdjacentHTML("beforeend", TYPING_HTML);
  log.scrollTop = log.scrollHeight;
}

function hideTyping() {
  q("#typingIndicator")?.remove();
}

/* ── streaming: where the tokens land ──────────────────────────────── */

/*
 * A provisional assistant bubble, filled from onToken while the answer is
 * still being generated. It is thrown away, never persisted: the settled
 * answer is the citation-checked text that appendMsg renders afterwards, so
 * `hideLive()` runs on every terminal path — settled, cancelled or failed —
 * before that message appears. It keeps the Stop control the typing row
 * carried, so cancelling stays possible once the dots have become words.
 *
 * The first delta paints at once (text appearing is the whole point); after
 * that painting is throttled, because re-parsing a growing markdown string
 * on every token costs more than the wait it saves.
 */
const LIVE_ID = "liveAnswer";
const LIVE_INTERVAL = 90;
let liveTimer = null;
let liveText = null;

function paintLive() {
  const log = q("#chatLog");
  if (!log) return;
  let el = q("#" + LIVE_ID);
  if (!el) {
    hideTyping();
    log.insertAdjacentHTML(
      "beforeend",
      '<div class="msg ai" id="' +
        LIVE_ID +
        '">' +
        '<div class="msg-ai-body"></div>' +
        '<div class="typing-row">' +
        '<button class="pill-stop" data-act="chat-stop" aria-label="Stop generating">Stop</button>' +
        "</div></div>",
    );
    el = q("#" + LIVE_ID);
    if (!el) return;
  }
  const body = el.querySelector(".msg-ai-body");
  if (body) body.innerHTML = mdToHtml(liveText || "");
  log.scrollTop = log.scrollHeight;
}

/** Show the text accumulated so far; safe to call once per delta. */
export function showLive(text) {
  liveText = text;
  if (liveTimer) return; /* a paint is already scheduled for this window */
  paintLive();
  liveTimer = setTimeout(() => {
    liveTimer = null;
    paintLive();
  }, LIVE_INTERVAL);
}

/** Drop the provisional bubble and any paint it still owed. */
export function hideLive() {
  if (liveTimer) {
    clearTimeout(liveTimer);
    liveTimer = null;
  }
  liveText = null;
  q("#" + LIVE_ID)?.remove();
}

function renderRecallQuestions(questions) {
  if (!questions || !questions.length) return "";
  let h =
    '<div class="recall-widget">' +
    '<div class="recall-header">🧠 Quick recall check</div>' +
    '<div class="recall-hint">Answer each one from memory before you open it - producing the answer is what makes it stick.</div>';
  questions.forEach((item) => {
    /* Closed on purpose: the answer is the thing being recalled, so it is
       revealed on demand rather than shown next to the question. */
    h +=
      '<details class="recall-card" data-recall-card="' +
      esc(item.id) +
      '"' +
      (item.docId ? ' data-doc="' + esc(item.docId) + '"' : "") +
      '"><summary><span class="recall-q">' +
      esc(item.question) +
      '</span></summary><div class="recall-a">' +
      esc(item.answer) +
      '<div class="recall-src">Source: ' +
      esc(item.source) +
      '</div><div class="recall-mark"><span class="tiny muted">Was that right?</span>' +
      '<button class="btn xs" data-act="recall-mark" data-id="' +
      esc(item.id) +
      '" data-arg="got">Got it</button>' +
      '<button class="btn xs ghost" data-act="recall-mark" data-id="' +
      esc(item.id) +
      '" data-arg="miss">Not yet</button>' +
      "</div></div></details>";
  });
  h += "</div>";
  return h;
}

/**
 * Record the student's own verdict on a recall attempt.
 *
 * Honest about what it does: a "got it" counts as one completed practice item
 * in today's activity log, and the card marks itself so the widget reflects the
 * action. It does not invent study minutes for a question that took seconds.
 * Both verdicts are recorded (`Coach.logRecall`) — a miss is the signal the
 * guidance level fades on, so dropping it would keep every learner on
 * full-answer mode forever.
 *
 * @param {string} id - Recall question id ("recall-0")
 * @param {string} verdict - "got" | "miss"
 */
export function markRecallResult(id, verdict) {
  const safe = String(id || "").replace(/[^a-z0-9-]/gi, "");
  if (!safe) return false;
  const card = q('[data-recall-card="' + safe + '"]');
  /* Filed against the document when the card can name one; a chat-turn
     widget has no document behind it, so those verdicts stay in the
     totals only. */
  const docId = card ? card.getAttribute("data-doc") || null : null;
  if (verdict === "got") {
    Coach.logActivity(0, 1);
    Coach.logRecall(true, docId || undefined);
    if (card) {
      card.classList.add("recalled");
      const mark = card.querySelector(".recall-mark");
      if (mark)
        mark.textContent = "Logged as recalled. Revisit it in a few days.";
    }
    toast(
      "Logged as recalled. Spacing beats cramming - come back to it in a few days.",
      "ok",
    );
    return true;
  }
  Coach.logRecall(false, docId || undefined);
  if (card) card.classList.add("missed");
  toast("Reread the passage, close it, then answer again from memory.", "info");
  return true;
}

/* ── Retrieval practice without a chat question ────────────────────────
 *
 * The drill used to be reachable only after asking the tutor a question, so
 * the learner who never asks — the confident, self-directed one — never
 * practised. A document in the Library (or a review block in the Planner)
 * can now open the same drill directly: no question, no model call.
 */

/** Indexed chunks for one document, in index order. */
function docChunks(docId) {
  const idx = RAG.index();
  return Object.keys(idx.byId)
    .map((cid) => idx.byId[cid])
    .filter((c) => c.docId === docId && c.text);
}

/**
 * Questions for one document, or null when the library cannot support a
 * drill (nothing indexed, or nothing survived generation).
 *
 * Ids are namespaced by document so two drills can sit in the same chat
 * without fighting over `recall-0`.
 */
function drillFor(doc) {
  if (!doc) return null;
  const chunks = docChunks(doc.id);
  if (!chunks.length) return null;
  const ctx = RAG.context(doc.name, { chunks: chunks });
  const questions = generateRecallQuestions(ctx, 3);
  if (!questions.length) return null;
  const prefix =
    "recall-" + String(doc.id).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  questions.forEach(function (item, i) {
    item.id = prefix + "-" + i;
    /* Carried through to the card so the verdict can be filed against this
       document — that per-document miss rate is what the Planner orders
       review blocks by. */
    item.docId = doc.id;
  });
  return questions;
}

/** Persist the drill as a chat message and open it in the assistant. */
function startDrill(title, questions) {
  const msg = {
    id: uid("msg"),
    role: "assistant",
    kind: "recall",
    content: "",
    title: title,
    questions: questions,
    ts: Date.now(),
    mode: "drill",
  };
  Store.chat.append(msg);
  Router.navigate("assistant");
  return true;
}

/** Open the recall drill for a specific Library document. */
export function practiseDocument(docId) {
  const doc = Store.documents.get(docId);
  if (!doc) {
    toast("That document is no longer in your library.", "bad");
    return false;
  }
  const questions = drillFor(doc);
  if (!questions) {
    toast(
      '"' + doc.name + '" has no indexed passages to drill on yet.',
      "info",
    );
    return false;
  }
  return startDrill("Practice: " + doc.name, questions);
}

/**
 * Open the drill on the first document of a course that can support one —
 * what a "Review:" block in the Planner points at, since the block names a
 * course rather than a file.
 */
export function practiseCourse(courseId) {
  const docs = (Store.db.documents || []).filter(function (d) {
    return !courseId || d.courseId === courseId;
  });
  for (let i = 0; i < docs.length; i++) {
    const questions = drillFor(docs[i]);
    if (questions) return startDrill("Practice: " + docs[i].name, questions);
  }
  toast("No document in this course has indexed passages to drill on yet.", "info");
  return false;
}

/* ── Model selector ────────────────────────────────────────────────── */

function renderModelSelector() {
  const s = Store.db.settings;
  const model = s.model || CFG.openrouter.model;

  /* Short pill label: the first word of the model's friendly name when it
     is one we list, otherwise the endpoint itself. */
  const found = CFG.openrouter.freeModels.find(function (m) {
    return m.id === model;
  });
  const label = found ? found.label.split(" ")[0] : "OpenRouter";

  let h = '<div class="pill-model-wrap">';
  h +=
    '<button class="pill-model" id="btnModelSelect" aria-label="Select model">' +
    esc(label) +
    "</button>";
  h += '<div class="model-dropdown" id="modelDropdown">';

  CFG.openrouter.freeModels.forEach(function (m) {
    h +=
      '<button class="model-option' +
      (model === m.id ? " active" : "") +
      '" data-model="' +
      esc(m.id) +
      '">';
    h += '<span class="model-dot"></span>' + esc(m.label) + "</button>";
  });

  h += "</div></div>";
  return h;
}

/* ── Speech recognition ────────────────────────────────────────────── */

let recognition = null;

function toggleSpeechRecognition(micBtn, textarea) {
  if (recognition) {
    recognition.stop();
    recognition = null;
    micBtn.classList.remove("listening");
    return;
  }
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast("Speech recognition is not supported in this browser.", "warn");
    return;
  }
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  micBtn.classList.add("listening");

  recognition.onresult = function (e) {
    let transcript = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    if (textarea) {
      textarea.value = transcript;
      textarea.dispatchEvent(new Event("input"));
    }
  };

  recognition.onend = function () {
    micBtn.classList.remove("listening");
    recognition = null;
  };

  recognition.onerror = function (e) {
    micBtn.classList.remove("listening");
    recognition = null;
    if (e.error !== "no-speech") {
      toast("Voice input failed: " + e.error, "warn");
    }
  };

  recognition.start();
}

/* ── Reusable HTML fragments ───────────────────────────────────────── */

function renderInputPill() {
  let h = '<div class="chat-input-pill" id="chatInputBox">';

  h += '<button class="pill-addon" aria-label="New chat" data-act="chat-new">';
  h +=
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">' +
    '<line x1="12" y1="5" x2="12" y2="19"/>' +
    '<line x1="5" y1="12" x2="19" y2="12"/>' +
    "</svg>";
  h += "</button>";

  h +=
    '<textarea id="chatInput" rows="1" placeholder="Ask anything..."></textarea>';

  h += '<div class="pill-right">';
  h += renderModelSelector();

  h +=
    '<button class="pill-mic" id="btnMic" aria-label="Voice input">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">' +
    '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>' +
    '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
    '<line x1="12" y1="19" x2="12" y2="23"/>' +
    '<line x1="8" y1="23" x2="16" y2="23"/>' +
    "</svg>" +
    "</button>";

  h +=
    '<button class="pill-send" data-act="chat-send" aria-label="Send message">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">' +
    '<line x1="12" y1="19" x2="12" y2="5"/>' +
    '<polyline points="5 12 12 5 19 12"/>' +
    "</svg>" +
    "</button>";

  h += "</div>"; /* .pill-right */
  h += "</div>"; /* .chat-input-pill */
  return h;
}

/* ── Landing: first-run empty state, else search card + suggestions ──
   With no courses the one primary action is importing a syllabus; chat and
   provider chrome wait until there is something to reason about. */

function renderElicitLanding() {
  const emptyTerm = !((Store.db.courses || []).length);

  if (emptyTerm) {
    return (
      '<div class="elicit-landing">' +
      '<div class="elicit-card elicit-empty">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="28" height="28" aria-hidden="true">' +
      '<path d="M8 2.5l5 2.6L8 7.7 3 5.1z"/>' +
      '<path d="M3.5 8.2 8 10.5l4.5-2.3M3.5 10.8 8 13.1l4.5-2.3"/>' +
      "</svg>" +
      '<h2>Start with your syllabus</h2>' +
      '<p>Journey A.I turns a syllabus into deadlines, lessons and a study plan — and then answers questions about your materials, with or without an AI key.</p>' +
      '<button class="btn primary" data-act="go-import">Import a syllabus</button>' +
      '</div>' +
      '</div>'
    );
  }

  let h = '<div class="elicit-landing">';

  /* ── Main search card ── */
  h += '<div class="elicit-card">';

  /* Header label. This was a dead "Find papers" button — a research-tool
     mimic with no handler — so it is an honest static label now. */
  h += '<div class="elicit-card-header">';
  h += '<span class="elicit-dropdown elicit-dropdown-static">';
  h +=
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">' +
    '<circle cx="11" cy="11" r="8"/>' +
    '<path d="m21 21-4.35-4.35"/>' +
    "</svg>";
  h += "<span>Ask about your study materials</span>";
  h += "</span>";
  h += "</div>";

  /* Textarea body */
  h += '<div class="elicit-card-body">';
  h +=
    '<textarea id="chatInput" rows="1" placeholder="What are you studying today?"></textarea>';
  h += "</div>";

  /* Submit footer */
  h += '<div class="elicit-card-footer">';
  h +=
    '<button class="elicit-send" data-act="chat-send" aria-label="Send message">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">' +
    '<path d="M5 12h14"/>' +
    '<path d="m12 5 7 7-7 7"/>' +
    "</svg>" +
    "</button>";
  h += "</div>";

  h += "</div>"; /* .elicit-card */

  /* ── Suggestions grid ── */
  h += renderElicitCards();

  h += "</div>"; /* .elicit-landing */
  return h;
}

function renderElicitCards() {
  const cards = [];

  /* First card: resume the newest conversation that is not already open.
     The landing page only shows when nothing is open, so "not open" simply
     means: take the newest one. */
  const open = Store.chat.activeId();
  const resume = Store.chat
    .conversations()
    .find(function (c) {
      return c.cid !== open;
    });
  if (resume && resume.title) {
    const text =
      resume.title.length > 60
        ? resume.title.slice(0, 60) + "..."
        : resume.title;
    const ago = timeAgo(resume.ts);
    cards.push({
      badge: "resume",
      text: text,
      meta: ago || null,
      cid: resume.cid,
    });
  }

  /* Fill remaining slots with suggested prompts */
  const suggs = suggestions();
  const slots = 3 - cards.length;
  suggs.slice(0, slots).forEach(function (s) {
    cards.push({
      badge: "suggested",
      text: s.label,
      meta: null,
      q: s.q,
    });
  });

  if (!cards.length) return "";

  let h = '<div class="elicit-grid">';
  cards.forEach(function (c) {
    /* Resume opens the stored conversation; suggestions send a prompt into
       whatever conversation is open. */
    h += c.cid
      ? '<div class="elicit-suggestion-card" data-act="chat-open" data-cid="' +
        esc(c.cid) +
        '">'
      : '<div class="elicit-suggestion-card" data-act="chat-suggest" data-q="' +
        esc(c.q) +
        '">';

    /* Badge */
    if (c.badge === "resume") {
      h += '<span class="elicit-badge elicit-badge-resume">';
      h +=
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">' +
        '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>' +
        '<path d="M3 3v5h5"/>' +
        "</svg>";
      h += "<span>Resume</span></span>";
    } else {
      h += '<span class="elicit-badge elicit-badge-suggested">';
      h +=
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">' +
        '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
        '<path d="M9 18h6"/>' +
        '<path d="M10 22h4"/>' +
        "</svg>";
      h += "<span>Suggested</span></span>";
    }

    /* Card text */
    h += '<p class="elicit-card-text">' + esc(c.text) + "</p>";

    /* Metadata (only for resume cards) */
    if (c.meta) {
      h += '<div class="elicit-card-meta">';
      h += '<span class="elicit-dot"></span>';
      h += "<span>" + esc(c.meta) + "</span>";
      h += "</div>";
    }

    h += "</div>";
  });
  h += "</div>";
  return h;
}

/* ── AI study-plan proposal card ─────────────────────────────────────
   Rendered from UIState, never stored in the transcript: after a reload there
   is no proposal to act on, so there must be no button claiming otherwise. */

const PROPOSAL_CARD_ID = "planProposalCard";

/**
 * Every open task the proposal covers, not just the ones that fitted.
 * Derived from the tasks themselves (not from the draft's blocks) so a task
 * the student removes stays on screen to be added back, and a task with no
 * room left is visible rather than silently missing.
 */
function proposalTasks(draft, exclude) {
  const scope = (draft.meta && draft.meta.courseId) || "all";
  const excluded = exclude || [];
  const inDraft = {};
  (draft.planItems || []).forEach(function (p) {
    if (p.eventId) inDraft[p.eventId] = true;
  });
  return sortBy(
    Store.db.events.filter(function (e) {
      if (!Tasks.isOpen(e)) return false;
      return scope === "all" || e.courseId === scope;
    }),
    function (e) {
      return (e.due || "9999") + "|" + String(e.title || "");
    },
  ).map(function (e) {
    return {
      eventId: e.id,
      title: e.title,
      course: Store.courseName(e.courseId),
      scheduled: !!inDraft[e.id],
      off: excluded.indexOf(e.id) !== -1,
    };
  });
}

function renderPlanProposal(proposal) {
  const draft = proposal.draft;
  const meta = draft.meta || {};
  const excluded = proposal.exclude || [];
  const unscheduled = (meta.unscheduled || []).length;
  const atRisk = (meta.atRisk || []).length;
  const tasks = proposalTasks(draft, excluded);

  let h = '<div class="plan-proposal" id="' + PROPOSAL_CARD_ID + '">';
  h +=
    '<div class="pp-head"><span class="eyebrow">Proposed study plan</span>' +
    "<strong>" +
    draft.planItems.length +
    " block" +
    (draft.planItems.length === 1 ? "" : "s") +
    " · " +
    minutesToHM(meta.totalMinutes || 0) +
    " · " +
    (meta.weeks || 0) +
    " weeks</strong></div>";
  h +=
    '<div class="pp-prov tiny muted">' +
    esc(planProvenance(meta.provenance)) +
    "</div>";

  if (unscheduled || atRisk) {
    h += '<div class="pp-flags">';
    if (unscheduled)
      h +=
        '<span class="badge crit">' +
        unscheduled +
        " could not be scheduled</span>";
    if (atRisk) h += '<span class="badge med">' + atRisk + " tight fit</span>";
    h += "</div>";
  }

  h +=
    '<div class="pp-note tiny muted">Nothing is saved until you accept. Untick a task to re-plan without it.</div>';
  h += '<div class="pp-tasks">';
  tasks.slice(0, 12).forEach(function (t) {
    const note = t.off ? "left out" : t.scheduled ? t.course : "no room left";
    h +=
      '<button class="pp-task' +
      (t.off ? " off" : t.scheduled ? "" : " unscheduled") +
      '" data-act="plan-proposal-exclude" data-id="' +
      esc(t.eventId) +
      '" role="checkbox" aria-checked="' +
      (t.off ? "true" : "false") +
      '" title="' +
      (t.off ? "Include this task again" : "Re-plan without this task") +
      '"><span class="pp-tick">✓</span><span class="pp-task-title">' +
      esc(t.title) +
      "</span>" +
      (note ? '<span class="tiny muted">' + esc(note) + "</span>" : "") +
      "</button>";
  });
  if (tasks.length > 12)
    h +=
      '<div class="tiny muted">+' + (tasks.length - 12) + " more tasks</div>";
  if (excluded.length)
    h +=
      '<div class="pp-warn tiny">' +
      excluded.length +
      " task(s) left out — the AI notes above were written before your change.</div>";
  h += "</div>";

  h +=
    '<div class="pp-actions">' +
    '<button class="btn primary sm" data-act="plan-proposal-accept">Accept plan</button>' +
    '<button class="btn sm" data-act="plan-proposal-edit">Review &amp; edit</button>' +
    '<button class="btn sm ghost" data-act="plan-proposal-reject">Keep my current plan</button>' +
    "</div></div>";
  return h;
}

function liveProposal() {
  const p = UIState.planProposal;
  return p && p.draft ? p : null;
}

function showPlanProposal() {
  const log = q("#chatLog");
  const proposal = liveProposal();
  if (!log || !proposal) return;
  const existing = q("#" + PROPOSAL_CARD_ID);
  if (existing) existing.remove();
  log.insertAdjacentHTML("beforeend", renderPlanProposal(proposal));
  log.scrollTop = log.scrollHeight;
}

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min ago";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " hours ago";
  const days = Math.floor(hours / 24);
  return days + " days ago";
}

/* ── Main view rendering ───────────────────────────────────────────── */

export function assistant() {
  /* Only the open conversation renders: after "New" this is empty and the
     landing page below shows, while older conversations wait in Recents. */
  const msgs = Store.chat.activeMessages();
  const hasMsgs = msgs.length > 0;

  let h = '<div class="chat-area">';

  if (hasMsgs) {
    /* ── Active chat: scrollable messages ── */
    h += '<div class="chat-log" id="chatLog">';
    msgs.forEach(function (m) {
      h += msgHtml(m);
    });
    if (liveProposal()) h += renderPlanProposal(liveProposal());
    if (UIState.chatPending) h += TYPING_HTML;
    h += "</div>";

    /* ── Input pinned to absolute bottom ── */
    h += '<div class="chat-input-area">';
    h += renderInputPill();
    h += "</div>";
  } else {
    /* ── Landing page: Elicit-style search card + suggestions grid ── */
    h += renderElicitLanding();
  }

  h += "</div>";
  return h;
}

export function suggestions() {
  const out = [];
  const open = Tasks.ranked(Store.db.events.filter(Tasks.isOpen));
  if (open.length)
    out.push({
      label: "Help me understand " + open[0].title,
      q:
        'Explain what I need to do for "' +
        open[0].title +
        '" and break it into steps.',
    });
  const lesson = sortBy(
    Store.db.lessons.filter(function (l) {
      return l.week >= Coach.currentWeek();
    }),
    function (l) {
      return l.week;
    },
  )[0];
  if (lesson)
    out.push({
      label: "Explain this week's topic: " + lesson.topic.slice(0, 38),
      q: "Explain " + lesson.topic + " in simple terms with an example.",
    });
  const doc = Store.db.documents[0];
  if (doc)
    out.push({
      label: "Summarise " + doc.name.slice(0, 30),
      q:
        "Summarise the key ideas in " +
        doc.name +
        " and list the most likely exam questions.",
    });
  const exam = Store.db.events.filter(function (e) {
    return e.type === "exam" && Tasks.isOpen(e);
  })[0];
  if (exam)
    out.push({
      label: "Quiz me for " + exam.title,
      q:
        "Give me 5 practice questions to test myself for " +
        exam.title +
        ", then show the answers separately.",
    });
  out.push({ label: "Build my study plan", q: "__plan__" });
  return out;
}

/* ── model dropdown outside-click handler (kept across renders; see afterAssistant) ── */
let _modelDropdownCloser = null;

/** Reset module-level dropdown state — only for use in tests. */
export function resetModelDropdownState() {
  _modelDropdownCloser = null;
}

export function afterAssistant(root) {
  /* Reuse the previous outside-click closer so renders cannot stack listeners. */
  let outsideClickClose = _modelDropdownCloser;

  const log = q("#chatLog", root);
  if (log) log.scrollTop = log.scrollHeight;

  const ta = q("#chatInput", root);
  if (ta) {
    ta.focus();
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
    /* Toggle has-text on the pill (active chat) or the card (landing) */
    ta.addEventListener("input", function () {
      const hasText = ta.value.trim().length > 0;
      const pill = q("#chatInputBox", root);
      if (pill) pill.classList.toggle("has-text", hasText);
      const card = q(".elicit-card", root);
      if (card) card.classList.toggle("has-text", hasText);
    });
  }

  /* Model selector dropdown */
  const modelBtn = q("#btnModelSelect", root);
  const modelDrop = q("#modelDropdown", root);
  if (modelBtn && modelDrop) {
    modelBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      modelDrop.classList.toggle("open");
    });
    modelDrop.querySelectorAll(".model-option").forEach(function (opt) {
      opt.addEventListener("click", function () {
        /* Same save logic as the Settings form. */
        applyModel(opt.dataset.model);
        modelDrop.classList.remove("open");
        Router.render();
      });
    });
    /* Close the dropdown on any outside click. The handler is kept in a
       module variable, removed again on the next render, and removes
       itself once its dropdown is no longer in the document — otherwise
       one listener would accumulate per rebind for the life of the page. */
    if (outsideClickClose)
      document.removeEventListener("click", outsideClickClose);
    outsideClickClose = function () {
      if (!modelDrop.isConnected) {
        /* The view was torn down; retire this handler. */
        document.removeEventListener("click", outsideClickClose);
        _modelDropdownCloser = null;
        return;
      }
      modelDrop.classList.remove("open");
    };
    document.addEventListener("click", outsideClickClose);
    _modelDropdownCloser = outsideClickClose;
  } else if (outsideClickClose) {
    /* Dropdown not on screen: drop the stale handler. */
    document.removeEventListener("click", outsideClickClose);
    _modelDropdownCloser = null;
    outsideClickClose = null;
  }

  /* Microphone — Web Speech API */
  const micBtn = q("#btnMic", root);
  if (micBtn) {
    micBtn.addEventListener("click", function () {
      toggleSpeechRecognition(micBtn, ta);
    });
  }

  /* Send button click */
  const sendBtn = q(".pill-send", root);
  if (sendBtn) {
    sendBtn.addEventListener("click", function () {
      sendChat();
    });
  }
}

export function sendChat(forced) {
  const ta = q("#chatInput");
  const text = forced || (ta ? ta.value.trim() : "");
  if (!text) return;
  if (ta) ta.value = "";

  const pill = q("#chatInputBox");
  if (pill) pill.classList.remove("has-text");

  if (text === "__plan__") {
    requestStudyPlan();
    return;
  }

  if (UIState.chatPending) return;

  /* Duplicate-send guard: the last message of the conversation being
     written into — the open one, or the one this send is about to start. */
  const before = Store.chat.activeMessages();
  const lastMsg = before[before.length - 1];
  if (lastMsg && lastMsg.role === "user" && lastMsg.content === text) return;

  const userMsg = {
    id: uid("msg"),
    role: "user",
    content: text,
    ts: Date.now(),
  };
  /* The conversation this exchange belongs to: replies are filed into it
     even if the student presses New while the answer is still streaming. */
  const cid = Store.chat.append(userMsg);

  UIState.set("chatPending", true);

  appendMsg(userMsg);
  showTyping();

  /* Context for the model is the open conversation only: a question asked
     in a new chat must not carry the previous chat's history with it. */
  const chatHistory = Store.chat.activeMessages().slice(0, -1);
  const ctrl = beginAbort();
  answer(text, {
    k: 5,
    chatHistory,
    docIds: UIState.chatSources || [],
    signal: ctrl ? ctrl.signal : undefined,
    /* Tokens paint as they arrive; the settled message below replaces the
       provisional bubble with the citation-checked text. */
    onToken: function (_delta, total) {
      showLive(total);
    },
  })
    .then(function (res) {
      endAbort(ctrl);
      if (res && res.cancelled) {
        settleCancelled();
        return;
      }
      const aiMsg = {
        id: uid("msg"),
        role: "assistant",
        content: res.text,
        ts: Date.now(),
        citations: (res.sources || []).slice(0, 4),
        provenance: res.provenance || null,
        mode: res.mode,
        model: res.model || null,
      };
      Store.chat.appendTo(cid, aiMsg);
      UIState.set("chatPending", false);
      hideTyping();
      hideLive();
      appendMsg(aiMsg);

      // Show retrieval practice widget
      const ctx = RAG.context(text, {
        k: 5,
        docIds: UIState.chatSources || [],
      });
      const recallQuestions = generateRecallQuestions(ctx, 3);
      if (recallQuestions.length) {
        const log = q("#chatLog");
        if (log) {
          log.insertAdjacentHTML(
            "beforeend",
            renderRecallQuestions(recallQuestions),
          );
          log.scrollTop = log.scrollHeight;
        }
      }

      if (res.aiError)
        toast(
          res.aiError,
          "warn",
          "AI service busy - answered from your documents",
        );
    })
    .catch(function (e) {
      endAbort(ctrl);
      UIState.set("chatPending", false);
      hideTyping();
      hideLive();
      if (e && e.name === "AbortError") {
        settleCancelled();
        return;
      }
      const errMsg = {
        id: uid("msg"),
        role: "assistant",
        content: "Something went wrong answering that: " + (e.message || e),
        ts: Date.now(),
        mode: "offline",
      };
      Store.chat.appendTo(cid, errMsg);
      appendMsg(errMsg);
    });
}

export function requestStudyPlan() {
  const userMsg = {
    id: uid("msg"),
    role: "user",
    content: "Build me a personalised study plan for the coming weeks.",
    ts: Date.now(),
  };
  const cid = Store.chat.append(userMsg);
  UIState.set("chatPending", true);
  appendMsg(userMsg);
  showTyping();
  const ctrl = beginAbort();
  studyPlanProposal({
    signal: ctrl ? ctrl.signal : undefined,
    /* Only the non-agent planner path streams; StudyPlanAgent builds its own
       request options, so tool turns never paint here. */
    onToken: function (_delta, total) {
      showLive(total);
    },
  })
    .then(function (res) {
      endAbort(ctrl);
      if (res && res.cancelled) {
        settleCancelled();
        return;
      }
      const aiMsg = {
        id: uid("msg"),
        role: "assistant",
        content: res.text,
        ts: Date.now(),
        mode: res.mode,
      };
      Store.chat.appendTo(cid, aiMsg);
      UIState.set("chatPending", false);
      hideTyping();
      hideLive();
      appendMsg(aiMsg);
      /* A proposal is offered, never applied: the card below is where the
         student accepts, edits or rejects it. */
      if (res.draft) {
        UIState.set("planProposal", {
          draft: res.draft,
          exclude: [],
          ts: Date.now(),
        });
        showPlanProposal();
      }
      if (res.aiError)
        toast(
          "AI request failed, using the built-in planner. " + res.aiError,
          "warn",
        );
      else if (!res.draft)
        toast(
          "There was nothing to schedule, so no plan is proposed. Add tasks or study hours first.",
          "info",
        );
    })
    .catch(function (e) {
      endAbort(ctrl);
      UIState.set("chatPending", false);
      hideTyping();
      hideLive();
      if (e && e.name === "AbortError") {
        settleCancelled();
        return;
      }
      toast("Study plan request failed.", "bad");
    });
}

export const assistantView = {
  title: "AI study assistant",
  fn: assistant,
  after: afterAssistant,
};
