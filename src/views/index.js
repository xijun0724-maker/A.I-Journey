// Re-export all view modules
export { dashboard, dashboardView, afterDashboard } from "./dashboard.js";
export { calendarView, afterCalendar, calendarViewDef, configureAcademicCalendar, configureCalendar, getCalendarConfig, academicCalendarModal } from "./calendar.js";
export { tasks, afterTasks, tasksView } from "./tasks.js";
export { roadmap, roadmapView } from "./roadmap.js";
export { planner, afterPlanner, plannerView } from "./planner.js";
export {
  assistant,
  afterAssistant,
  sendChat,
  requestStudyPlan,
  suggestions,
  assistantView,
} from "./assistant.js";
export { settings, afterSettings, settingsView } from "./settings.js";
export {
  importView,
  importPick,
  importBind,
  importReview,
  importReviewBind,
  importViewDef,
} from "./import.js";
export { courses, coursesView } from "./courses.js";
export { library, libraryView } from "./library.js";
export {
  helpModal,
  docModal,
  lessonModal,
  courseModal,
  eventModal,
  readingModal,
} from "./modals/index.js";

// Register all views with the Router, and wire shared Views helpers
import { Views } from "../core/state.js";
import { dashboardView } from "./dashboard.js";
import { tasksView } from "./tasks.js";
import { roadmapView } from "./roadmap.js";
import { plannerView } from "./planner.js";
import { assistantView, sendChat, requestStudyPlan } from "./assistant.js";
import { settingsView } from "./settings.js";
import { importViewDef, importBind, importReviewBind } from "./import.js";
import { coursesView } from "./courses.js";
import { libraryView } from "./library.js";
import { calendarViewDef } from "./calendar.js";
import {
  helpModal,
  docModal,
  lessonModal,
  courseModal,
  eventModal,
  readingModal,
} from "./modals/index.js";

export function registerAll(Router) {
  Router.registerView("dashboard", {
    title: "Dashboard",
    fn: dashboardView.fn,
    after: dashboardView.after,
  });
  Router.registerView("roadmap", {
    title: "Roadmap",
    fn: roadmapView.fn,
    after: roadmapView.after,
  });
  Router.registerView("tasks", {
    title: "Tasks",
    fn: tasksView.fn,
    after: tasksView.after,
  });
  Router.registerView("planner", {
    title: "Study planner",
    fn: plannerView.fn,
    after: plannerView.after,
  });
  Router.registerView("assistant", {
    title: "AI study assistant",
    fn: assistantView.fn,
    after: assistantView.after,
    // The chat area fills the viewport; the padded frame would inset it.
    padded: false,
  });
  Router.registerView("library", {
    title: "Library",
    fn: libraryView.fn,
    after: libraryView.after,
  });
  Router.registerView("courses", {
    title: "Roadmap",
    fn: coursesView.fn,
    after: coursesView.after,
  });
  Router.registerView("calendar", {
    title: "Calendar",
    fn: calendarViewDef.fn,
    after: calendarViewDef.after,
  });
  Router.registerView("settings", {
    title: "Settings",
    fn: settingsView.fn,
    after: settingsView.after,
  });
  Router.registerView("import", { title: "Import", fn: importViewDef.fn });

  // Shared Views helpers referenced by action dispatchers and chrome wiring.
  Views.sendChat = assistantView.sendChat || sendChat;
  Views.requestStudyPlan = assistantView.requestStudyPlan || requestStudyPlan;
  Views.helpModal = helpModal;
  Views.docModal = docModal;
  Views.lessonModal = lessonModal;
  Views.courseModal = courseModal;
  Views.eventModal = eventModal;
  Views.readingModal = readingModal;
  Views.importBind = importBind;
  Views.importReviewBind = importReviewBind;
}
