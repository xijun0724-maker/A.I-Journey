/**
 * Shared state and scope/filtering helpers for Journey A.I.
 *
 * Extracted from views/shared.js to break the core <-> views circular
 * dependency: core modules import from here instead of reaching into the
 * views layer.
 */

import { Store } from "./store.js";
import { Tasks } from "../domain/tasks.js";
import { sortBy } from "../utils/helpers.js";
import { toastSaved } from "../utils/dom.js";

const listeners = new Map();

function notify(path, value) {
  (listeners.get(path) || []).forEach(fn => {
    try { fn(value); } catch (e) { console.error("UIState listener error", e); }
  });
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  const root = { ...obj };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...cur[keys[i]] };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}

// Initial state
let _state = {
  view: "dashboard",
  courseId: "all",
  tab: {},
  chatPending: false,
  chatSources: [],
  /* A study plan the AI proposed and the student has not decided on yet.
     Deliberately not persisted: after a reload it is re-asked, not acted on. */
  planProposal: null,
  pendingPrompt: null,
  draft: null,
};

export const UIState = new Proxy(_state, {
  get(target, prop) {
    if (prop === "subscribe") return (path, fn) => {
      if (!listeners.has(path)) listeners.set(path, new Set());
      listeners.get(path).add(fn);
      return () => listeners.get(path).delete(fn);
    };
    if (prop === "set") return (path, value) => {
      _state = setPath(_state, path, value);
      notify(path, value);
      return _state;
    };
    /* Read the *live* root, not the proxy target. `setPath` replaces `_state`
       with a copy, so reading the target would silently return the pre-`set`
       value forever — `UIState.chatPending` always false, `plannerPreview`
       always undefined. */
    return _state[prop];
  },
  set(target, prop, value) {
    _state[prop] = value;
    notify(prop, value);
    return true;
  },
});

// Scope helpers (pure, no mutation)
export function courses() {
  let list = Store.db.courses.slice();
  if (UIState.courseId && UIState.courseId !== "all") list = list.filter((c) => c.id === UIState.courseId);
  return list;
}

export function courseIds() {
  return courses().map((c) => c.id);
}

export function inScope(obj) {
  if (UIState.courseId === "all") return true;
  return obj.courseId === UIState.courseId;
}

export function events(opts) {
  opts = opts || {};
  let list = Store.db.events.filter((e) => inScope(e));
  if (opts.status === "open") list = list.filter((e) => e.status !== "done");
  if (opts.status === "done") list = list.filter((e) => e.status === "done");
  return list;
}

export function lessons() {
  return sortBy(
    Store.db.lessons.filter(inScope),
    (l) => (l.start || "9999") + String(l.week).padStart(2, "0"),
  );
}

export function readings() {
  return Store.db.readings.filter(inScope);
}

export function docs() {
  return Store.db.documents.filter(inScope);
}

export function eventProgress(e) {
  return Tasks.progress(e);
}

/** View registry, populated by view modules. */
export const Views = {};

/**
 * Shared helper namespace reused by the app shell: one source of truth for
 * filtering, formatting, and toast confirmation.
 */
export const UI = {
  courses,
  inScope,
  events,
  readings,
  eventProgress,
  state: UIState,
  draft: null,
  toastSaved,
};