/**
 * Academic Calendar Modal — Configure Academic Term, Start & End Dates, and Key Milestones
 * Structured with strict visual & information hierarchy focusing on term start and end.
 */

import { Router } from "../../core/router.js";
import { esc } from "../../utils/helpers.js";
import { q, toast, applyDataStyles } from "../../utils/dom.js";
import { modal } from "../../utils/feedback.js";
import {
  getActiveAcademicCalendar,
  getAcademicCalendars,
  saveAcademicCalendar,
  calculateMilestones,
} from "../../domain/academic-calendar.js";

const YEAR_PRESETS = [
  "2024–2025",
  "2025–2026",
  "2026–2027",
  "2027–2028",
  "2028–2029",
];

const TERM_PRESETS = [
  "1st Term",
  "2nd Term",
  "3rd Term",
  "1st Semester",
  "2nd Semester",
  "Midyear / Summer Term",
];

/** Calculate duration statistics between start and end dates */
function calculateTermStats(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return { valid: false, error: "Term start date must be before term end date" };
  }
  const diffMs = end - start;
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1; // inclusive
  const weeks = Math.round((days / 7) * 10) / 10;
  return {
    valid: true,
    days,
    weeks,
    startFmt: start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    endFmt: end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  };
}

/** Render live duration card HTML */
function renderDurationCardHtml(stats) {
  if (!stats) {
    return '<div class="small muted">Select start and end dates to calculate term duration.</div>';
  }
  if (!stats.valid) {
    return '<div class="ac-duration-warning">' + esc(stats.error) + '</div>';
  }
  return `
    <div class="ac-duration-stats">
      <div class="ac-duration-stat-item">
        <span class="ac-duration-stat-val">${stats.days}</span>
        <span class="ac-duration-stat-lbl">Calendar Days</span>
      </div>
      <div class="ac-duration-divider"></div>
      <div class="ac-duration-stat-item">
        <span class="ac-duration-stat-val">${stats.weeks}</span>
        <span class="ac-duration-stat-lbl">Academic Weeks</span>
      </div>
    </div>
    <div class="ac-duration-range-text">
      ${esc(stats.startFmt)} &rarr; ${esc(stats.endFmt)}
    </div>
  `;
}

/** Render milestone preview items derived from start and end dates */
function renderMilestonesPreviewHtml(startIso, endIso, termName) {
  const milestones = calculateMilestones(startIso, endIso, termName || "Term");
  if (!milestones.length) return "";

  let h = '<div class="ac-milestone-preview-list">';
  milestones.forEach((m) => {
    const d = new Date(m.due);
    const dateFormatted = isNaN(d.getTime())
      ? m.due.slice(0, 10)
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const isExam = m.type === "exam";
    const bulletColor = isExam ? "#7c3aed" : "#0f6cbf";

    h += `
      <div class="ac-milestone-preview-row">
        <span class="ac-milestone-preview-title">
          <span class="cal-event-bullet" data-style="border-color:${bulletColor};" aria-hidden="true"></span>
          <span>${esc(m.title)}</span>
        </span>
        <span class="ac-milestone-preview-date">${esc(dateFormatted)}</span>
      </div>
    `;
  });
  h += '</div>';
  return h;
}

/**
 * Open the Academic Calendar modal
 * @param {string} [calendarId] - Optional existing calendar ID to edit
 */
export function academicCalendarModal(calendarId) {
  const current = getActiveAcademicCalendar();
  const savedList = getAcademicCalendars();
  const existing = calendarId
    ? savedList.find((c) => c.id === calendarId)
    : null;

  const initialYear = existing ? existing.academicYear : (current.academicYear || "2026–2027");
  const initialTerm = existing ? existing.termName : (current.termName || "1st Term");
  const initialStart = existing ? existing.termStart : current.termStart;
  const initialEnd = existing ? existing.termEnd : current.termEnd;
  const initialStats = calculateTermStats(initialStart, initialEnd);

  let body = '<div class="academic-cal-modal-content">';

  // ── HIERARCHY LEVEL 1: FOCAL FUNCTION — WHEN TERM STARTS & ENDS ─────────
  body += '<section class="ac-modal-section ac-section-primary">';
  body += '<div class="ac-section-header">';
  body += '<span class="ac-section-badge">Primary Schedule Anchor</span>';
  body += '<h3 class="ac-section-title">Term Start &amp; End Dates</h3>';
  body += '<p class="ac-section-subtitle">Define when this semester begins and concludes. Syllabus pacing and deadline countdowns anchor to these dates.</p>';
  body += '</div>';

  body += '<div class="grid g2 ac-dates-grid">';
  body += '<label class="fld" for="acStart">';
  body += '<span>Term start date <strong class="u-accent">*</strong></span>';
  body += '<input id="acStart" type="date" value="' + esc(initialStart) + '" aria-required="true">';
  body += '<span class="hint">First day of classes</span>';
  body += '</label>';

  body += '<label class="fld" for="acEnd">';
  body += '<span>Term end date <strong class="u-accent">*</strong></span>';
  body += '<input id="acEnd" type="date" value="' + esc(initialEnd) + '" aria-required="true">';
  body += '<span class="hint">Final day / conclusion</span>';
  body += '</label>';
  body += '</div>';

  // Live Duration & Cadence Card
  body += '<div class="ac-duration-card" id="acDurationCard">';
  body += renderDurationCardHtml(initialStats);
  body += '</div>';
  body += '</section>';

  // ── HIERARCHY LEVEL 2: ACADEMIC CONTEXT & IDENTIFICATION ─────────────────
  body += '<section class="ac-modal-section">';
  body += '<div class="ac-section-header">';
  body += '<span class="ac-section-badge secondary">Academic Context</span>';
  body += '<h3 class="ac-section-title">Academic Year &amp; Term</h3>';
  body += '</div>';

  body += '<div class="grid g2">';
  body += '<label class="fld" for="acYear"><span>Academic Year</span>';
  body += '<input list="acYearPresets" id="acYear" placeholder="e.g. 2026–2027" value="' + esc(initialYear) + '">';
  body += '<datalist id="acYearPresets">';
  YEAR_PRESETS.forEach((y) => {
    body += '<option value="' + esc(y) + '">';
  });
  body += '</datalist></label>';

  body += '<label class="fld" for="acTerm"><span>Term / Semester</span>';
  body += '<input list="acTermPresets" id="acTerm" placeholder="e.g. 1st Term" value="' + esc(initialTerm) + '">';
  body += '<datalist id="acTermPresets">';
  TERM_PRESETS.forEach((t) => {
    body += '<option value="' + esc(t) + '">';
  });
  body += '</datalist></label>';
  body += '</div>';
  body += '</section>';

  // ── HIERARCHY LEVEL 3: DERIVED SCHEDULE MILESTONES ───────────────────────
  body += '<section class="ac-modal-section">';
  body += '<div class="ac-section-header">';
  body += '<span class="ac-section-badge secondary">Key Milestones</span>';
  body += '<h3 class="ac-section-title">Term Milestones Cadence</h3>';
  body += '</div>';

  body += '<div class="ac-milestones-box">';
  body += '<label class="ac-milestone-checkbox-label" for="acMilestones">';
  body += '<input id="acMilestones" type="checkbox" checked class="u-pointer-mt-2">';
  body += '<div>';
  body += '<strong>Auto-generate key milestones from term dates</strong>';
  body += '<span>Automatically calculates calendar markers for Classes Begin, Midterms, Finals, and Term End.</span>';
  body += '</div>';
  body += '</label>';

  body += '<div class="ac-milestones-preview" id="acMilestonesPreview">';
  body += renderMilestonesPreviewHtml(initialStart, initialEnd, initialTerm);
  body += '</div>';
  body += '</div>';
  body += '</section>';

  // ── HIERARCHY LEVEL 4: SAVED TERMS REGISTRY ─────────────────────────────
  if (savedList.length > 0) {
    body += '<section  class="ac-modal-section u-section-head">';
    body += '<span class="u-kicker">Saved Academic Terms</span>';
    body += '<div class="u-chips-6">';
    savedList.forEach((c) => {
      const isAct = c.isActive || (c.academicYear === current.academicYear && c.termName === current.termName);
      body += '<button type="button" class="btn xs ' + (isAct ? 'primary' : 'ghost') + '" data-switch-cal="' + esc(c.id) + '">';
      body += esc(c.academicYear) + ' &middot; ' + esc(c.termName);
      if (isAct) body += ' (Active)';
      body += '</button>';
    });
    body += '</div>';
    body += '</section>';
  }

  body += '</div>'; // .academic-cal-modal-content

  const footer =
    '<button type="button" class="btn" data-close="1">Cancel</button>' +
    '<button type="button" class="btn primary" id="btnSaveAcademicCal">Save & Apply Academic Calendar</button>';

  const close = modal({
    title: "Academic Calendar & Term Dates",
    body: body,
    footer: footer,
    wide: false,
    onMount: function () {
      const startInput = q("#acStart");
      const endInput = q("#acEnd");
      const termInput = q("#acTerm");
      const durationCard = q("#acDurationCard");
      const milestonesPreview = q("#acMilestonesPreview");
      const milestonesCheckbox = q("#acMilestones");

      // Live update duration and milestones on date changes
      function updateLiveFeedback() {
        const sVal = startInput?.value || "";
        const eVal = endInput?.value || "";
        const tVal = termInput?.value || "Term";
        const stats = calculateTermStats(sVal, eVal);

        if (durationCard) {
          durationCard.innerHTML = renderDurationCardHtml(stats);
        }

        if (milestonesPreview && milestonesCheckbox) {
          if (milestonesCheckbox.checked && stats && stats.valid) {
            milestonesPreview.innerHTML = renderMilestonesPreviewHtml(sVal, eVal, tVal);
            /* Re-rendered after mount, so Router/modal's one-time pass has
               already run — apply this batch's data-style ourselves. */
            applyDataStyles(milestonesPreview);
            milestonesPreview.style.display = "flex";
          } else {
            milestonesPreview.innerHTML = "";
            milestonesPreview.style.display = "none";
          }
        }
      }

      if (startInput) startInput.addEventListener("input", updateLiveFeedback);
      if (endInput) endInput.addEventListener("input", updateLiveFeedback);
      if (termInput) termInput.addEventListener("input", updateLiveFeedback);
      if (milestonesCheckbox) milestonesCheckbox.addEventListener("change", updateLiveFeedback);

      // Save button
      const saveBtn = q("#btnSaveAcademicCal");
      if (saveBtn) {
        saveBtn.addEventListener("click", function () {
          const year = (q("#acYear")?.value || "").trim();
          const term = (q("#acTerm")?.value || "").trim();
          const start = q("#acStart")?.value || "";
          const end = q("#acEnd")?.value || "";
          const genMilestones = q("#acMilestones")?.checked ?? true;

          if (!start) {
            toast("Please select a Term start date", "warn");
            return;
          }
          if (!end) {
            toast("Please select a Term end date", "warn");
            return;
          }
          if (start > end) {
            toast("Term start date must be before term end date", "warn");
            return;
          }
          if (!year) {
            toast("Please enter an Academic Year (e.g. 2026–2027)", "warn");
            return;
          }
          if (!term) {
            toast("Please enter a Term or Semester name", "warn");
            return;
          }

          saveAcademicCalendar({
            academicYear: year,
            termName: term,
            termStart: start,
            termEnd: end,
            generateMilestones: genMilestones,
            id: existing ? existing.id : undefined,
          });

          toast("Academic calendar saved: " + term + " (" + year + ")", "ok");
          close();
          Router.scheduleRender();
        });
      }

      // Handle switching to a saved calendar
      const switchBtns = document.querySelectorAll("[data-switch-cal]");
      switchBtns.forEach((btn) => {
        btn.addEventListener("click", function () {
          const targetId = btn.getAttribute("data-switch-cal");
          const target = savedList.find((c) => c.id === targetId);
          if (target) {
            saveAcademicCalendar({
              academicYear: target.academicYear,
              termName: target.termName,
              termStart: target.termStart,
              termEnd: target.termEnd,
              generateMilestones: false,
              id: target.id,
            });
            toast("Switched to " + target.termName + " (" + target.academicYear + ")", "ok");
            close();
            Router.scheduleRender();
          }
        });
      });
    },
  });
}
