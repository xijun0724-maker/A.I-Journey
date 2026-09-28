import { CFG } from "../config/constants.js";
import { Store } from "../core/store.js";
import { UIState } from "../core/scope.js";
import { answer, studyPlanProposal, status } from "../ai/index.js";
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
import { truncate } from "./shared.js";

/* ── incremental chat rendering helpers ────────────────────────────── */

/*
 * Provenance line, not a confidence badge. Nothing here measures truth — a
 * percentage would calibrate the student on the machine's say-so. What can
 * be said honestly is where the text came from and whether it can be checked:
 * the band is capped at "supported" unless the answer carries at least one
 * citation that was validated against the retrieved passages.
 */
/* Provenance wording, shared by the transcript line and the screen-reader
   summary so one answer is never described two different ways. */
const PROV_LABELS = {
  grounded: "Grounded in your documents",
  supported: "Supported by your documents",
  weak: "From your documents, but uncited — verify before relying on it",
  ungrounded: "No matching passages — verify independently",
};

/** Say one line to assistive tech, through the shell's status region. */
function announce(text) {
  const sr = q("#srStatus");
  if (sr) sr.textContent = text;
}

function renderProvenance(p) {
  if (!p || !p.band) return ""; /* pre-migration messages: no line */
  const label = PROV_LABELS[p.band] || PROV_LABELS.ungrounded;
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
  /* A turn that could not be answered. Rendered as a failure rather than an
     answer — a raw provider string dressed as an assistant reply is
     indistinguishable from a real one in the transcript. */
  if (m.kind === "error") {
    return (
      '<div class="msg ai"><div class="msg-ai-body msg-error">' +
      "<p>" +
      esc(m.content) +
      "</p>" +
      '<button type="button" class="btn sm" data-act="chat-retry">Try again</button>' +
      "</div></div>"
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

/*
 * The landing page has no transcript to append into, so a send started there
 * has nothing to render into: the bubble, the dots and every streamed token
 * used to land nowhere while the answer ran. Paint the conversation the Store
 * just opened instead. Returns whether the view had to be rebuilt — when it
 * did, the fresh render already carries the bubble and the typing row.
 */
function ensureTranscript() {
  if (q("#chatLog")) return false;
  Router.render();
  return true;
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
      /* Only the half-written text is hidden from assistive tech: it is
         rewritten every 90ms, and the settled answer is announced once, in
         full, when it lands. The Stop control stays exposed, or the one way
         to cancel a running answer would be invisible to a screen reader. */
      '<div class="msg ai" id="' +
        LIVE_ID +
        '">' +
        '<div class="msg-ai-body" aria-hidden="true"></div>' +
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

/**
 * A model's display name and the detail in its parentheses. The parenthetical
 * is reference text (context size, modality): it belongs in the list, not in
 * a control that has to stay one line.
 */
function modelParts(m) {
  const label = String((m && m.label) || (m && m.id) || "");
  const open = label.indexOf("(");
  if (open === -1) return { name: label, note: "" };
  return {
    name: label.slice(0, open).trim(),
    note: label.slice(open + 1).replace(/\)\s*$/, "").trim(),
  };
}

function modelOptionHtml(m, current) {
  const parts = modelParts(m);
  const active = m.id === current;
  return (
    '<button type="button" class="model-option' +
    (active ? " active" : "") +
    '" aria-pressed="' +
    (active ? "true" : "false") +
    '" data-model="' +
    esc(m.id) +
    '">' +
    '<span class="model-dot"></span>' +
    '<span class="model-option-text"><span class="model-option-name">' +
    esc(parts.name) +
    "</span>" +
    (parts.note
      ? '<span class="model-option-note">' + esc(parts.note) + "</span>"
      : "") +
    "</span></button>"
  );
}

/*
 * One primary choice, everything else behind a disclosure.
 *
 * The picker used to open eight equal-weight rows plus a bare "Free" label on
 * the pill: a decision the app has no basis to hand a student, presented as if
 * it were theirs to make. The primary row is the router's own auto-selection
 * — the model the app already defaults to — and the rest stay one click away.
 * When a listed model is the current one the disclosure opens itself, so the
 * active choice is never hidden by the simplification.
 */
function renderModelSelector() {
  const s = Store.db.settings;
  const model = s.model || CFG.openrouter.model;
  const models = CFG.openrouter.freeModels;

  const current = models.find(function (m) {
    return m.id === model;
  });
  const pillLabel = current ? modelParts(current).name : "OpenRouter";

  const primary = models.find(function (m) {
    return m.id === CFG.openrouter.model;
  });
  const rest = models.filter(function (m) {
    return m !== primary;
  });
  const moreOpen = !!current && current !== primary;

  let h = '<div class="pill-model-wrap">';
  h +=
    '<button type="button" class="pill-model" id="btnModelSelect" aria-expanded="false" aria-controls="modelDropdown" aria-label="AI model: ' +
    esc(pillLabel) +
    ' — change">' +
    '<span class="pill-model-label">' +
    esc(pillLabel) +
    "</span></button>";
  h += '<div class="model-dropdown" id="modelDropdown">';
  h += '<div class="model-choices" role="group" aria-label="AI model">';
  if (primary) h += modelOptionHtml(primary, model);
  h +=
    '<button type="button" class="model-more" id="btnMoreModels" aria-expanded="' +
    (moreOpen ? "true" : "false") +
    '" aria-controls="modelMoreList">More models' +
    '<span class="model-more-count">' +
    rest.length +
    "</span></button>";
  h +=
    '<div class="model-more-list" id="modelMoreList"' +
    (moreOpen ? "" : " hidden") +
    ">";
  rest.forEach(function (m) {
    h += modelOptionHtml(m, model);
  });
  h += "</div></div></div></div>";
  return h;
}

/* ── Speech recognition ────────────────────────────────────────────── */

let recognition = null;

/* Failure wording for the codes the Web Speech API actually reports. A raw
   code ("not-allowed") names nothing and suggests no recovery. */
const MIC_ERRORS = {
  "not-allowed":
    "Microphone access is blocked. Allow it in your browser to dictate a question.",
  "service-not-allowed":
    "Microphone access is blocked. Allow it in your browser to dictate a question.",
  network: "Voice input needs a network connection.",
  "audio-capture": "No microphone was found.",
  aborted: "Voice input stopped.",
};

function setListening(micBtn, on) {
  micBtn.classList.toggle("listening", on);
  micBtn.setAttribute("aria-pressed", on ? "true" : "false");
  micBtn.setAttribute("aria-label", on ? "Stop voice input" : "Voice input");
}

function toggleSpeechRecognition(micBtn, textarea) {
  if (recognition) {
    recognition.stop();
    recognition = null;
    setListening(micBtn, false);
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

  setListening(micBtn, true);

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
    setListening(micBtn, false);
    recognition = null;
  };

  recognition.onerror = function (e) {
    setListening(micBtn, false);
    recognition = null;
    if (e.error === "no-speech") return; /* nothing was said: not a failure */
    toast(MIC_ERRORS[e.error] || "Voice input failed: " + e.error, "warn");
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
    '<button type="button" class="pill-mic" id="btnMic" aria-label="Voice input" aria-pressed="false">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">' +
    '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>' +
    '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
    '<line x1="12" y1="19" x2="12" y2="23"/>' +
    '<line x1="8" y1="23" x2="16" y2="23"/>' +
    "</svg>" +
    "</button>";

  h +=
    '<button type="button" class="pill-send" data-act="chat-send" aria-label="Send message" disabled>' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">' +
    '<line x1="12" y1="19" x2="12" y2="5"/>' +
    '<polyline points="5 12 12 5 19 12"/>' +
    "</svg>" +
    "</button>";

  h += "</div>"; /* .pill-right */
  h += "</div>"; /* .chat-input-pill */
  return h;
}

/* ── Landing: search card + suggestions, with or without a term ──
   An empty term used to hide chat behind an import-only card. The landing is
   the front door now: ask first, import whenever there is a syllabus. */

function renderElicitLanding() {
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
    '<button type="button" class="elicit-send" data-act="chat-send" aria-label="Send message" disabled>' +
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
    cards.push({
      badge: "resume",
      text: truncate(resume.title, 60),
      /* The card truncates the title, so the accessible name carries it whole. */
      full: resume.title,
      meta: timeAgo(resume.ts) || null,
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
       whatever conversation is open. These are real buttons: as divs they
       were reachable only with a mouse, so the front door of the product was
       closed to keyboard and screen-reader users. */
    h += c.cid
      ? '<button type="button" class="elicit-suggestion-card" data-act="chat-open" data-cid="' +
        esc(c.cid) +
        '" aria-label="Resume: ' +
        esc(c.full || c.text) +
        '">'
      : '<button type="button" class="elicit-suggestion-card" data-act="chat-suggest" data-q="' +
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
    h += '<span class="elicit-card-text">' + esc(c.text) + "</span>";

    /* Metadata (only for resume cards) */
    if (c.meta) {
      h += '<span class="elicit-card-meta">';
      h += '<span class="elicit-dot"></span>';
      h += "<span>" + esc(c.meta) + "</span>";
      h += "</span>";
    }

    h += "</button>";
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
  if (mins < 60) return ago(mins, "min");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return ago(hours, "hour");
  return ago(Math.floor(hours / 24), "day");
}

function ago(n, unit) {
  return n + " " + unit + (n === 1 ? "" : "s") + " ago";
}

/* ── Pane header ─────────────────────────────────────────────────────
 *
 * Every other view answers "where am I?" with a page head; the transcript
 * answered it only in the sidebar. This is the compact ruled version of that
 * frame: which conversation is open, whether a provider is answering, and any
 * document scope the question is limited to.
 *
 * The scope chip is the only visible trace of Library → "Ask this document".
 * Without it a student cannot tell that their next questions are limited to
 * one file, and had no way to lift the limit.
 */

/** Names of the documents the next question is limited to. */
function chatSourceNames() {
  return (UIState.chatSources || [])
    .map(function (id) {
      const doc = Store.documents.get(id);
      return doc ? doc.name : null;
    })
    .filter(Boolean);
}

function renderChatHead() {
  const msgs = Store.chat.activeMessages();
  const scope = chatSourceNames();
  if (!msgs.length && !scope.length) return ""; /* nothing to report */

  const open = Store.chat.activeId();
  const convo = Store.chat.conversations().find(function (c) {
    return c.cid === open;
  });
  const st = status();

  let h = '<div class="chat-head">';
  if (msgs.length) {
    const title = (convo && convo.title) || "Conversation";
    h +=
      '<h1 class="chat-title" title="' +
      esc(title) +
      '">' +
      esc(title) +
      "</h1>";
  }
  h += '<span class="spacer"></span>';
  if (scope.length) {
    h +=
      '<span class="badge info chat-scope" role="status">Asking about: ' +
      esc(scope.join(", ")) +
      "</span>" +
      '<button type="button" class="btn sm ghost" data-act="chat-scope-clear" title="Ask about all your materials again">Clear</button>';
  }
  /* Same words as Settings, so the two surfaces cannot disagree. */
  h +=
    '<span class="badge ' +
    (st.on ? "ok" : "mute") +
    '">' +
    esc(st.on ? "connected: " + st.label : "offline mode") +
    "</span>";
  return h + "</div>";
}

/* ── Main view rendering ───────────────────────────────────────────── */

export function assistant() {
  /* Only the open conversation renders: after "New" this is empty and the
     landing page below shows, while older conversations wait in Recents. */
  const msgs = Store.chat.activeMessages();
  const hasMsgs = msgs.length > 0;

  let h = '<div class="chat-area">';
  h += renderChatHead();

  if (hasMsgs) {
    /* ── Active chat: scrollable messages ──
       A live log, not a silent div: an answer that arrives without being
       announced leaves a screen-reader user waiting on nothing. */
    h +=
      '<div class="chat-log" id="chatLog" role="log" aria-live="polite" aria-relevant="additions">';
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
      label: "Explain this week's topic: " + truncate(lesson.topic, 38),
      q: "Explain " + lesson.topic + " in simple terms with an example.",
    });
  const doc = Store.db.documents[0];
  if (doc)
    out.push({
      label: "Summarise " + truncate(doc.name, 30),
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

/** Reset module-level view state (dropdown closer + composer draft) — tests only. */
export function resetModelDropdownState() {
  _modelDropdownCloser = null;
  composerDraft = "";
}

/* The composer's text, kept across the re-renders the view does not own —
   picking a model repaints everything, and used to erase a half-written
   question. Session-only, like the conversation state beside it. */
let composerDraft = "";

/**
 * Reflect the composer's text in the controls around it: the accent on the
 * pill or card, and whether Send is an action at all. An empty send used to
 * be a silent no-op behind a button that looked fully live.
 */
function syncComposer(root) {
  const host = root && root.querySelectorAll ? root : document;
  const ta = q("#chatInput", host);
  const hasText = String(ta ? ta.value : composerDraft).trim().length > 0;

  const pill = q("#chatInputBox", host);
  if (pill) pill.classList.toggle("has-text", hasText);
  const card = q(".elicit-card", host);
  if (card) card.classList.toggle("has-text", hasText);

  host.querySelectorAll('[data-act="chat-send"]').forEach(function (btn) {
    btn.disabled = !hasText;
  });
}

export function afterAssistant(root) {
  /* Reuse the previous outside-click closer so renders cannot stack listeners. */
  let outsideClickClose = _modelDropdownCloser;

  const log = q("#chatLog", root);
  if (log) log.scrollTop = log.scrollHeight;

  const ta = q("#chatInput", root);
  if (ta) {
    /* Restore what was typed here before this render rebuilt the DOM. */
    if (composerDraft) ta.value = composerDraft;
    ta.focus();
    ta.addEventListener("keydown", function (e) {
      /* isComposing: Enter commits an IME candidate, it does not send. */
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendChat();
      }
    });
    ta.addEventListener("input", function () {
      composerDraft = ta.value;
      syncComposer(root);
    });
    syncComposer(root);
  }

  /* Model selector dropdown */
  const modelBtn = q("#btnModelSelect", root);
  const modelDrop = q("#modelDropdown", root);
  if (modelBtn && modelDrop) {
    const options = Array.prototype.slice.call(
      modelDrop.querySelectorAll(".model-option"),
    );
    const moreBtn = q("#btnMoreModels", root);
    const moreList = q("#modelMoreList", root);
    /* Roving focus skips the folded-away rows: arrowing into a model the
       student cannot see would be a focus trap with no visible position. */
    const shown = function () {
      return options.filter(function (o) {
        return !o.closest("[hidden]");
      });
    };
    const setOpen = function (open) {
      modelDrop.classList.toggle("open", open);
      modelBtn.setAttribute("aria-expanded", String(open));
    };
    const focusAt = function (from, step) {
      const list = shown();
      if (!list.length) return;
      const base = from < 0 ? (step > 0 ? -1 : 0) : from;
      const target = list[(base + step + list.length) % list.length];
      if (target) target.focus();
    };

    modelBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(!modelDrop.classList.contains("open"));
    });
    /* Keyboard, so the choice does not require a mouse. */
    modelBtn.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      setOpen(true);
      focusAt(-1, e.key === "ArrowDown" ? 1 : -1);
    });
    modelDrop.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        setOpen(false);
        modelBtn.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      focusAt(
        shown().indexOf(document.activeElement),
        e.key === "ArrowDown" ? 1 : -1,
      );
    });
    /* The disclosure: the rest of the catalogue, opened on request. */
    if (moreBtn && moreList) {
      moreBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const open = !moreList.hidden;
        moreList.hidden = open;
        moreBtn.setAttribute("aria-expanded", String(!open));
        /* Collapsing under the focus would strand it on a hidden control. */
        if (open && moreList.contains(document.activeElement)) moreBtn.focus();
      });
    }
    options.forEach(function (opt) {
      opt.addEventListener("click", function () {
        /* Same save logic as the Settings form. */
        applyModel(opt.dataset.model);
        setOpen(false);
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
      setOpen(false);
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
}

function runAssistantRequest(opts) {
  const userMsg = {
    id: uid("msg"),
    role: "user",
    content: opts.text,
    ts: Date.now(),
  };
  /* The conversation this exchange belongs to: replies are filed into it
     even if the student presses New while the answer is still streaming. */
  const cid = Store.chat.append(userMsg);

  UIState.set("chatPending", true);

  /* From the landing there is no transcript to append into: the view is
     repainted with the conversation the Store just opened, which is what
     makes the send visible — and gives the stream somewhere to land. */
  if (!ensureTranscript()) {
    appendMsg(userMsg);
    showTyping();
  }

  const ctrl = beginAbort();
  /* `answered` tracks the request, not the rendering: once the model has
     answered, a throw inside post-processing must not be reported as a failed
     request — the answer is already on screen, and appending "I could not
     produce an answer" beneath it would contradict the transcript. Routed
     through Promise.resolve() so a synchronously-throwing `call` lands in the
     same catch instead of escaping before cleanup. */
  let answered = false;
  Promise.resolve()
    .then(function () {
      return opts.call({
        signal: ctrl ? ctrl.signal : undefined,
        /* Tokens paint as they arrive; the settled message below replaces the
           provisional bubble with the citation-checked text. */
        onToken: function (_delta, total) {
          showLive(total);
        },
      });
    })
    .then(function (res) {
      endAbort(ctrl);
      if (res && res.cancelled) {
        settleCancelled();
        return;
      }
      UIState.set("chatPending", false);
      hideTyping();
      hideLive();
      answered = true;
      opts.onResult(res, cid);
    })
    .catch(function (e) {
      endAbort(ctrl);
      UIState.set("chatPending", false);
      hideTyping();
      hideLive();
      if (answered) {
        console.error("Journey A.I: could not post the assistant reply:", e);
        return;
      }
      if (e && e.name === "AbortError") {
        settleCancelled();
        return;
      }
      /* Nothing awaits this chain, so a throw here would surface as an
         unhandled rejection rather than the toast onError is meant to raise. */
      try {
        opts.onError(e, cid);
      } catch (err) {
        console.error("Journey A.I: assistant error handler failed:", err);
      }
    });
}

export function sendChat(forced) {
  const ta = q("#chatInput");
  const text = forced || (ta ? ta.value.trim() : "");
  if (!text) return;
  if (ta) ta.value = "";
  composerDraft = "";
  syncComposer();

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

  runAssistantRequest({
    text,
    /* Context for the model is the open conversation only: a question asked
       in a new chat must not carry the previous chat's history with it. */
    call: (o) =>
      answer(text, {
        k: 5,
        chatHistory: Store.chat.activeMessages().slice(0, -1),
        docIds: UIState.chatSources || [],
        ...o,
      }),
    onResult: function (res, cid) {
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
      appendMsg(aiMsg);
      const band = res.provenance && res.provenance.band;
      announce(
        "Answer ready." + (band && PROV_LABELS[band] ? " " + PROV_LABELS[band] : ""),
      );

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
    },
    onError: function (e, cid) {
      /* The provider's own words ("Failed to fetch") name nothing a student
         can act on, so the transcript gets an honest failure line and the
         console keeps the diagnosis. */
      if (typeof console !== "undefined" && console.error)
        console.error("Journey A.I: answer failed:", e);
      const errMsg = {
        id: uid("msg"),
        role: "assistant",
        kind: "error",
        content:
          "I could not produce an answer for that question. Try it again, or rephrase it.",
        ts: Date.now(),
      };
      Store.chat.appendTo(cid, errMsg);
      appendMsg(errMsg);
      announce("No answer arrived. " + errMsg.content);
    },
  });
}

/**
 * Ask the open conversation's last question again after a failed answer —
 * the recovery the failure row offers, instead of leaving the student to
 * retype a question that is already in the transcript.
 */
export function retryLastQuestion() {
  const msgs = Store.chat.activeMessages();
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user" && msgs[i].content) {
      return sendChat(msgs[i].content);
    }
  }
  toast("There is no question here to ask again.", "info");
  return false;
}

export function requestStudyPlan() {
  runAssistantRequest({
    text: "Build me a personalised study plan for the coming weeks.",
    /* Only the non-agent planner path streams; StudyPlanAgent builds its own
       request options, so tool turns never paint here. */
    call: studyPlanProposal,
    onResult: function (res, cid) {
      const aiMsg = {
        id: uid("msg"),
        role: "assistant",
        content: res.text,
        ts: Date.now(),
        mode: res.mode,
      };
      Store.chat.appendTo(cid, aiMsg);
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
        announce(
          "Study plan proposed: " +
            res.draft.planItems.length +
            " blocks. Nothing is saved until you accept.",
        );
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
    },
    onError: function () {
      toast("Study plan request failed.", "bad");
    },
  });
}

export const assistantView = {
  fn: assistant,
  after: afterAssistant,
};
