/**
 * To-Do List View (Tasks)
 * Minimalist ruled notepad checklist inspired by stationery design.
 * Focuses purely on core functions: Add To-Do, Set Deadline, Set Priority.
 * Eliminates subtask clutter and empty space with strict information hierarchy.
 */

import { Store } from "../core/store.js";
import { UIState } from "../core/scope.js";
import { Router } from "../core/router.js";
import { Tasks } from "../domain/tasks.js";
import { esc, sortBy } from "../utils/helpers.js";
import { fmtDate, fmtTime, rel, daysUntil } from "../utils/date.js";
import { q } from "../utils/dom.js";
import {
  priBadge,
  statusBadge,
  courseChip,
  tabBtn as _tabBtn,
  pageHead,
  statBox,
} from "./shared.js";

function filterTasks(all, tab) {
  let list = all.slice();
  if (tab === "open") list = list.filter(Tasks.isOpen);
  else if (tab === "today")
    list = list.filter(function (e) {
      return Tasks.isOpen(e) && Tasks.isDueSoon(e, 0);
    });
  else if (tab === "week")
    list = list.filter(function (e) {
      return Tasks.isOpen(e) && Tasks.isDueSoon(e, 7);
    });
  else if (tab === "overdue")
    list = list.filter(function (e) {
      return Tasks.isOpen(e) && Tasks.isOverdue(e);
    });
  else if (tab === "done")
    list = list.filter(function (e) {
      return !Tasks.isOpen(e);
    });
  else if (tab === "nodate")
    list = list.filter(function (e) {
      return !e.due && Tasks.isOpen(e);
    });
  return list;
}

function sortTasks(list, sort) {
  if (sort === "priority") return Tasks.ranked(list);
  if (sort === "due")
    return sortBy(list, function (e) {
      return e.due || "9999";
    });
  if (sort === "course")
    return sortBy(list, function (e) {
      return Store.courseName(e.courseId) + e.title;
    });
  return list;
}

export function renderTodoRow(e, opts) {
  const showActions = !opts || opts.showActions !== false;
  const showNotes = !opts || opts.showNotes !== false;
  const p = Tasks.priority(e);
  const isDone = e.status === "done";
  const isOverdue = !isDone && Tasks.isOverdue(e);
  const days = daysUntil(e.due);
  const isDueToday = !isDone && days === 0;
  const timeStr = fmtTime(e.due);

  let h = '<div class="todo-item-row' + (isDone ? " is-done" : "") + (isOverdue ? " is-overdue" : "") + '">';

  // 1. Square Checklist Checkbox (Clean notepad style)
  h +=
    '<button type="button" class="chk-square' +
    (isDone ? " on" : "") +
    '" data-act="task-toggle" data-id="' +
    esc(e.id) +
    '" role="checkbox" tabindex="0" aria-checked="' +
    (isDone ? "true" : "false") +
    '" aria-label="Mark ' +
    esc(e.title) +
    (isDone ? " incomplete" : " complete") +
    '">' +
    (isDone ? "&#10003;" : "") +
    "</button>";

  // 2. To-Do Content: Title & Metas (Clickable to edit)
  h +=
    '<div class="todo-item-content" data-act="event-edit" data-id="' +
    esc(e.id) +
    '" role="button" tabindex="0" title="Click to edit to-do" aria-label="Edit to-do: ' +
    esc(e.title) +
    '">';
  h += '<div class="todo-title-row">';
  h += '<span class="todo-title' + (isDone ? " done-text" : "") + '">' + esc(e.title) + "</span>";
  h += "</div>";

  // 3. Compact Meta Badges (Priority, Progress, Deadline with Time, Course) — Zero Subtask Clutter
  h += '<div class="todo-meta-row">';
  h += priBadge(p.label);
  h += statusBadge(e);

  if (e.due) {
    if (isOverdue) {
      h +=
        '<span class="todo-badge overdue" title="Past deadline">⚠️ Overdue (' +
        rel(e.due) +
        (timeStr ? " · " + timeStr : "") +
        ")</span>";
    } else if (isDueToday) {
      h +=
        '<span class="todo-badge today" title="Due today">📅 Today' +
        (timeStr ? ", " + timeStr : "") +
        "</span>";
    } else {
      h +=
        '<span class="todo-badge due" title="Due date">📅 ' +
        fmtDate(e.due, false) +
        (timeStr ? ", " + timeStr : "") +
        " (" +
        rel(e.due) +
        ")</span>";
    }
  } else {
    h += '<span class="todo-badge nodate">No deadline</span>';
  }

  if (e.courseId) {
    h += '<span class="todo-course-chip">' + courseChip(e.courseId) + "</span>";
  }

  if (showNotes && e.notes) {
    h += '<span class="todo-notes-preview" title="' + esc(e.notes) + '">📝 ' + esc(e.notes) + "</span>";
  }

  h += "</div>"; // .todo-meta-row
  h += "</div>"; // .todo-item-content

  // 4. Quick Row Actions: Delete (Edit button removed, row is clickable to edit)
  if (showActions) {
    h += '<div class="todo-item-actions">';
    h +=
      '<button type="button" class="btn xs danger-ghost" data-act="task-delete" data-id="' +
      esc(e.id) +
      '" title="Delete to-do" aria-label="Delete to-do: ' +
      esc(e.title) +
      '">✕</button>';
    h += "</div>";
  }

  h += "</div>"; // .todo-item-row
  return h;
}

export function tasks() {
  const tab = UIState.tab.tasks || "open";
  const all = Store.db.events.filter(function (e) {
    if (UIState.courseId && UIState.courseId !== "all")
      return e.courseId === UIState.courseId;
    return true;
  });
  let list = filterTasks(all, tab);
  const sort = UIState.tab.taskSort || "priority";
  list = sortTasks(list, sort);

  const openCount = all.filter(Tasks.isOpen).length;
  const doneCount = all.filter(function (e) {
    return !Tasks.isOpen(e);
  }).length;
  const overdue = all.filter(function (e) {
    return Tasks.isOpen(e) && Tasks.isOverdue(e);
  }).length;
  const due7 = all.filter(function (e) {
    return Tasks.isOpen(e) && Tasks.isDueSoon(e, 7);
  }).length;
  const totalCount = openCount + doneCount;
  const compPct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0;

  // ── HIERARCHY LEVEL 1: EXECUTIVE PAGE HEAD ─────────────────────────────
  let h = pageHead(
    "To-Do List",
    "Keep track of coursework, upcoming deadlines, and study priorities in one place.",
  );

  // ── HIERARCHY LEVEL 2: BALANCED 3-CARD KPI PULSE (ZERO EMPTY SPACE) ───
  h += '<div class="library-stats-grid tasks-kpi-grid mb">';
  h += statBox(openCount, "Open To-Dos", due7 + " due within 7 days", "info");
  h += statBox(
    overdue,
    "Overdue",
    overdue ? overdue + " need attention now" : "nothing overdue",
    overdue ? "bad" : "ok",
  );
  h += statBox(compPct + "%", "Completion", doneCount + " of " + totalCount + " done", "ok");
  h += "</div>";

  // ── HIERARCHY LEVEL 3: 2-COLUMN BALANCED WORKSPACE ──────────────────────
  h += '<div class="tasks-layout-grid">';

  // LEFT COLUMN: THE TO-DO NOTEPAD (Primary Workstation)
  h += '<div class="todo-main-col">';
  h += '<div class="card todo-notepad-card">';

  // Notepad Top Border & Stylized Header
  h += '<div class="notepad-header">';
  h += '<div class="notepad-title-cluster">';
  h += '<span class="notepad-sparkle" aria-hidden="true">&#10022;</span>';
  h += '<h2 class="notepad-title">TO DO LIST</h2>';
  h += '<span class="notepad-sparkle" aria-hidden="true">&#10022;</span>';
  h += "</div>";
  h += '<div class="notepad-header-actions">';
  h +=
    '<select id="taskSort" class="todo-sort-select" aria-label="Sort tasks">' +
    '<option value="priority"' +
    (sort === "priority" ? " selected" : "") +
    ">Sort: Priority</option>" +
    '<option value="due"' +
    (sort === "due" ? " selected" : "") +
    ">Sort: Due Date</option>" +
    '<option value="course"' +
    (sort === "course" ? " selected" : "") +
    ">Sort: Course</option>" +
    "</select>";
  h += '<button type="button" class="btn xs primary" data-act="task-new">+ Add to-do</button>';
  h += "</div>";
  h += "</div>";

  // Notepad Filter Tabs
  h +=
    '<div class="tasks-tabs-wrap">' +
    '<div class="tabs todo-tabs" role="tablist" aria-label="To-do filters">' +
    _tabBtn("open", "Open (" + openCount + ")", tab === "open", "tasks") +
    _tabBtn("today", "Due today", tab === "today", "tasks") +
    _tabBtn("week", "This week", tab === "week", "tasks") +
    _tabBtn("overdue", "Overdue" + (overdue ? " (" + overdue + ")" : ""), tab === "overdue", "tasks") +
    _tabBtn("done", "Completed (" + doneCount + ")", tab === "done", "tasks") +
    _tabBtn("all", "All (" + all.length + ")", tab === "all", "tasks") +
    "</div>" +
    "</div>";

  // ── RULED NOTEPAD CHECKLIST ROWS ─────────────────────────────────────────
  if (!list.length) {
    h += '<div class="todo-empty-ruled">';
    h += '<div class="empty-ruled-line"></div>';
    h += '<div class="empty-ruled-line">';
    h += '<p class="small muted text-center m-0">' +
      (tab === "done"
        ? "No completed tasks yet. Check off items above when finished!"
        : "Your to-do list is clear. Add a to-do to get started.") +
      "</p>";
    h += "</div>";
    if (tab !== "done") {
      h += '<div class="empty-ruled-line">';
      h += '<button type="button" class="btn sm primary" data-act="task-new">+ Add to-do</button>';
      h += "</div>";
    }
    h += '<div class="empty-ruled-line"></div>';
    h += '<div class="empty-ruled-line"></div>';
    h += "</div>";
  } else {
    h += '<div class="todo-checklist" role="list">';
    list.forEach(function (e) {
      h += renderTodoRow(e);
    });
    h += "</div>";
  }

  h += "</div>"; // .card.todo-notepad-card
  h += "</div>"; // .todo-main-col

  // RIGHT COLUMN: FOCUS & PRODUCTIVITY METRICS (ZERO EMPTY SPACE)
  h += '<div class="todo-side-col">';

  // 2. Priorities at a Glance Card
  const critTasks = all.filter((e) => Tasks.isOpen(e) && Tasks.priority(e).label === "Critical").length;
  const highTasks = all.filter((e) => Tasks.isOpen(e) && Tasks.priority(e).label === "High").length;
  const medTasks = all.filter((e) => Tasks.isOpen(e) && Tasks.priority(e).label === "Medium").length;
  const lowTasks = all.filter((e) => Tasks.isOpen(e) && Tasks.priority(e).label === "Low").length;

  h += '<div class="card todo-priorities-card">';
  h += '<div class="card-head">';
  h += '<h3 class="u-copy-15">Priorities at a Glance</h3>';
  h += "</div>";
  h += '<div class="priority-breakdown-list">';
  h += '<div class="priority-stat-row"><span class="badge crit">Critical</span><strong class="v">' + critTasks + "</strong></div>";
  h += '<div class="priority-stat-row"><span class="badge high">High</span><strong class="v">' + highTasks + "</strong></div>";
  h += '<div class="priority-stat-row"><span class="badge med">Medium</span><strong class="v">' + medTasks + "</strong></div>";
  h += '<div class="priority-stat-row"><span class="badge low">Low</span><strong class="v">' + lowTasks + "</strong></div>";
  h += "</div>";
  h += "</div>"; // .card.todo-priorities-card

  // 3. Productivity Actions Card
  h += '<div class="card todo-tools-card">';
  h += '<div class="card-head">';
  h += '<h3 class="u-copy-15">Study Plan Tools</h3>';
  h += "</div>";
  h += '<p  class="tiny muted u-mb-12-lh-14">Generate AI study blocks around your deadlines or extract assignments from course syllabi.</p>';
  h += '<button type="button" class="btn sm block" data-act="plan-generate">Auto-schedule study plan</button>';
  h += '<button type="button" class="btn sm ghost block mt-s" data-act="go-import">Import from syllabus</button>';
  h += "</div>"; // .card.todo-tools-card

  h += "</div>"; // .todo-side-col
  h += "</div>"; // .tasks-layout-grid

  return h;
}

/** Wire task events, sort dropdown, and quick-add handlers */
export function afterTasks(root) {
  const container = root || document;
  const sel = q("#taskSort", container);
  if (sel) {
    sel.addEventListener("change", function () {
      UIState.set("tab.taskSort", sel.value);
      Router.scheduleRender();
    });
  }
}

export const tasksView = {
  fn: tasks,
  after: afterTasks,
};
