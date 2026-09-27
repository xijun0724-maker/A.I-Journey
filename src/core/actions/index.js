/**
 * Action dispatch layer for Journey A.I
 * Maps data-act attributes to handlers, with a registered-actions guard
 * so mistyped or stale data-act values warn in development rather than
 * silently doing nothing.
 *
 * Domain-specific handlers are split into sub-modules under ./actions/.
 * View-layer functions (modals, assistant) are loaded via late dynamic
 * imports to keep the core -> views dependency direction clean.
 */

import { Store } from "../store.js";
import { UIState } from "../state.js";
import { Router } from "../router.js";
import { toast } from "../../utils/dom.js";
import { toggleSidebarChatSearch } from "../../app/chrome.js";
import { RAG } from "../../domain/rag.js";
import { NLP } from "../../domain/nlp.js";
import {
  deleteCourse,
  deleteDocument,
  toggleLesson,
  toggleStarCourse,
  toggleRemoveFromView,
  loadMoodleSample,
} from "./courses.js";
import { toggleTask, toggleSubtask, toggleReading, deleteTask } from "./tasks.js";
import { exportData, exportRoadmap } from "./exports.js";
import { saveSettings, testAI, clearApiKeyFn } from "./settings.js";
import { importData, commitDraft, cancelDraft } from "./import.js";
import { loadTermSyllabi } from "./term.js";
import {
  generatePlan,
  applyPlanSettings,
  clearPlan,
  togglePlanItem,
  resetData,
  loadDemo,
  reindexFn,
  cancelPlanPreview,
  commitPlanPreview,
  acceptPlanProposal,
  editPlanProposal,
  rejectPlanProposal,
  toggleProposalExclusion,
  togglePlanCompletedFilter,
  togglePlanReviewsFilter,
  showPlanActiveFilter,
} from "./planner.js";

/**
 * Direct-action handlers: name and behaviour in one table.
 *
 * These were previously a name list plus a parallel if-ladder inside `act()`,
 * so adding one meant editing two registries nothing kept in sync. Each
 * handler receives a context `{ el, arg, id }` — the same facts the ladder
 * read off the element — so the name and its implementation share a home.
 */

/** Sidebar / hash navigation, shared by `nav` and `view`. */
function directRoute({ arg }) {
  if (arg === "courses") {
    UIState.set("tab.courses", "courses");
    UIState.set("tab.roadmap", "courses");
  } else if (arg === "roadmap") {
    UIState.set("tab.courses", "roadmap");
    UIState.set("tab.roadmap", "roadmap");
  }
  return Router.navigate(arg || "dashboard");
}

/** Open a course's roadmap, shared by `course-view` and `course-open-roadmap`. */
function directCourseRoadmap({ id }) {
  if (id) UIState.set("courseId", id);
  UIState.set("tab.courses", "roadmap");
  UIState.set("tab.roadmap", "roadmap");
  if (UIState.view !== "courses" && UIState.view !== "roadmap") {
    Router.navigate("courses");
  } else {
    Router.scheduleRender();
  }
}

const DIRECT_HANDLERS = Object.freeze({
  nav: directRoute,
  view: directRoute,
  "go-import": () => Router.navigate("import"),
  ask: ({ arg }) => {
    Router.navigate("assistant");
    requestAnimationFrame(async () => {
      const { sendChat } = await import("../../views/assistant.js");
      sendChat(arg);
    });
  },
  tab: ({ el, arg }) => {
    const v = el?.dataset?.view;
    if (v && arg) {
      UIState.set(`tab.${v}`, arg);
      if (v === "courses" || v === "roadmap") {
        UIState.set("tab.courses", arg);
        UIState.set("tab.roadmap", arg);
      }
      Router.scheduleRender();
    }
  },
  "course-view": directCourseRoadmap,
  "course-open-roadmap": directCourseRoadmap,
  "roadmap-view": ({ el }) => {
    const v = el?.dataset?.view || "tree";
    UIState.set("roadmapView", v);
    Router.scheduleRender();
  },
  "scope-course": ({ id }) => {
    UIState.set("courseId", id || "all");
    Router.scheduleRender();
  },
  "scope-clear": () => {
    UIState.set("courseId", "all");
    Router.scheduleRender();
  },
  "scope-clear-to-courses": () => {
    UIState.set("courseId", "all");
    UIState.set("tab.courses", "courses");
    UIState.set("tab.roadmap", "courses");
    Router.scheduleRender();
  },
  "task-ask": ({ id }) => {
    Router.navigate("assistant");
    const ev = Store.db.events.find((e) => e.id === id);
    if (ev)
      requestAnimationFrame(async () => {
        const { sendChat } = await import("../../views/assistant.js");
        sendChat(
          'Help me understand "' +
            String(ev.title || "").replace(/["'`]/g, "") +
            '"',
        );
      });
  },
  "cal-prev": () => {
    import("../../views/calendar.js").then((m) => m.stepCalendarMonth(-1));
  },
  "cal-next": () => {
    import("../../views/calendar.js").then((m) => m.stepCalendarMonth(1));
  },
  "cal-today": () => {
    import("../../views/calendar.js").then((m) => m.jumpToToday());
  },
  "cal-day-view": ({ el }) => {
    const dStr = el?.dataset?.date;
    if (dStr) {
      import("../../views/calendar.js").then((m) => m.showDayEventsModal(dStr));
    }
  },
  "cal-day-new": ({ el }) => {
    const dStr = el?.dataset?.date;
    return _modal("eventModal", null, dStr ? { due: dStr } : {});
  },
});

/**
 * Context-free handlers: a frozen map shared by every dispatch.
 *
 * Split out of `buildDispatch` so a click does not re-allocate ~40 stable
 * function references, and so the shape of the action surface is inspectable
 * without inventing a fake `el`/`arg`/`id`. Context handlers (modals, toggles
 * that close over the element) live in `buildDispatch` below.
 */
const STATIC_HANDLERS = Object.freeze({
  "settings-save": saveSettings,
  "data-export": exportData,
  "data-import": importData,
  "data-reset": resetData,
  "demo-load": loadDemo,
  "load-moodle-sample": loadMoodleSample,
  "term-load": loadTermSyllabi,
  reindex: reindexFn,
  "ai-test": testAI,
  "ai-key-clear": clearApiKeyFn,
  "new-course": () => _modal("courseModal"),
  "lesson-new": () => _modal("lessonModal"),
  "task-new": () => _modal("eventModal"),
  "reading-new": () => _modal("readingModal"),
  "chat-send": async () => {
    const { sendChat } = await import("../../views/assistant.js");
    sendChat();
  },
  "chat-stop": async () => {
    const { abortPending } = await import("../../views/assistant.js");
    if (!abortPending()) toast("Nothing is running.", "info");
  },
  "chat-new": () => {
    Router.navigate("assistant");
  },
  "chat-search": toggleSidebarChatSearch,
  "plan-generate": generatePlan,
  "plan-settings-apply": applyPlanSettings,
  "plan-clear": clearPlan,
  "plan-toggle-completed": togglePlanCompletedFilter,
  "plan-toggle-reviews": togglePlanReviewsFilter,
  "plan-show-active": showPlanActiveFilter,
  "plan-preview-cancel": cancelPlanPreview,
  "plan-preview-commit": commitPlanPreview,
  "plan-proposal-accept": acceptPlanProposal,
  "plan-proposal-edit": editPlanProposal,
  "plan-proposal-reject": rejectPlanProposal,
  "draft-commit": commitDraft,
  "draft-cancel": cancelDraft,
  "export-roadmap": exportRoadmap,
});

/**
 * Warn when a data-act value has no handler, so a typo or stale attribute is
 * loud instead of a dead button. The set is derived, so this only fires for
 * names the dispatcher genuinely cannot serve.
 *
 * @param {string} action - The data-act value
 */
function _assertKnown(action) {
  if (
    !KNOWN_ACTIONS.has(action) &&
    typeof console !== "undefined" &&
    console.warn
  ) {
    console.warn(
      'Journey A.I: unknown action "' +
        action +
        '" - check the data-act attribute.',
    );
  }
}

function act(action, el) {
  _assertKnown(action);
  const arg = el?.dataset?.arg || el?.dataset?.id || null;
  const id = el?.dataset?.id || null;

  // Direct actions carry their own behaviour; the table is the source of truth.
  const direct = DIRECT_HANDLERS[action];
  if (direct) return direct({ el, arg, id });

  const dispatch = buildDispatch(el, arg, id);
  const handler = dispatch[action];
  if (handler) return handler();
}

/**
 * Context-dependent actions: name → factory `(el, arg, id) => handler`.
 *
 * Frozen so the action surface cannot grow a runtime-only alias, and so
 * `KNOWN_ACTIONS` can list the keys without building closures. Each dispatch
 * still calls the factory once for the live element.
 */
const CONTEXT_HANDLERS = Object.freeze({
  "course-image-modal": (el, arg, id) => () => _modal("courseImageModal", id),
  "academic-calendar-modal": (el, arg, id) => () =>
    _modal("academicCalendarModal", id),
  "edit-course": (el, arg, id) => () => _modal("courseModal", id),
  "toggle-star-course": (el, arg, id) => () => toggleStarCourse(id),
  "toggle-remove-view-course": (el, arg, id) => () => toggleRemoveFromView(id),
  "del-course": (el, arg, id) => () => deleteCourse(id),
  "event-edit": (el, arg, id) => () => _modal("eventModal", id),
  "lesson-edit": (el, arg, id) => () => _modal("lessonModal", id),
  "lesson-toggle": (el, arg, id) => () => toggleLesson(id),
  "view-doc": (el, arg, id) => () => _modal("docModal", id),
  "del-doc": (el, arg, id) => () => deleteDocument(id),
  "recall-mark": (el, arg, id) => async () => {
    const { markRecallResult } = await import("../../views/assistant.js");
    markRecallResult(id, arg);
  },
  "plan-toggle": (el, arg, id) => () => togglePlanItem(id),
  "practise-doc": (el, arg, id) => async () => {
    const { practiseDocument } = await import("../../views/assistant.js");
    practiseDocument(id);
  },
  "practise-course": (el, arg, id) => async () => {
    const { practiseCourse } = await import("../../views/assistant.js");
    practiseCourse(id);
  },
  "plan-proposal-exclude": (el, arg, id) => () =>
    toggleProposalExclusion(id),
  "sub-toggle": (el, arg, id) => () => toggleSubtask(id, arg),
  "task-toggle": (el, arg, id) => () => toggleTask(id),
  "task-delete": (el, arg, id) => () => deleteTask(id),
  "event-new": (el, arg) => () => _modal("eventModal", null, arg ? { due: arg } : {}),
  "reading-edit": (el, arg, id) => () => _modal("readingModal", id),
  "reading-toggle": (el, arg, id) => () => toggleReading(id),
  "doc-reanalyse": (el, arg, id) => () => {
    const doc = Store.db.documents.find((d) => d.id === id);
    if (!doc) {
      toast("Document not found.", "bad");
      return;
    }
    try {
      const result = NLP.analyse({
        text: doc.text || "",
        tables: doc.tables || [],
        courseId: doc.courseId,
        name: doc.name,
      });
      doc.analysis = result.pnu || null;
      doc.standardAnalysis = result.standard || null;
      RAG.reindexAll();
      Store.saveNow();
      toast("Document re-analysed.", "ok");
      Router.scheduleRender();
    } catch (e) {
      toast(
        (e && e.message) || "Re-analysis failed.",
        "bad",
        "Re-analysis",
      );
    }
  },
  "doc-ask": (el, arg, id) => () => {
    if (!id) return;
    UIState.set("chatSources", [id]);
    const close = document.querySelector("#modalRoot [data-close]");
    if (close) close.click();
    Router.navigate("assistant");
  },
  "chat-suggest": (el) => async () => {
    const q = el?.dataset?.q;
    if (q) {
      const { sendChat } = await import("../../views/assistant.js");
      sendChat(q);
    }
  },
  "chat-resend": (el) => async () => {
    const q = el?.dataset?.q;
    if (q) {
      Router.navigate("assistant");
      requestAnimationFrame(async () => {
        const { sendChat } = await import("../../views/assistant.js");
        sendChat(q);
      });
    }
  },
  "chat-remove-recent": (el) => () => {
    const content = el?.dataset?.q;
    if (content) Store.chat.removeRecent(content);
  },
});

const CONTEXT_ACTION_NAMES = Object.freeze(Object.keys(CONTEXT_HANDLERS));

/**
 * Every action name the dispatcher can handle, derived from the static table,
 * the context table, and the direct-handler table — never by calling
 * `buildDispatch` with placeholder nulls.
 *
 * The previous manual list had drifted: `chat-resend` is emitted by the
 * recent-chat markup but was missing here, so clicking it logged a false
 * "unknown action" warning while still working.
 */
const KNOWN_ACTIONS = new Set([
  ...Object.keys(DIRECT_HANDLERS),
  ...Object.keys(STATIC_HANDLERS),
  ...CONTEXT_ACTION_NAMES,
]);

/**
 * Build the per-dispatch handler table.
 *
 * Static handlers are spread from the frozen map; context handlers are
 * instantiated once for this element. `KNOWN_ACTIONS` is the union of both
 * tables plus `DIRECT_HANDLERS`, so a handler cannot exist without the guard
 * knowing about it, and a mistyped data-act cannot look registered.
 *
 * @param {Element|null} el - The [data-act] element (null when probing keys)
 * @param {string|null} arg - data-arg, falling back to data-id
 * @param {string|null} id - data-id
 * @returns {Object<string, Function>}
 */
export function buildDispatch(el, arg, id) {
  const table = { ...STATIC_HANDLERS };
  for (const name of CONTEXT_ACTION_NAMES) {
    table[name] = CONTEXT_HANDLERS[name](el, arg, id);
  }
  return table;
}

/** Late-import a modal function from views to avoid top-level core -> views dep. */
async function _modal(name, ...args) {
  const mod = await import("../../views/modals/index.js");
  if (typeof mod[name] === "function") mod[name](...args);
}

export { act, KNOWN_ACTIONS };
