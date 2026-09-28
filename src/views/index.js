// Register all views with the Router, and wire shared Views helpers
import { Views } from "../core/scope.js";
import { dashboardView } from "./dashboard.js";
import { tasksView } from "./tasks.js";
import { roadmapView } from "./roadmap.js";
import { plannerView } from "./planner.js";
import { assistantView } from "./assistant.js";
import { settingsView } from "./settings.js";
import { importViewDef, importBind, importReviewBind } from "./import.js";
import { coursesView } from "./courses.js";
import { libraryView } from "./library.js";
import { calendarViewDef } from "./calendar.js";

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
  Views.importBind = importBind;
  Views.importReviewBind = importReviewBind;
}
