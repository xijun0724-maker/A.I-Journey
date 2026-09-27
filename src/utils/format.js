/**
 * UI formatting utilities for Journey A.I
 * HTML generation helpers, badges, progress bars, and UI components.
 * These are pure string-returning helpers with no side effects.
 */

import { CFG } from "../config/constants.js";
import { Store } from "../core/store.js";
import { esc, clamp, safeColor } from "./helpers.js";
import { daysUntil, fmtDate, rel } from "./date.js";

/**
 * Generate a progress bar HTML
 * @param {number} pct - Percentage (0-100)
 * @param {string} cls - CSS class (ok, warn, bad)
 * @returns {string} HTML string
 */
export function bar(pct, cls) {
  const v = clamp(pct, 0, 100);
  return (
    '<div class="bar ' +
    (cls || "") +
    '" role="progressbar" aria-valuenow="' +
    v +
    '" aria-valuemin="0" aria-valuemax="100" aria-label="' +
    v +
    '% complete"><i data-style="--progress:' +
    v / 100 +
    '"></i></div>'
  );
}

/**
 * Generate a circular progress ring HTML
 * @param {number} pct - Percentage (0-100)
 * @returns {string} HTML string
 */
export function ring(pct) {
  pct = Math.round(pct);
  return (
    '<div class="ring" data-style="--p:' +
    pct +
    '" role="progressbar" aria-valuenow="' +
    pct +
    '" aria-valuemin="0" aria-valuemax="100" aria-label="' +
    pct +
    '% complete"><span>' +
    pct +
    "%</span></div>"
  );
}

/**
 * Generate an empty state placeholder
 * @param {string} icon - Icon character
 * @param {string} title - Title text
 * @param {string} msg - Message text
 * @param {string} actionHtml - Action button HTML
 * @returns {string} HTML string
 */
export function empty(icon, title, msg, actionHtml) {
  return (
    '<div class="empty">' +
    (icon ? '<div class="big">' + esc(icon) + "</div>" : "") +
    "<h3>" +
    esc(title) +
    "</h3>" +
    (msg ? '<p class="small">' + esc(msg) + "</p>" : "") +
    (actionHtml || "") +
    "</div>"
  );
}

/**
 * Generate a priority badge HTML
 * @param {string} label - Priority label (Critical, High, Medium, Low)
 * @returns {string} HTML string
 */
export function priBadge(label) {
  const cls =
    { Critical: "crit", High: "high", Medium: "med", Low: "low" }[label] ||
    "mute";
  return '<span class="badge ' + cls + '">' + esc(label) + "</span>";
}

/**
 * Generate a to-do progress status badge HTML
 * @param {Object} e - Event / task object
 * @returns {string} HTML string
 */
export function statusBadge(e) {
  if (!e) return "";
  const isDone = e.status === "done";
  if (isDone) {
    return '<span class="todo-badge status-done" title="Status: Completed">Completed</span>';
  }
  if (e.status === "doing") {
    const s = e.subtasks || [];
    const done = s.filter((x) => x.done).length;
    const pct = s.length ? Math.round((done / s.length) * 100) : 0;
    const label = pct > 0 && pct < 100 ? "In progress · " + pct + "%" : "In progress";
    return (
      '<span class="todo-badge status-doing" title="Status: In progress">' +
      esc(label) +
      "</span>"
    );
  }
  return '<span class="todo-badge status-todo" title="Status: Not started">Not started</span>';
}

/**
 * Generate an event status badge HTML
 * @param {Object} e - Event object
 * @returns {string} HTML string
 */
export function eventBadge(e) {
  const m = CFG.taskTypes[e.type] || { label: e.type || "Task" };
  const n = daysUntil(e.due);
  let cls = "mute",
    txt = m.label;

  if (e.status === "done") {
    cls = "ok";
    txt = "Completed";
  } else if (n !== null && n < 0) {
    cls = "crit";
    txt = "Overdue " + Math.abs(n) + "d";
  } else if (n === 0) {
    cls = "crit";
    txt = "Due today";
  } else if (n <= 3) {
    cls = "high";
    txt = "Due in " + n + "d";
  } else if (n <= 7) {
    cls = "info";
    txt = "Due in " + n + "d";
  } else {
    txt = m.label;
  }

  return '<span class="badge ' + cls + '">' + esc(txt) + "</span>";
}

/**
 * Generate a course chip with color dot
 * @param {string} courseId - Course ID
 * @returns {string} HTML string
 */
export function courseChip(courseId) {
  const c = Store.course(courseId);
  if (!c) return "";
  return (
    '<span class="tag"><span class="dot" data-style="background:' +
    (safeColor(c.color) || "var(--primary)") +
    '"></span> ' +
    esc(c.code || c.title) +
    "</span>"
  );
}

/**
 * Generate a due date label with relative time
 * @param {string} iso - ISO date string
 * @returns {string} HTML string
 */
export function dueLabel(iso) {
  const d = new Date(iso);
  if (!d || isNaN(d.getTime())) return '<span class="muted">No date set</span>';
  const n = daysUntil(iso);
  const cls =
    n < 0
      ? "badge crit"
      : n <= 3
        ? "badge high"
        : n <= 7
          ? "badge info"
          : "badge mute";
  return (
    '<span class="' +
    cls +
    '">' +
    fmtDate(iso) +
    '</span> <span class="tiny muted">' +
    rel(iso) +
    "</span>"
  );
}

/**
 * Generate a stat box card
 * @param {string|number} value - Stat value
 * @param {string} label - Stat label
 * @returns {string} HTML string
 */
/**
 * One-line provenance for a plan: who drafted it, from what, at what cost.
 * Honest by construction - an offline draft never claims an AI wrote it.
 *
 * @param {object} [prov] - meta.provenance written by AI.studyPlanProposal
 * @returns {string} Plain sentence ("") when there is no provenance to show
 */
export function planProvenance(prov) {
  if (!prov) return "";
  const ai = prov.mode === "ai";
  const who = ai
    ? "Drafted by the AI" + (prov.model ? " (" + prov.model + ")" : "")
    : "Drafted by the built-in planner, not by an AI";
  const tools = (prov.tools || []).filter(Boolean);
  const read = tools.length
    ? " after reading your term with " +
      tools.length +
      " tool" +
      (tools.length === 1 ? "" : "s") +
      " (" +
      tools.join(", ") +
      ")"
    : "";
  const calls = prov.calls
    ? ", " + prov.calls + " model call" + (prov.calls === 1 ? "" : "s")
    : "";
  return who + read + calls + ".";
}

export function statBox(value, label, detail, tone) {
  /* The tone palette is fixed, so the colour is a class — no dynamic value,
     no data-style. Unknown tones render unstyled rather than guessed. */
  const tones = new Set(["bad", "ok", "info", "warn"]);
  const vClass = tones.has(tone) ? " u-tone-" + tone : "";
  return (
    '<div class="card pad-sm"><div class="kpi"><div class="v' +
    vClass +
    '">' +
    value +
    '</div><div class="k">' +
    esc(label) +
    "</div>" +
    (detail ? '<div class="d muted">' + esc(detail) + "</div>" : "") +
    "</div></div>"
  );
}

/**
 * Generate a tab button with ARIA attributes
 * @param {string} id - Tab ID
 * @param {string} label - Tab label
 * @param {boolean} active - Whether this tab is active
 * @param {string} viewName - View name for data-view attribute
 * @returns {string} HTML string
 */
export function tabBtn(id, label, active, viewName) {
  return (
    '<button data-act="tab" data-view="' +
    esc(viewName) +
    '" data-arg="' +
    esc(id) +
    '" role="tab" aria-selected="' +
    (active ? "true" : "false") +
    '" class="' +
    (active ? "active" : "") +
    '">' +
    esc(label) +
    "</button>"
  );
}

/* ── Sidebar Recents ───────────────────────────────────────────────
   One implementation shared by the sidebar renderer and the chat search,
   so both escape through esc() and both agree on what a row looks like.
   Rows are conversations (Store.chat.conversations()), not prompts: one
   chat in the transcript is one row in the list, the way a chat product
   lists its conversations. */

const RECENT_MAX = 5;
const RECENT_LABEL_CHARS = 28;

/**
 * Build Recents row markup. Each row opens its conversation; the open
 * conversation carries the active pill.
 * @param {Array} conversations - Result of Store.chat.conversations()
 * @param {Object} opts - { activeCid }
 * @returns {string} HTML string
 */
export function recentsHTML(conversations, opts) {
  const o = opts || {};
  return (conversations || [])
    .map(function (c) {
      const full = String(c.title == null ? "" : c.title);
      const text =
        full.length > RECENT_LABEL_CHARS
          ? full.slice(0, RECENT_LABEL_CHARS) + "\u2026"
          : full;
      const active = o.activeCid && c.cid === o.activeCid;
      return (
        '<div class="recent-chat-item">' +
        '<button class="recent-chat-link' +
        (active ? " active" : "") +
        '" data-act="chat-open" data-cid="' +
        esc(c.cid) +
        '"' +
        (active ? ' aria-current="true"' : "") +
        ">" +
        esc(text) +
        "</button>" +
        '<button class="recent-chat-remove" data-act="chat-remove-recent" data-cid="' +
        esc(c.cid) +
        '" aria-label="Remove">&times;</button>' +
        "</div>"
      );
    })
    .join("");
}

/**
 * Render the Recents list into a container.
 * @param {Element} list - Container element
 * @param {Array} conversations - Conversations, newest first
 * @param {Object} opts - { limit, activeCid, emptyLabel }
 * @returns {number} Rows rendered
 */
export function renderRecents(list, conversations, opts) {
  if (!list) return 0;
  const o = opts || {};
  const all = conversations || [];
  /* limit 0 means no limit (the sidebar search shows every hit). */
  const rows =
    o.limit == null
      ? all.slice(0, RECENT_MAX)
      : o.limit === 0
        ? all
        : all.slice(0, o.limit);
  if (!rows.length) {
    list.innerHTML = o.emptyLabel
      ? '<div class="sb-section-label">' + esc(o.emptyLabel) + "</div>"
      : "";
    return 0;
  }
  list.innerHTML = recentsHTML(rows, o);
  return rows.length;
}
