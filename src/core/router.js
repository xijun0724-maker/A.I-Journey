/**
 * View routing for Journey A.I
 * Handles navigation, URL hashing, and view rendering.
 */

import { Store } from "./store.js";
import { UI, Views, UIState } from "./state.js";
import { q, applyDataStyles } from "../utils/dom.js";
import { esc } from "../utils/helpers.js";
import { renderRecents } from "../utils/format.js";

/**
 * View definitions (populated by view modules)
 */
const viewDefs = {};

/**
 * Render coalescing — batches multiple render() calls into one rAF
 */
let _renderPending = false;

function scheduleRender() {
  if (_renderPending) return;
  _renderPending = true;
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
  raf(function () {
    _renderPending = false;
    render();
  });
}

/**
 * Navigation groups for sidebar
 */
const navGroups = [
  {
    target: "#navMain",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "dashboard" },
      { id: "roadmap", label: "Roadmap", icon: "roadmap" },
      { id: "planner", label: "Planner", icon: "planner" },
      { id: "calendar", label: "Calendar", icon: "calendar" },
      { id: "tasks", label: "Tasks", icon: "tasks" },
      { id: "library", label: "Library", icon: "library" },
    ],
  },
];

/** Resolve the configured default view, falling back to dashboard. */
function resolveDefaultView() {
  const preferred = Store.db.settings.defaultView || "dashboard";
  return viewDefs[preferred] ? preferred : "dashboard";
}

/**
 * SVG icons for navigation — Lucide-style thin strokes
 */
const icons = {
  dashboard:
    '<rect x="3" y="3" width="4" height="4" rx="0.8"/><rect x="9" y="3" width="4" height="4" rx="0.8"/><rect x="3" y="9" width="4" height="4" rx="0.8"/><rect x="9" y="9" width="4" height="4" rx="0.8"/>',
  roadmap:
    '<circle cx="3" cy="3.5" r="1"/><path d="M5.5 3.5h7.5"/><circle cx="3" cy="8" r="1"/><path d="M5.5 8h7.5"/><circle cx="3" cy="12.5" r="1"/><path d="M5.5 12.5h5"/>',
  tasks:
    '<rect x="3" y="3" width="10" height="10" rx="1.5"/><path d="M5.5 8.2l1.5 1.6 3.5-3.8"/>',
  planner:
    '<rect x="3" y="4" width="10" height="9" rx="1.2"/><path d="M3 6.5h10M5.5 2.5v2.5M10.5 2.5v2.5"/>',
  calendar:
    '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5 2v3M11 2v3"/>',
  assistant:
    '<path d="M8 2.5l1.2 3.5 3.5 1.2-3.5 1.2L8 13.1l-1.2-3.5L3.3 8.4l3.5-1.2z"/>',
  library: '<path d="M4.5 3h4.5l3.5 3.2v6.8H4.5z"/><path d="M9 3v3.2H12.5"/>',
  courses:
    '<path d="M8 2.5l5 2.6L8 7.7 3 5.1z"/><path d="M3.5 8.2 8 10.5l4.5-2.3M3.5 10.8 8 13.1l4.5-2.3"/>',
  import:
    '<path d="M8 2.5v7.5M5 7.5l3 3 3-3"/><path d="M3.5 12v1.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V12"/>',
  squarePen:
    '<path d="M12.5 3.5l2 2L5 15H3v-2z"/><path d="M10.5 5.5l2 2"/>',
  plus: '<path d="M8 3.4v9.2M3.4 8h9.2"/>',
  search: '<circle cx="7.5" cy="7.5" r="3.5"/><path d="M11 11l3 3"/>',
  settings:
    '<path d="M13.4 9.8a1.1 1.1 0 0 0 .2 1.2l.05.05a1.33 1.33 0 1 1-1.88 1.88l-.05-.05a1.1 1.1 0 0 0-1.2-.2 1.1 1.1 0 0 0-.67 1v.12a1.33 1.33 0 1 1-2.66 0v-.06a1.1 1.1 0 0 0-.72-1 1.1 1.1 0 0 0-1.2.2l-.05.05a1.33 1.33 0 1 1-1.88-1.88l.05-.05a1.1 1.1 0 0 0 .2-1.2 1.1 1.1 0 0 0-1-.67h-.12a1.33 1.33 0 1 1 0-2.66h.06a1.1 1.1 0 0 0 1-.72 1.1 1.1 0 0 0-.2-1.2L4.4 3.4a1.33 1.33 0 1 1 1.88-1.88l.05.05a1.1 1.1 0 0 0 1.2.2h.06a1.1 1.1 0 0 0 .67-1V.8a1.33 1.33 0 1 1 2.66 0v.06a1.1 1.1 0 0 0 .67 1 1.1 1.1 0 0 0 1.2-.2l.05-.05a1.33 1.33 0 1 1 1.88 1.88l-.05.05a1.1 1.1 0 0 0-.2 1.2v.06a1.1 1.1 0 0 0 1 .67h.12a1.33 1.33 0 1 1 0 2.66h-.06a1.1 1.1 0 0 0-1 .67z"/>',
};

/**
 * Get SVG mark for icon
 * @param {string} name - Icon name
 * @returns {string} SVG markup
 */
function mark(name) {
  if (!icons[name]) return "";
  return (
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    icons[name] +
    "</svg>"
  );
}

/**
 * Register a view definition
 * @param {string} id - View ID
 * @param {Object} def - View definition { title, fn, after }
 */
function registerView(id, def) {
  viewDefs[id] = def;
}

/**
 * Render navigation sidebar
 */
function renderNav() {
  navGroups.forEach((g) => {
    const host = q(g.target);
    if (!host) return;
    host.innerHTML = g.items
      .map((it) => {
        const c = it.count ? it.count() : null;
        const isAct =
          UIState.view === it.id ||
          (it.id === "roadmap" && UIState.view === "courses");
        return (
          '<a href="#' +
          it.id +
          '" data-act="nav" data-arg="' +
          it.id +
          '" class="' +
          (isAct ? "active" : "") +
          '"' +
          (isAct ? ' aria-current="page"' : "") +
          ' title="' +
          esc(it.label) +
          '">' +
          '<span class="ic">' +
          mark(it.icon) +
          "</span><span>" +
          esc(it.label) +
          "</span>" +
          (c ? '<span class="cnt">' + c + "</span>" : "") +
          "</a>"
        );
      })
      .join("");
  });
}

/**
 * Render sidebar action buttons (New chat + Search chats)
 */
function renderSidebarActions() {
  const host = q("#sbActions");
  if (!host) return;
  host.innerHTML =
    '<button class="sb-new-chat" data-act="chat-new" title="New">' +
    '<span class="ic">' +
    mark("plus") +
    "</span><span>New</span>" +
    "</button>" +
    '<button class="sb-search-chat" data-act="chat-search" title="Search">' +
    '<span class="ic">' +
    mark("search") +
    "</span><span>Search</span>" +
    "</button>";
}

/**
 * Render recent chats in sidebar: one row per conversation, with the open
 * conversation carrying the active pill.
 */
function renderRecentChats() {
  renderRecents(q("#recentChatList"), Store.chat.conversations(), {
    activeCid: Store.chat.activeId(),
  });
}

/**
 * 404 view for unknown routes
 */
function notFoundView() {
  return (
    '<div  class="empty u-mt-80">' +
    '<div class="big">404</div>' +
    "<h3>Page not found</h3>" +
    "<p>The page you are looking for does not exist or has been moved.</p>" +
    '<button class="btn primary mt" data-act="nav" data-arg="dashboard">Back to dashboard</button>' +
    "</div>"
  );
}

/**
 * Render focused-course scope chip when a single course is selected.
 * Without this the filter is invisible: every page silently omits data
 * and there is no way to discover how to clear it.
 */
function scopeChipHtml() {
  const id = UIState.courseId;
  if (!id || id === "all") return "";
  if (UIState.view === "courses" || UIState.view === "roadmap") return "";
  const course = Store.course(id);
  if (!course) return "";
  const label = course.code || course.title || "Course";
  return (
    '<div class="scope-chip-bar" role="status">' +
    '<span class="badge info">Focused on ' +
    esc(label) +
    "</span> " +
    '<button type="button" class="btn sm" data-act="scope-clear" title="Show all courses">Show all courses</button>' +
    "</div>"
  );
}

/**
 * Main render function
 */
function render() {
  const defaultView = resolveDefaultView();
  UIState.view = viewDefs[UIState.view] ? UIState.view : defaultView;
  const def = viewDefs[UIState.view] || {
    fn: notFoundView,
    title: "Not found",
  };
  const currentView = UIState.view;

  renderSidebarActions();
  renderNav();
  renderRecentChats();

  const root = q("#viewRoot");
  if (!root) return;
  let html;
  try {
    html = def.fn();
  } catch (e) {
    html =
      '<div class="card"><h2>Something went wrong rendering this screen</h2><p class="small mono">' +
      esc(e.message) +
      "</p>" +
      '<button class="btn primary mt" data-act="nav" data-arg="dashboard">Back to dashboard</button></div>';
    if (typeof console !== "undefined" && console.error) console.error(e);
  }
  /* Layout seam: the router owns the page frame. Every view returns its body
     only, so the scope chip lands inside the frame without any view having to
     know the wrapper or the chip exists. A view that fills the viewport
     (`padded: false`, e.g. the chat assistant) opts out of the padded frame. */
  const chip = scopeChipHtml();
  const body = html || "";
  root.innerHTML =
    def.padded === false
      ? chip + body
      : '<div class="view-padded">' + chip + body + "</div>";
  /* Dynamic declarations (a colour, a computed width) ride as data-style
     and land here — CSSOM writes, which CSP style-src does not block. */
  applyDataStyles(root);
  document.title = "Journey A.I - " + def.title;

  // Focus management: move focus to new content for keyboard/SR users
  root.focus({ preventScroll: true });

  const srStatus = q("#srStatus");
  if (srStatus) srStatus.textContent = def.title;

  if (currentView === "import") {
    if (UI.draft) Views.importReviewBind(root);
    else Views.importBind(root);
  }
  if (def.after) {
    try {
      def.after(root);
    } catch (e) {
      if (typeof console !== "undefined" && console.error) console.error(e);
    }
  }
}

/**
 * Store → Router repaint policy: the one place that decides what a
 * mutation repaints.
 *
 * The assistant paints chat messages incrementally (bubbles stream in), so
 * a full re-render on a chat append would rebuild the transcript — and any
 * half-typed draft — mid-conversation. Those repaint the Recents sidebar
 * only; every other mutation repaints the whole view.
 *
 * Subscribed by bootstrap: `Store.on("change", Router.onStoreChange)`.
 * @param {Object} change - { entity, op, id } emitted by the Store
 */
function onStoreChange(change) {
  if (change && change.entity === "chat" && change.op === "append") {
    renderRecentChats();
    return;
  }
  scheduleRender();
}

/**
 * Navigate to a view
 * @param {string} view - View ID
 */
function navigate(view) {
  if (!viewDefs[view]) view = resolveDefaultView();
  UIState.view = view;
  if (location.hash !== "#/" + view) location.hash = "#/" + view;
  render();
}

/**
 * Initialize router and event listeners
 */
function init() {
  window.addEventListener("hashchange", () => {
    const v = (location.hash || "").replace(/^#\/?/, "");
    UIState.view = viewDefs[v] ? v : resolveDefaultView();
    if (location.hash !== "#/" + UIState.view) {
      window.history.replaceState(null, "", "#/" + UIState.view);
    }
    render();
  });

  window.addEventListener("popstate", () => {
    const v = (location.hash || "").replace(/^#\/?/, "");
    UIState.view = viewDefs[v] ? v : resolveDefaultView();
    render();
  });

  const initial = (location.hash || "").replace(/^#\/?/, "");
  UIState.view = viewDefs[initial] ? initial : resolveDefaultView();
  if (location.hash !== "#/" + UIState.view) {
    window.history.replaceState(null, "", "#/" + UIState.view);
  }
  render();
}

// Export the Router API
export const Router = {
  viewDefs,
  navGroups,
  icons,
  mark,
  registerView,
  renderNav,
  renderSidebarActions,
  renderRecentChats,
  render,
  scheduleRender,
  onStoreChange,
  navigate,
  init,
};

export default Router;
