/**
 * Calendar Configuration Modal — configure start of week, cell event density,
 * category visibility filters, and time format for Journey A.I
 */

import { Router } from "../../core/router.js";
import { esc } from "../../utils/helpers.js";
import { q, toast } from "../../utils/dom.js";
import { modal } from "../../utils/feedback.js";
import { getActiveAcademicCalendar } from "../../domain/academic-calendar.js";
import { academicCalendarModal } from "./academic-calendar.js";
import { getCalendarConfig, configureCalendar } from "../calendar.js";

/**
 * Open the Calendar Configuration modal
 */
export function calendarConfigModal() {
  const cfg = getCalendarConfig();
  const activeCal = getActiveAcademicCalendar();

  let body = '<div class="cal-config-modal-content">';

  // 1. Cadence & Density Section
  body += '<div class="cal-config-section">';
  body += '<h3 class="cal-config-section-title">Cadence & Density</h3>';
  body += '<div class="cal-config-grid">';

  // Start of week
  body += '<label class="fld" for="calStartOfWeek">';
  body += '<span>Start of week</span>';
  body += '<select id="calStartOfWeek">';
  body += '<option value="1"' + (cfg.startOfWeek === 1 ? ' selected' : '') + '>Monday (Standard academic week)</option>';
  body += '<option value="0"' + (cfg.startOfWeek === 0 ? ' selected' : '') + '>Sunday</option>';
  body += '</select>';
  body += '</label>';

  // Max events per cell
  body += '<label class="fld" for="calMaxEvents">';
  body += '<span>Max events visible per day</span>';
  body += '<select id="calMaxEvents">';
  [2, 3, 4, 5, 6].forEach((n) => {
    body += '<option value="' + n + '"' + (cfg.maxEventsPerCell === n ? ' selected' : '') + '>' + n + ' events' + (n === 4 ? ' (recommended)' : '') + '</option>';
  });
  body += '</select>';
  body += '</label>';

  body += '</div>'; // .cal-config-grid
  body += '</div>'; // .cal-config-section

  // 2. Time Notation
  body += '<div class="cal-config-section">';
  body += '<h3 class="cal-config-section-title">Time Notation</h3>';
  body += '<div class="cal-config-grid">';
  body += '<label class="fld" for="calTimeFormat">';
  body += '<span>Time display format</span>';
  body += '<select id="calTimeFormat">';
  body += '<option value="12h"' + (cfg.timeFormat === "12h" ? ' selected' : '') + '>12-hour AM/PM (e.g. 2:30 PM)</option>';
  body += '<option value="24h"' + (cfg.timeFormat === "24h" ? ' selected' : '') + '>24-hour (e.g. 14:30)</option>';
  body += '</select>';
  body += '</label>';
  body += '</div>';
  body += '</div>';

  // 3. Category Visibility Filters
  body += '<div class="cal-config-section">';
  body += '<h3 class="cal-config-section-title">Category Visibility</h3>';
  body += '<p class="cal-config-section-desc">Choose which event types to show on your monthly calendar grid.</p>';
  body += '<div class="cal-category-toggles">';

  // Assignments & Projects
  body += '<label class="cal-toggle-row" for="calShowAssignments">';
  body += '<input type="checkbox" id="calShowAssignments" class="cal-checkbox"' + (cfg.showAssignments ? ' checked' : '') + '>';
  body += '<span  class="cal-event-bullet u-dot-orange" aria-hidden="true"></span>';
  body += '<div class="cal-toggle-label">';
  body += '<span class="cal-toggle-title">Course Assignments & Projects</span>';
  body += '<span class="cal-toggle-desc">Homework submissions, lab projects, and paper deliverables</span>';
  body += '</div>';
  body += '</label>';

  // Exams & Quizzes
  body += '<label class="cal-toggle-row" for="calShowExams">';
  body += '<input type="checkbox" id="calShowExams" class="cal-checkbox"' + (cfg.showExams ? ' checked' : '') + '>';
  body += '<span  class="cal-event-bullet u-dot-violet" aria-hidden="true"></span>';
  body += '<div class="cal-toggle-label">';
  body += '<span class="cal-toggle-title">Exams & Quizzes</span>';
  body += '<span class="cal-toggle-desc">Midterm exams, final exams, periodical tests, and online quizzes</span>';
  body += '</div>';
  body += '</label>';

  // Academic Milestones
  body += '<label class="cal-toggle-row" for="calShowMilestones">';
  body += '<input type="checkbox" id="calShowMilestones" class="cal-checkbox"' + (cfg.showMilestones ? ' checked' : '') + '>';
  body += '<span  class="cal-event-bullet u-dot-blue" aria-hidden="true"></span>';
  body += '<div class="cal-toggle-label">';
  body += '<span class="cal-toggle-title">Academic Term Milestones</span>';
  body += '<span class="cal-toggle-desc">Classes begin, examination periods, and term conclusion dates</span>';
  body += '</div>';
  body += '</label>';

  // General & Other
  body += '<label class="cal-toggle-row" for="calShowOther">';
  body += '<input type="checkbox" id="calShowOther" class="cal-checkbox"' + (cfg.showOther ? ' checked' : '') + '>';
  body += '<span  class="cal-event-bullet u-dot-slate" aria-hidden="true"></span>';
  body += '<div class="cal-toggle-label">';
  body += '<span class="cal-toggle-title">General, Attendance & Other</span>';
  body += '<span class="cal-toggle-desc">Course attendance records, personal study reminders, and consultations</span>';
  body += '</div>';
  body += '</label>';

  body += '</div>'; // .cal-category-toggles
  body += '</div>'; // .cal-config-section

  // 4. Academic Term Linkage Card
  body += '<div class="cal-term-summary-card">';
  body += '<div class="cal-term-info">';
  body += '<span class="cal-term-eyebrow">Academic Term Cadence</span>';
  body += '<strong class="cal-term-name">' + esc(activeCal.academicYear || "2026–2027") + ' &middot; ' + esc(activeCal.termName || "1st Term") + '</strong>';
  if (activeCal.termStart && activeCal.termEnd) {
    body += '<span class="cal-term-dates">' + esc(activeCal.termStart) + ' &rarr; ' + esc(activeCal.termEnd) + '</span>';
  }
  body += '</div>';
  body += '<button type="button" class="btn sm" id="btnOpenAcademicModalFromConfig">Term Setup</button>';
  body += '</div>';

  body += '</div>'; // .cal-config-modal-content

  const footer =
    '<div class="u-bar-wrap">' +
    '<button type="button" class="btn ghost sm" id="btnCalResetDefaults">Reset to defaults</button>' +
    '<div class="u-row-8">' +
    '<button type="button" class="btn" data-close="1">Cancel</button>' +
    '<button type="button" class="btn primary" id="btnSaveCalConfig">Save preferences</button>' +
    '</div></div>';

  const close = modal({
    title: "Calendar Preferences",
    body: body,
    footer: footer,
    wide: false,
    onMount: () => {
      // 1. Reset to defaults button
      const resetBtn = q("#btnCalResetDefaults");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          const selStart = q("#calStartOfWeek");
          const selMax = q("#calMaxEvents");
          const selTime = q("#calTimeFormat");
          const chkAssign = q("#calShowAssignments");
          const chkExams = q("#calShowExams");
          const chkMiles = q("#calShowMilestones");
          const chkOther = q("#calShowOther");

          if (selStart) selStart.value = "1";
          if (selMax) selMax.value = "4";
          if (selTime) selTime.value = "12h";
          if (chkAssign) chkAssign.checked = true;
          if (chkExams) chkExams.checked = true;
          if (chkMiles) chkMiles.checked = true;
          if (chkOther) chkOther.checked = true;
          toast("Calendar settings reset to defaults. Click Save to apply.", "info");
        });
      }

      // 2. Open Academic Calendar modal from here
      const termBtn = q("#btnOpenAcademicModalFromConfig");
      if (termBtn) {
        termBtn.addEventListener("click", () => {
          close();
          academicCalendarModal();
        });
      }

      // 3. Save preferences
      const saveBtn = q("#btnSaveCalConfig");
      if (saveBtn) {
        saveBtn.addEventListener("click", () => {
          const startOfWeek = Number(q("#calStartOfWeek")?.value || 1);
          const maxEventsPerCell = Number(q("#calMaxEvents")?.value || 4);
          const timeFormat = q("#calTimeFormat")?.value === "24h" ? "24h" : "12h";
          const showAssignments = q("#calShowAssignments")?.checked ?? true;
          const showExams = q("#calShowExams")?.checked ?? true;
          const showMilestones = q("#calShowMilestones")?.checked ?? true;
          const showOther = q("#calShowOther")?.checked ?? true;

          configureCalendar({
            startOfWeek,
            maxEventsPerCell,
            timeFormat,
            showAssignments,
            showExams,
            showMilestones,
            showOther,
          });

          toast("Calendar preferences saved", "ok");
          close();
          Router.scheduleRender();
        });
      }
    },
  });
}
