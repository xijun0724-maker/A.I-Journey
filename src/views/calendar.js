/**
 * Calendar View & Component for Journey A.I (Moodle 4.x LMS Specification)
 */

import { Store } from "../core/store.js";
import { UIState } from "../core/scope.js";
import { Router } from "../core/router.js";
import { esc } from "../utils/helpers.js";
import { dateOnly, fmtTime } from "../utils/date.js";
import { q } from "../utils/dom.js";
import { modal } from "../utils/feedback.js";
import { truncate } from "./shared.js";
import { academicCalendarModal } from "./modals/academic-calendar.js";
import {
  getActiveAcademicCalendar,
  saveAcademicCalendar,
} from "../domain/academic-calendar.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_NAMES_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Configure the academic calendar term start and end dates.
 * Primary academic schedule configuration function.
 * @param {Object} [params] - Calendar term parameters
 * @param {string} [params.termStart] - Term start date YYYY-MM-DD
 * @param {string} [params.termEnd] - Term end date YYYY-MM-DD
 * @param {string} [params.academicYear] - Academic year e.g. "2026–2027"
 * @param {string} [params.termName] - Term / Semester name e.g. "1st Term"
 * @param {boolean} [params.generateMilestones] - Whether to generate milestone schedule items
 * @param {string} [params.id] - Optional ID of existing calendar
 * @returns {Object|void} Saved calendar record if called with params, or modal instance
 */
export function configureAcademicCalendar(params) {
  if (params && typeof params === "object") {
    const saved = saveAcademicCalendar(params);
    Router.scheduleRender();
    return saved;
  }
  return academicCalendarModal();
}

/**
 * Get active calendar configuration with safe fallbacks
 * @returns {Object} Calendar config settings
 */
export function getCalendarConfig() {
  const s = (Store.db && Store.db.settings) || {};
  return {
    startOfWeek: s.calendarStartOfWeek !== undefined ? Number(s.calendarStartOfWeek) : 1, // 1 = Mon, 0 = Sun
    maxEventsPerCell: s.calendarMaxEvents !== undefined ? Number(s.calendarMaxEvents) : 4,
    timeFormat: s.calendarTimeFormat || "12h",
    showMilestones: s.calendarShowMilestones !== false,
    showExams: s.calendarShowExams !== false,
    showAssignments: s.calendarShowAssignments !== false,
    showOther: s.calendarShowOther !== false,
  };
}

/**
 * Configure the calendar settings or academic calendar term dates.
 * @param {Object} [settings] - Optional partial calendar settings or term dates object
 * @returns {Object|void} Updated calendar config if called with settings, or modal instance
 */
export function configureCalendar(settings) {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    if (settings.termStart || settings.termEnd || settings.academicYear || settings.termName) {
      return configureAcademicCalendar(settings);
    }
    const patch = {};
    if (settings.startOfWeek !== undefined) {
      patch.calendarStartOfWeek = Number(settings.startOfWeek) === 0 ? 0 : 1;
    }
    if (settings.maxEventsPerCell !== undefined) {
      patch.calendarMaxEvents = Math.max(1, Math.min(10, Number(settings.maxEventsPerCell) || 4));
    }
    if (settings.timeFormat !== undefined) {
      patch.calendarTimeFormat = settings.timeFormat === "24h" ? "24h" : "12h";
    }
    if (settings.showMilestones !== undefined) {
      patch.calendarShowMilestones = Boolean(settings.showMilestones);
    }
    if (settings.showExams !== undefined) {
      patch.calendarShowExams = Boolean(settings.showExams);
    }
    if (settings.showAssignments !== undefined) {
      patch.calendarShowAssignments = Boolean(settings.showAssignments);
    }
    if (settings.showOther !== undefined) {
      patch.calendarShowOther = Boolean(settings.showOther);
    }
    if (Object.keys(patch).length) Store.settings.update(patch);
    Router.scheduleRender();
    return getCalendarConfig();
  }

  return academicCalendarModal();
}

/** Get active calendar month and year */
export function getActiveCalendarMonthYear() {
  const now = new Date();
  const m = UIState.calendarMonth != null ? UIState.calendarMonth : now.getMonth();
  const y = UIState.calendarYear != null ? UIState.calendarYear : now.getFullYear();
  return { month: m, year: y };
}

/** Step active calendar month by delta (-1 or +1) */
export function stepCalendarMonth(delta) {
  const { month, year } = getActiveCalendarMonthYear();
  let newM = month + delta;
  let newY = year;
  if (newM < 0) {
    newM = 11;
    newY -= 1;
  } else if (newM > 11) {
    newM = 0;
    newY += 1;
  }
  UIState.set("calendarMonth", newM);
  UIState.set("calendarYear", newY);
  Router.scheduleRender();
}

/** Jump active calendar to current real-time month and year */
export function jumpToToday() {
  const now = new Date();
  UIState.set("calendarMonth", now.getMonth());
  UIState.set("calendarYear", now.getFullYear());
  Router.scheduleRender();
}

/** Helper to format date string YYYY-MM-DD */
function formatYmd(year, month, day) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/**
 * Render the Calendar card (Moodle 4.x layout matching reference screenshot)
 * @param {Object} [opts] - Optional overrides { courseId, month, year }
 * @returns {string} HTML markup
 */
export function renderCalendarCard(opts = {}) {
  const { month, year } = getActiveCalendarMonthYear();
  const courseId = opts.courseId || UIState.calendarCourseId || "all";
  const courses = Store.db.courses || [];
  const events = Store.db.events || [];
  const cfg = getCalendarConfig();
  const startOfWeek = cfg.startOfWeek === 0 ? 0 : 1;
  const weekdayNames = startOfWeek === 0 ? WEEKDAY_NAMES_SUN : WEEKDAY_NAMES_MON;

  // Filter events by course scope and category visibility preferences
  const scopedEvents = events.filter((e) => {
    if (courseId !== "all" && e.courseId !== courseId) return false;
    const isMilestone = e.tag === "academic-milestone";
    const isExam = e.type === "exam" || e.type === "quiz";
    const isAssignment = e.type === "assignment" || e.type === "project";

    if (isMilestone && !cfg.showMilestones) return false;
    if (isExam && !cfg.showExams) return false;
    if (isAssignment && !cfg.showAssignments) return false;
    if (!isMilestone && !isExam && !isAssignment && !cfg.showOther) return false;

    return true;
  });

  // Calculate days in month and starting day-of-week based on startOfWeek preference
  const firstDate = new Date(year, month, 1);
  const firstDow = (firstDate.getDay() - startOfWeek + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonthName = MONTH_NAMES[(month + 11) % 12];
  const currentMonthName = MONTH_NAMES[month];
  const nextMonthName = MONTH_NAMES[(month + 1) % 12];

  const todayYmd = dateOnly(new Date());
  const activeCal = getActiveAcademicCalendar();

  // 1. Unified Compact Header & Navigation Toolbar
  let h = '<div class="card moodle-dashboard-card moodle-calendar-card" id="calendarCard">';
  h += '<div class="moodle-calendar-unified-bar">';

  // Left Context: Calendar title + Academic Term Badge
  h += '<div class="cal-context-group">';
  h += '<h2 class="moodle-card-title">Calendar</h2>';
  if (activeCal.academicYear && activeCal.termName) {
    h += `<span class="badge info xs cal-term-badge" data-act="academic-calendar-modal" title="Edit academic calendar">${esc(activeCal.academicYear)} &middot; ${esc(activeCal.termName)}</span>`;
  }
  h += '</div>';

  // Center Navigation: Month Navigation Cluster (Unified: ◀ Today ▶ + Month Year)
  h += '<div class="cal-nav-group">';
  h += '<div class="cal-stepper">';
  h += `<button type="button" class="btn-cal-icon-nav btn-cal-nav" data-act="cal-prev" aria-label="Previous month, ${prevMonthName}" title="Previous month (${prevMonthName})">&#9664;</button>`;
  h += '<button type="button" class="btn-cal-today" data-act="cal-today" aria-label="Jump to current month" title="Jump to current date">Today</button>';
  h += `<button type="button" class="btn-cal-icon-nav btn-cal-nav" data-act="cal-next" aria-label="Next month, ${nextMonthName}" title="Next month (${nextMonthName})">&#9654;</button>`;
  h += '</div>';
  h += `<h3 class="moodle-cal-month-title">${currentMonthName} ${year}</h3>`;
  h += '</div>';

  // Right Actions: Course Filter + Academic Calendar + New Event
  h += '<div class="cal-actions-group">';
  h += '<div class="moodle-calendar-filter-wrap">';
  h += '<select id="calendarCourseSelect" class="moodle-select moodle-calendar-course-select" aria-label="Filter calendar by course">';
  h += `<option value="all"${courseId === "all" ? " selected" : ""}>All courses</option>`;
  courses.forEach((c) => {
    const label = esc(c.code ? `${c.code} · ${c.title}` : c.title);
    h += `<option value="${esc(c.id)}"${courseId === c.id ? " selected" : ""}>${label}</option>`;
  });
  h += '</select>';
  h += '</div>';

  h += '<button type="button" class="btn btn-sm btn-cal-academic" data-act="academic-calendar-modal" id="btnAcademicCal" title="Set term start and end dates" aria-label="Add academic calendar">';
  h += '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="u-icon-sm"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
  h += '<span>Add academic calendar</span>';
  h += '</button>';

  h += '<button type="button" class="btn btn-moodle-primary btn-new-event" data-act="event-new" id="btnCalNewEvent" title="Create a new event">';
  h += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="u-mr-4"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
  h += '<span>New event</span>';
  h += '</button>';

  h += '</div>'; // .cal-actions-group
  h += '</div>'; // .moodle-calendar-unified-bar

  // 3. 7-Column Calendar Grid
  h += '<div class="moodle-calendar-grid-wrap">';
  h += '<table class="moodle-calendar-table" role="grid" aria-label="Calendar for ' + currentMonthName + ' ' + year + '">';
  
  // Weekday Headers
  h += '<thead><tr>';
  weekdayNames.forEach((w) => {
    h += `<th scope="col" class="cal-th">${w}</th>`;
  });
  h += '</tr></thead>';

  // Calendar Weeks Body
  h += '<tbody>';
  let dayCounter = 1;
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  for (let cell = 0; cell < totalCells; cell++) {
    if (cell % 7 === 0) h += '<tr>';

    if (cell < firstDow || dayCounter > daysInMonth) {
      // Empty day cell outside current month
      h += '<td class="cal-td cal-td-empty"><div class="cal-cell-inner"></div></td>';
    } else {
      const currentDay = dayCounter;
      const dateYmd = formatYmd(year, month, currentDay);
      const isToday = dateYmd === todayYmd;

      // Find events matching this day
      const dayEvents = scopedEvents.filter((e) => {
        return e.due && e.due.slice(0, 10) === dateYmd;
      });

      const hasEvents = dayEvents.length > 0;
      const tdCls = 'cal-td' + (hasEvents ? ' has-events' : '') + (isToday ? ' is-today' : '');

      h += `<td class="${tdCls}" data-date="${dateYmd}">`;
      h += '<div class="cal-cell-inner">';

      // Day number header
      h += '<div class="cal-day-header">';
      if (hasEvents) {
        h += `<button type="button" class="cal-day-num has-events-btn" data-act="cal-day-view" data-date="${dateYmd}" title="View events for ${currentMonthName} ${currentDay}">${currentDay}</button>`;
      } else {
        h += `<button type="button" class="cal-day-num cal-day-empty-btn" data-act="cal-day-new" data-date="${dateYmd}" title="Add event on ${currentMonthName} ${currentDay}">${currentDay}</button>`;
      }
      h += '</div>';

      // Day Events List
      if (hasEvents) {
        h += '<div class="cal-events-list">';
        const visibleEvents = dayEvents.slice(0, cfg.maxEventsPerCell);
        const overflowCount = dayEvents.length - visibleEvents.length;

        visibleEvents.forEach((ev) => {
          // Color coding for bullets: Orange for assignment/project, Blue for attendance/other, Purple for exam
          let bulletColor = "#0f6cbf";
          if (ev.type === "assignment" || ev.type === "project") {
            bulletColor = "#ea580c";
          } else if (ev.type === "exam" || ev.type === "quiz") {
            bulletColor = "#7c3aed";
          } else if (ev.courseId) {
            bulletColor = Store.courseColor ? Store.courseColor(ev.courseId) : "#ea580c";
          }

          const shortTitle = truncate(ev.title || "Untitled", 20);
          h += `<div class="cal-event-row">`;
          h += `<span class="cal-event-bullet" data-style="border-color: ${bulletColor};" aria-hidden="true"></span>`;
          h += `<a href="#" class="cal-event-link" data-act="event-edit" data-id="${esc(ev.id)}" title="${esc(ev.title)}">${esc(shortTitle)}</a>`;
          h += `</div>`;
        });

        if (overflowCount > 0) {
          h += `<button type="button" class="cal-more-link" data-act="cal-day-view" data-date="${dateYmd}">+ ${overflowCount} more</button>`;
        }
        h += '</div>';
      }

      h += '</div>'; // .cal-cell-inner
      h += '</td>';

      dayCounter++;
    }

    if (cell % 7 === 6) h += '</tr>';
  }

  h += '</tbody></table>';
  h += '</div>'; // .moodle-calendar-grid-wrap

  // 4. Compact Category Legend Bar
  h += '<div class="cal-legend-bar">';
  h += '<div class="cal-legend-item"><span class="cal-legend-dot dot-assignment" aria-hidden="true"></span><span>Assignments &amp; Projects</span></div>';
  h += '<div class="cal-legend-item"><span class="cal-legend-dot dot-exam" aria-hidden="true"></span><span>Exams &amp; Quizzes</span></div>';
  h += '<div class="cal-legend-item"><span class="cal-legend-dot dot-milestone" aria-hidden="true"></span><span>Academic Milestones</span></div>';
  h += '<div class="cal-legend-item"><span class="cal-legend-dot dot-other" aria-hidden="true"></span><span>Courses &amp; Events</span></div>';
  h += '</div>';

  h += '</div>'; // .moodle-calendar-card
  return h;
}

/**
 * Show a modal with all events scheduled for a single day
 * @param {string} dateStr - YYYY-MM-DD
 */
export function showDayEventsModal(dateStr) {
  const events = (Store.db.events || []).filter((e) => e.due && e.due.slice(0, 10) === dateStr);
  const cfg = getCalendarConfig();
  const d = new Date(dateStr + "T00:00:00");
  const formattedDate = d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let body = `<p class="muted small mb">${events.length} event${events.length === 1 ? "" : "s"} scheduled for this date.</p>`;

  if (!events.length) {
    body += '<div class="empty-compact"><p class="small muted">No events scheduled on this day.</p></div>';
  } else {
    body += '<div  class="day-modal-events-list u-col-10">';
    events.forEach((e) => {
      const course = Store.course(e.courseId);
      const courseName = course ? (course.code || course.title) : "General";
      const timePart = fmtTime(e.due, cfg.timeFormat) || "All day";
      body += `
        <div  class="card u-row-between-12">
          <div class="u-minw-0">
            <div class="u-strong-ink">${esc(e.title)}</div>
            <div  class="tiny muted u-mt-2">
              <span>${esc(courseName)}</span> · <span>${esc(timePart)}</span>
              ${e.weight != null ? ` · <span>worth ${e.weight}%</span>` : ""}
            </div>
          </div>
          <button class="btn sm" data-act="event-edit" data-id="${esc(e.id)}">Edit</button>
        </div>
      `;
    });
    body += '</div>';
  }

  modal({
    title: formattedDate,
    body: body,
    footer: `
      <button class="btn primary" data-act="event-new" data-arg="${dateStr}">+ Add event on this day</button>
      <button class="btn" data-close="1">Close</button>
    `,
  });
}

/** Wire DOM event listeners for the Calendar card */
export function afterCalendar(root) {
  const container = root || document;

  // Course filter dropdown
  const courseSel = q("#calendarCourseSelect", container);
  if (courseSel) {
    courseSel.addEventListener("change", () => {
      UIState.set("calendarCourseId", courseSel.value);
      Router.scheduleRender();
    });
  }
}

/** Full-page Calendar view function */
export function calendarView() {
  return `<div class="moodle-dashboard-container">${renderCalendarCard()}</div>`;
}

export { academicCalendarModal };

export const calendarViewDef = {
  fn: calendarView,
  after: afterCalendar,
};
