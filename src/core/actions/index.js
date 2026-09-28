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
import { UIState } from "../scope.js";
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
import {
  toggleTask,
  toggleSubtask,
  toggleReading,
  deleteTask,
} from "./tasks.js";
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

/** The one action table: name → handler taking { el, arg, id }. */
const ACTIONS = Object.freeze({
  nav: directRoute,
  view: directRoute,
  "go-import": () => Router.navigate("import"),
  ask: ({ arg }) => {
    Router.navigate("assistant");
    requestAnimationFrame(async () => {
      const { sendChat } = await lateAssistant();
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
        const { sendChat } = await lateAssistant();
        sendChat(
          'Help me understand "' +
            String(ev.title || "").replace(/["'`]/g, "") +
            '"',
        );
      });
  },
  "cal-prev": () => lateCalendar().then((m) => m.stepCalendarMonth(-1)),
  "cal-next": () => lateCalendar().then((m) => m.stepCalendarMonth(1)),
  "cal-today": () => lateCalendar().then((m) => m.jumpToToday()),
  "cal-day-view": ({ el }) => {
    const dStr = el?.dataset?.date;
    if (dStr) return lateCalendar().then((m) => m.showDayEventsModal(dStr));
  },
  "cal-day-new": ({ el }) => {
    const dStr = el?.dataset?.date;
    return _modal("eventModal", null, dStr ? { due: dStr } : {});
  },
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
    const { sendChat } = await lateAssistant();
    sendChat();
  },
  "chat-stop": async () => {
    const { abortPending } = await lateAssistant();
    if (!abortPending()) toast("Nothing is running.", "info");
  },
  /* New = a fresh conversation: close the current one so the landing page
     shows, keep everything else in Recents. */
  "chat-new": () => {
    Store.chat.newConversation();
    Router.navigate("assistant");
  },
  "chat-search": toggleSidebarChatSearch,
  /* Lift the "ask about this document only" scope set by Library → Ask. */
  "chat-scope-clear": () => {
    UIState.set("chatSources", []);
    Router.render();
  },
  /* Re-ask the question a failed answer left in the transcript. */
  "chat-retry": async () => {
    const { retryLastQuestion } = await lateAssistant();
    retryLastQuestion();
  },
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
  "course-image-modal": ({ id }) => _modal("courseImageModal", id),
  "academic-calendar-modal": ({ id }) => _modal("academicCalendarModal", id),
  "edit-course": ({ id }) => _modal("courseModal", id),
  "toggle-star-course": ({ id }) => toggleStarCourse(id),
  "toggle-remove-view-course": ({ id }) => toggleRemoveFromView(id),
  "del-course": ({ id }) => deleteCourse(id),
  "event-edit": ({ id }) => _modal("eventModal", id),
  "lesson-edit": ({ id }) => _modal("lessonModal", id),
  "lesson-toggle": ({ id }) => toggleLesson(id),
  "view-doc": ({ id }) => _modal("docModal", id),
  "del-doc": ({ id }) => deleteDocument(id),
  "recall-mark": async ({ id, arg }) => {
    const { markRecallResult } = await lateAssistant();
    markRecallResult(id, arg);
  },
  "plan-toggle": ({ id }) => togglePlanItem(id),
  "practise-doc": async ({ id }) => {
    const { practiseDocument } = await lateAssistant();
    practiseDocument(id);
  },
  "practise-course": async ({ id }) => {
    const { practiseCourse } = await lateAssistant();
    practiseCourse(id);
  },
  "plan-proposal-exclude": ({ id }) => toggleProposalExclusion(id),
  "sub-toggle": ({ id, arg }) => toggleSubtask(id, arg),
  "task-toggle": ({ id }) => toggleTask(id),
  "task-delete": ({ id }) => deleteTask(id),
  "event-new": ({ arg }) => _modal("eventModal", null, arg ? { due: arg } : {}),
  "reading-edit": ({ id }) => _modal("readingModal", id),
  "reading-toggle": ({ id }) => toggleReading(id),
  "doc-reanalyse": ({ id }) => {
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
      toast((e && e.message) || "Re-analysis failed.", "bad", "Re-analysis");
    }
  },
  "doc-ask": ({ id }) => {
    if (!id) return;
    UIState.set("chatSources", [id]);
    const close = document.querySelector("#modalRoot [data-close]");
    if (close) close.click();
    Router.navigate("assistant");
  },
  "chat-suggest": async ({ el }) => {
    const q = el?.dataset?.q;
    if (q) {
      const { sendChat } = await lateAssistant();
      sendChat(q);
    }
  },
  /* A Recents row *is* a conversation: clicking it resumes that chat. */
  "chat-open": ({ el }) => {
    const cid = el?.dataset?.cid;
    if (cid) Store.chat.open(cid);
    Router.navigate("assistant");
  },
  "chat-remove-recent": ({ el }) => {
    const cid = el?.dataset?.cid;
    if (cid) Store.chat.removeConversation(cid);
  },
});

/** Warn when a data-act value has no handler, so a typo or stale attribute is
 * loud instead of a dead button. */
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

const KNOWN_ACTIONS = new Set(Object.keys(ACTIONS));

function act(action, el) {
  _assertKnown(action);
  const handler = ACTIONS[action];
  if (!handler) return;
  return handler({
    el,
    arg: el?.dataset?.arg || el?.dataset?.id || null,
    id: el?.dataset?.id || null,
  });
}

/** Late view loads.
 *
 * The action layer is core, and views depend on core - never the reverse. When
 * a handler genuinely needs a view function it loads that view here, at call
 * time, so that direction holds. Each loader owns the one literal `import()`
 * specifier for its view, so the bundler still sees a real dynamic import, and
 * memoises the promise so every handler needing the assistant shares a single
 * resolution instead of repeating the path. A rejection clears the memo: a
 * chunk that fails to load (offline, stale cache after a deploy) must not be
 * remembered as "this view is permanently broken", or the control stays dead
 * until reload. */
let _assistant = null;
function lateAssistant() {
  if (!_assistant)
    _assistant = import("../../views/assistant.js").catch((e) => {
      _assistant = null;
      throw e;
    });
  return _assistant;
}

let _calendar = null;
function lateCalendar() {
  if (!_calendar)
    _calendar = import("../../views/calendar.js").catch((e) => {
      _calendar = null;
      throw e;
    });
  return _calendar;
}

/** Late-import a modal function from views to avoid top-level core -> views dep. */
async function _modal(name, ...args) {
  const mod = await import("../../views/modals/index.js");
  if (typeof mod[name] === "function") mod[name](...args);
}

export { act, KNOWN_ACTIONS, ACTIONS };
