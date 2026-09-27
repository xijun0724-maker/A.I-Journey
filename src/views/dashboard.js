/**
 * Dashboard View for Journey A.I
 * Multi-Tier Academic Hierarchy:
 * Tier 1: Term Horizon & Cadence Band
 * Tier 2: Academic Vital Signs (4 KPI Bento Strip)
 * Tier 3: Strategic Focus & Course Standing (What to do next + Course Progress)
 * Tier 4: Tactical Schedule & Deadlines (Moodle 4.x Timeline + Interactive Calendar)
 */

import { Store } from "../core/store.js";
import { UI, UIState } from "../core/state.js";
import { Dashboard } from "../domain/dashboard.js";
import { Tasks } from "../domain/tasks.js";
import { Planner } from "../domain/planner.js";
import { Router } from "../core/router.js";
import { esc, sortBy, safeColor } from "../utils/helpers.js";
import {
  fmtDate,
  fmtTime,
  rel,
  dateOnly,
  daysUntil,
  mondayOf,
  addDays,
} from "../utils/date.js";
import {
  empty,
  bar,
  statBox,
  pageHead,
  priBadge,
  statusBadge,
  courseChip,
} from "./shared.js";
import { q } from "../utils/dom.js";
import { renderCalendarCard, afterCalendar } from "./calendar.js";

/** Format time string HH:MM from ISO string or default to 23:59 */
function formatTime(isoStr) {
  if (!isoStr || isoStr.length < 16) return "23:59";
  return isoStr.slice(11, 16);
}

/** Format date header e.g. "Friday, 11 September 2026" */
function formatDateHeader(dateYmd) {
  const d = new Date(dateYmd + "T00:00:00");
  if (isNaN(d.getTime())) return dateYmd;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Build full course description matching Moodle screenshot */
function getCourseDetailString(courseId) {
  const c = Store.course(courseId);
  if (!c) return "General Academic Task";
  const parts = [];
  if (c.title) parts.push(c.title);
  if (c.section) parts.push(c.section);
  if (c.code) parts.push(c.code);
  let res = parts.join(" - ");
  if (c.schedule) {
    res += ` (${c.schedule})`;
  }
  return res;
}

/** Render a single timeline item row matching Moodle 4.x screenshot */
function renderTimelineItem(e) {
  const n = daysUntil(e.due);
  const isDone = e.status === "done";
  const isOverdue = n !== null && n < 0 && !isDone;
  const isDueSoon = n !== null && n >= 0 && n <= 3 && !isDone;
  const timeStr = formatTime(e.due);
  const courseDetail = getCourseDetailString(e.courseId);

  const actionPrefix =
    e.type === "assignment" || e.type === "project"
      ? "Assignment is due"
      : "Assignment requires action";

  let h = `<div class="timeline-item-row" data-id="${esc(e.id)}">`;

  // 1. Time Column (e.g. 10:00, 23:59)
  h += `<div class="timeline-time-col">${esc(timeStr)}</div>`;

  // 2. Icon Column (Moodle magenta/pink assignment document with upward arrow)
  h += `<div class="timeline-icon-col">`;
  h += `<svg class="timeline-icon-svg" viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/></svg>`;
  h += `</div>`;

  // 3. Body Column (Title, Overdue badge, Details)
  h += `<div class="timeline-body-col">`;
  h += `<div class="timeline-title-row">`;
  h += `<a href="#" class="timeline-title-link" data-act="event-edit" data-id="${esc(e.id)}">${esc(e.title || "Untitled Activity")}</a>`;
  if (isOverdue) {
    h += `<span class="badge-moodle-overdue">Overdue</span>`;
  } else if (isDueSoon) {
    h += `<span class="badge-moodle-due">Due soon</span>`;
  } else if (isDone) {
    h += `<span class="badge ok xs">Completed</span>`;
  }
  h += `</div>`;

  h += `<div class="timeline-detail-row">`;
  h += `<span class="timeline-detail-action">${actionPrefix}</span> &middot; <span>${esc(courseDetail)}</span>`;
  h += `</div>`;
  h += `</div>`;

  // 4. Action Button Column
  h += `<div  class="timeline-action-col u-row-6">`;
  h += `<button type="button" class="btn-moodle-action" data-act="event-edit" data-id="${esc(e.id)}">${isDone ? "View submission" : "Add submission"}</button>`;
  h += `<button type="button" class="btn xs ghost" data-act="ask" data-arg="${esc(e.title)}" title="Ask tutor for help">Ask</button>`;
  /* The deadline's own material, when the event carries any: the same
     recall drill the Library and the Planner open, with no chat question. */
  const material = isDone ? null : Planner.docIdFor(e);
  if (material) {
    h += `<button type="button" class="btn xs ghost" data-act="practise-doc" data-id="${esc(material)}" title="Open the recall drill on the reading this covers">Practise</button>`;
  }
  h += `</div>`;

  h += `</div>`;
  return h;
}

/** Render the Timeline block card matching reference screenshot */
function renderTimeline() {
  const allEvents = Store.db.events || [];
  const hasOverdue = allEvents.some((e) => {
    if (!e.due || e.status === "done") return false;
    const n = daysUntil(e.due);
    return n !== null && n < 0;
  });

  const filter = UIState.timelineFilter || (hasOverdue ? "overdue" : "7days");
  const sort = UIState.timelineSort || "dates";
  const search = (UIState.timelineSearch || "").trim().toLowerCase();

  // Filter events based on filter dropdown
  let filtered = allEvents.filter((e) => {
    if (!e.due) return false;
    const n = daysUntil(e.due);
    const isDone = e.status === "done";
    const isOverdue = n !== null && n < 0 && !isDone;

    if (filter === "overdue") {
      return isOverdue;
    } else if (filter === "7days") {
      return !isDone && n !== null && n >= 0 && n <= 7;
    } else if (filter === "30days") {
      return !isDone && n !== null && n >= 0 && n <= 30;
    } else if (filter === "3months") {
      return !isDone && n !== null && n >= 0 && n <= 90;
    } else if (filter === "6months") {
      return !isDone && n !== null && n >= 0 && n <= 180;
    }
    // "all"
    return true;
  });

  // Search filter
  if (search) {
    filtered = filtered.filter((e) => {
      const c = Store.course(e.courseId);
      const cName = c ? (c.title + " " + (c.code || "") + " " + (c.schedule || "")) : "";
      return (
        (e.title || "").toLowerCase().includes(search) ||
        (e.type || "").toLowerCase().includes(search) ||
        cName.toLowerCase().includes(search)
      );
    });
  }

  // Sort events
  if (sort === "dates") {
    filtered = sortBy(filtered, (e) => e.due || "9999");
  } else if (sort === "courses") {
    filtered = sortBy(filtered, (e) => Store.courseName(e.courseId) + (e.due || ""));
  }

  // Header and Toolbar
  let h = '<div class="card moodle-dashboard-card moodle-timeline-card" id="timelineCard">';
  h += '<div class="moodle-card-header">';
  h += '<h2 class="moodle-card-title">Timeline</h2>';
  h += '</div>';

  h += '<div class="moodle-timeline-toolbar">';
  h += '<select id="timelineFilterSelect" class="timeline-select" aria-label="Filter timeline events">';
  h += `<option value="overdue"${filter === "overdue" ? " selected" : ""}>Overdue</option>`;
  h += `<option value="all"${filter === "all" ? " selected" : ""}>All</option>`;
  h += `<option value="7days"${filter === "7days" ? " selected" : ""}>Due next 7 days</option>`;
  h += `<option value="30days"${filter === "30days" ? " selected" : ""}>Due next 30 days</option>`;
  h += `<option value="3months"${filter === "3months" ? " selected" : ""}>Due next 3 months</option>`;
  h += `<option value="6months"${filter === "6months" ? " selected" : ""}>Due next 6 months</option>`;
  h += '</select>';

  h += '<select id="timelineSortSelect" class="timeline-select" aria-label="Sort timeline events">';
  h += `<option value="dates"${sort === "dates" ? " selected" : ""}>Sort by dates</option>`;
  h += `<option value="courses"${sort === "courses" ? " selected" : ""}>Sort by courses</option>`;
  h += '</select>';

  h += '<div class="timeline-search-wrap">';
  h += `<input type="search" id="timelineSearchInput" class="timeline-search-input" placeholder="Search by activity type or name" value="${esc(UIState.timelineSearch || "")}" aria-label="Search by activity type or name">`;
  h += '</div>';
  h += '</div>';

  // Grouped Timeline Content
  if (!filtered.length) {
    h += '<div  class="empty-compact timeline-empty-state u-empty-24">';
    if (filter === "overdue" && allEvents.length > 0) {
      h += '<div class="u-stat-num">&check;</div>';
      h += '<div  class="t strong u-ink-14-mb-4">No overdue activities</div>';
      h += '<p  class="small muted u-mb-12">You are all caught up on current deadlines.</p>';
      h += '<button type="button" class="btn sm" id="timelineFilterNextBtn">View upcoming activities</button>';
    } else {
      h += '<p  class="small muted u-mb-12">No activities found for this filter.</p>';
      if (!allEvents.length) {
        h += '<button type="button" class="btn primary sm" data-act="go-import">Import syllabus</button>';
      } else {
        h += '<button type="button" class="btn sm" id="timelineFilterAllBtn">View all activities</button>';
      }
    }
    h += '</div>';
  } else {
    h += '<div class="timeline-items-list">';

    if (sort === "dates") {
      // Group by formatted date
      const groups = {};
      filtered.forEach((e) => {
        const dStr = e.due.slice(0, 10);
        if (!groups[dStr]) groups[dStr] = [];
        groups[dStr].push(e);
      });

      Object.keys(groups).forEach((dStr) => {
        const formattedDate = formatDateHeader(dStr);
        h += '<div class="timeline-date-group">';
        h += `<div class="timeline-date-group-title">${esc(formattedDate)}</div>`;
        groups[dStr].forEach((e) => {
          h += renderTimelineItem(e);
        });
        h += '</div>';
      });
    } else {
      // Group by course
      const groups = {};
      filtered.forEach((e) => {
        const cId = e.courseId || "unassigned";
        if (!groups[cId]) groups[cId] = [];
        groups[cId].push(e);
      });

      Object.keys(groups).forEach((cId) => {
        const c = Store.course(cId);
        const cName = c ? (c.code ? `${c.code} · ${c.title}` : c.title) : "Unassigned";
        h += '<div class="timeline-date-group">';
        h += `<div class="timeline-date-group-title">${esc(cName)}</div>`;
        groups[cId].forEach((e) => {
          h += renderTimelineItem(e);
        });
        h += '</div>';
      });
    }

    h += '</div>';
  }

  h += '</div>'; // .moodle-timeline-card
  return h;
}

/** Render the Week Horizon Band matching the user's reference screenshot */
function renderWeekBand(
  wkNo,
  ready,
  monday,
  sunday,
  wkEvents,
  nextEv,
  overdueNow,
) {
  const pctTerm = ready ? ready.timePct : 0;
  const s = Store.db.settings || {};
  const activeTerm = esc(s.termName || "Term 1");
  const activeYear = s.academicYear ? esc(s.academicYear) + " &middot; " : "";

  return (
    '<div class="band compact-band">' +
    '<div class="band-left">' +
    '<span class="band-n">Week ' +
    wkNo +
    "</span>" +
    '<span class="band-title">' +
    fmtDate(dateOnly(monday), false) +
    " \u2013 " +
    fmtDate(dateOnly(sunday), false) +
    "</span>" +
    '<span class="band-meta">' +
    (wkEvents.length
      ? wkEvents.length +
        " task" +
        (wkEvents.length === 1 ? "" : "s") +
        " due this week. Next: " +
        esc(wkEvents[0].title) +
        ", " +
        rel(wkEvents[0].due) +
        "."
      : "Nothing due this week. " +
        (nextEv
          ? "Next: " +
            esc(nextEv.title) +
            ", " +
            rel(nextEv.due) +
            "."
          : "Import a syllabus to get started.")) +
    "</span>" +
    "</div>" +
    '<div class="band-right">' +
    '<button type="button" class="band-term-badge" data-act="academic-calendar-modal" title="Configure academic calendar, term, and year">' +
    activeYear +
    activeTerm +
    " &middot; " +
    pctTerm +
    "% elapsed ✎</button>" +
    (overdueNow.length
      ? '<span class="badge crit">' + overdueNow.length + " overdue</span>"
      : '<span class="badge ok xs">On track</span>') +
    "</div>" +
    "</div>"
  );
}

/** Render 'To do:' card matching the stationery to-do list, synchronized with tasks */
function renderDashboardTodo() {
  const allEvents = Store.db.events || [];
  const openTasks = Tasks.ranked(
    allEvents.filter((e) => UI.inScope(e) && Tasks.isOpen(e)),
  );

  let h =
    '<div class="card what-next-card dashboard-todo-card">' +
    '<div class="card-head">' +
    '<div class="dashboard-todo-heading">' +
    '<h2>To do:</h2>' +
    '<span class="notepad-count-pill">' +
    openTasks.length +
    " open</span>" +
    "</div>" +
    '<span class="spacer"></span>' +
    '<button type="button" class="btn xs primary" data-act="task-new">+ Add to-do</button>' +
    "</div>";

  h += '<div class="what-next-body">';

  if (!openTasks.length) {
    h +=
      '<div class="todo-empty-ruled dashboard-todo-empty">' +
      '<p class="small muted">🎉 All caught up! No pending to-do items.</p>' +
      "</div>";
  } else {
    h += '<div class="todo-checklist dashboard-todo-list" role="list">';
    const displayTasks = openTasks.slice(0, 4);

    displayTasks.forEach((e) => {
      const p = Tasks.priority(e);
      const isOverdue = Tasks.isOverdue(e);
      const days = daysUntil(e.due);
      const isDueToday = days === 0;
      const timeStr = fmtTime(e.due);

      h +=
        '<div class="todo-item-row' +
        (isOverdue ? " is-overdue" : "") +
        '">';

      // 1. Square Checklist Checkbox (Synchronized with Tasks view)
      h +=
        '<button type="button" class="chk-square" data-act="task-toggle" data-id="' +
        esc(e.id) +
        '" role="checkbox" tabindex="0" aria-checked="false" aria-label="Mark ' +
        esc(e.title) +
        ' complete"></button>';

      // 2. Title & Meta (Clickable to edit)
      h +=
        '<div class="todo-item-content" data-act="event-edit" data-id="' +
        esc(e.id) +
        '" role="button" tabindex="0" title="Click to edit to-do" aria-label="Edit to-do: ' +
        esc(e.title) +
        '">';
      h += '<div class="todo-title-row">';
      h +=
        '<span class="todo-title">' +
        esc(e.title) +
        "</span>";
      h += "</div>";

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

      h += "</div>"; // .todo-meta-row
      h += "</div>"; // .todo-item-content

      h += "</div>"; // .todo-item-row
    });

    h += "</div>"; // .todo-checklist

    // Card Footer: summary & link to full To-Do List view
    h +=
      '<div class="dashboard-todo-footer">' +
      '<span class="tiny muted">Showing ' +
      displayTasks.length +
      " of " +
      openTasks.length +
      " open to-dos</span>" +
      '<button type="button" class="btn xs ghost view-all-todos-btn" data-act="nav" data-arg="tasks">View all to-dos &rarr;</button>' +
      "</div>";
  }

  h += "</div>"; // .what-next-body
  h += "</div>"; // .card
  return h;
}

/** Render 'Course progress' table card matching the user's reference screenshot */
function renderCourseProgress() {
  const rows = Dashboard.completionByCourse();
  let h =
    '<div class="card course-progress-card"><div class="card-head"><h2>Course progress</h2></div>';
  if (!rows.length) {
    h += empty(
      "",
      "No courses yet",
      "Add a course to start tracking.",
      '<button type="button" class="btn primary sm mt" data-act="new-course">Add course</button>',
    );
  } else {
    h +=
      '<div  class="tbl-wrap u-ovx-auto"><table  class="tbl u-table-full" aria-label="Course progress">' +
      '<thead><tr class="u-th">' +
      '<th class="u-cell-8x10">COURSE</th><th class="u-th-min">TASKS</th><th class="u-cell-8x10">TOPICS</th><th class="u-cell-8x10">GRADE</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h +=
        '<tr class="u-bb-rule"><td class="u-cell">' +
        '<div class="u-row-6"><span class="dot u-dot-8" data-style="background:' +
        (safeColor(r.course.color) || "var(--primary)") +
        '"></span> <strong class="u-ink-13">' +
        esc(r.course.code || r.course.title) +
        "</strong></div>" +
        '<div  class="tiny muted u-indent-14">' +
        esc(r.course.title || "") +
        "</div></td>" +
        '<td class="u-cell">' +
        bar(r.pct) +
        '<div  class="tiny muted u-mono-mt-4">' +
        r.done +
        "/" +
        r.tasks +
        ' &nbsp;&middot;&nbsp; ' +
        r.pct +
        "%</div></td>" +
        '<td  class="tiny u-cell-mono">' +
        r.lessonsDone +
        "/" +
        r.lessons +
        "</td>" +
        '<td class="u-cell">' +
        (r.grade.grade != null
          ? '<strong class="u-ink-125">' +
            r.grade.grade.toFixed(1) +
            '%</strong> <span class="tiny muted">' +
            Dashboard.letter(r.grade.grade) +
            "</span>"
          : '<span class="tiny muted">\u2014</span>') +
        "</td></tr>";
    });
    h += "</tbody></table></div>";
  }
  h += "</div>";
  return h;
}

/** Main Dashboard view function integrating executive context, KPIs, focus and schedule */
export function dashboard() {
  const allCourses = Store.db.courses || [];
  const allEvents = Store.db.events || [];

  // 1. Executive Page Head
  const s = Store.db.settings || {};
  const activeTerm = esc(s.termName || "1st Term");
  const activeYear = s.academicYear ? esc(s.academicYear) : "2026–2027";
  const headActions =
    '<button type="button" class="btn sm" data-act="academic-calendar-modal">+ Academic calendar</button>' +
    '<button type="button" class="btn sm primary" data-act="go-import">Import syllabus</button>';

  // When no courses and no events exist (fresh state or after "Reset everything"),
  // render a clean Welcome / Empty state card, hiding the KPI grids and widgets.
  if (!allCourses.length && !allEvents.length) {
    const emptyHead = pageHead(
      "Dashboard",
      `${activeYear} &middot; ${activeTerm}`,
      headActions,
    );
    return (
      emptyHead +
      '<div  class="card u-empty-48">' +
      empty(
        "",
        "Your academic dashboard is blank",
        "No courses or tasks have been loaded yet. Import a course syllabus or add a course manually to start tracking your deadlines, schedule, and academic progress.",
        '<div class="u-actions-center">' +
          '<button type="button" class="btn primary" data-act="go-import">Import syllabus</button>' +
          '<button type="button" class="btn" data-act="new-course">Add course</button>' +
        '</div>',
      ) +
      '</div>'
    );
  }

  const k = Dashboard.kpis();
  const ready = Dashboard.readiness();

  const wkNo = ready && ready.week != null ? ready.week : 1;
  const monday = mondayOf(new Date());
  const sunday = addDays(monday, 6);
  const wkEvents = sortBy(
    Store.db.events.filter(function (e) {
      return (
        UI.inScope(e) &&
        Tasks.isOpen(e) &&
        e.due &&
        e.due.slice(0, 10) >= dateOnly(monday) &&
        e.due.slice(0, 10) <= dateOnly(sunday)
      );
    }),
    function (e) {
      return e.due;
    },
  );
  const nextEv = sortBy(
    Store.db.events.filter(function (e) {
      return UI.inScope(e) && Tasks.isOpen(e) && e.due;
    }),
    function (e) {
      return e.due;
    },
  )[0];
  const overdueNow = Store.db.events.filter(function (e) {
    return UI.inScope(e) && Tasks.isOpen(e) && Tasks.isOverdue(e);
  });

  // 1. Executive Page Head
  let h = pageHead(
    "Dashboard",
    "",
    headActions,
  );

  // 2. Horizon Band (Status Strip with term progress, zero workload badges)
  h += renderWeekBand(
    wkNo,
    ready,
    monday,
    sunday,
    wkEvents,
    nextEv,
    overdueNow,
  );

  // 3. Compact 3-KPI Bento Strip (Open, Overdue, Completion)
  h +=
    '<div class="register dash-kpi-grid">' +
    statBox(k.open, "Open tasks", k.due7 + " due within 7 days", "info") +
    statBox(
      k.overdue,
      "Overdue",
      k.overdue ? "needs attention now" : "nothing overdue",
      k.overdue ? "bad" : "ok",
    ) +
    statBox(
      k.completion + "%",
      "Completion",
      k.done + " of " + (k.done + k.open) + " tasks done",
      "ok",
    ) +
    "</div>";

  // 4. Strategic Focus Row (Equal Height: To do + Course progress)
  h += '<div class="dash-bento-row dash-focus-row">';
  h += renderDashboardTodo();
  h += renderCourseProgress();
  h += '</div>';

  // 5. Tactical Submissions & Schedule Row (Shared Baseline: Timeline + Calendar)
  h += '<div class="dash-bento-row dash-schedule-row">';
  h += renderTimeline();
  h += renderCalendarCard();
  h += '</div>';

  return h;
}

/** Wire DOM event listeners for the Dashboard */
export function afterDashboard(root) {
  const container = root || document;

  // 1. Timeline filter dropdown
  const filterSel = q("#timelineFilterSelect", container);
  if (filterSel) {
    filterSel.addEventListener("change", () => {
      UIState.set("timelineFilter", filterSel.value);
      Router.scheduleRender();
    });
  }

  // 2. Timeline sort dropdown
  const sortSel = q("#timelineSortSelect", container);
  if (sortSel) {
    sortSel.addEventListener("change", () => {
      UIState.set("timelineSort", sortSel.value);
      Router.scheduleRender();
    });
  }

  // 3. Timeline search input — preserve focus/caret across the full re-render
  const searchInput = q("#timelineSearchInput", container);
  if (searchInput) {
    if (UIState.timelineSearchFocus) {
      searchInput.focus();
      const sel = UIState.timelineSearchSel;
      const end = searchInput.value.length;
      try {
        searchInput.setSelectionRange(
          sel ? sel[0] : end,
          sel ? sel[1] : end,
        );
      } catch (_e) {
        /* type=search can reject setSelectionRange in some engines */
      }
      UIState.set("timelineSearchFocus", false);
    }
    searchInput.addEventListener("focus", () => {
      UIState.set("timelineSearchFocus", true);
    });
    searchInput.addEventListener("blur", () => {
      UIState.set("timelineSearchFocus", false);
    });
    searchInput.addEventListener("input", () => {
      UIState.set("timelineSearch", searchInput.value);
      UIState.set("timelineSearchFocus", true);
      UIState.set("timelineSearchSel", [
        searchInput.selectionStart,
        searchInput.selectionEnd,
      ]);
      Router.scheduleRender();
    });
  }

  // 4. Quick filter switch buttons when timeline has 0 items
  const filterNextBtn = q("#timelineFilterNextBtn", container);
  if (filterNextBtn) {
    filterNextBtn.addEventListener("click", () => {
      UIState.set("timelineFilter", "7days");
      Router.scheduleRender();
    });
  }

  const filterAllBtn = q("#timelineFilterAllBtn", container);
  if (filterAllBtn) {
    filterAllBtn.addEventListener("click", () => {
      UIState.set("timelineFilter", "all");
      Router.scheduleRender();
    });
  }

  // 5. Wire Calendar interactions
  afterCalendar(container);
}

export const dashboardView = {
  title: "Dashboard",
  fn: dashboard,
  after: afterDashboard,
};
