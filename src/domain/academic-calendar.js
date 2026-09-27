/**
 * Academic Calendar domain logic for Journey A.I
 * Handles academic terms, academic years, calendar anchors, and milestone generation.
 */

import { Store } from "../core/store.js";
import { dateOnly, fromIso, addDays, DAY } from "../utils/date.js";
import { uid } from "../utils/helpers.js";

/**
 * Get active academic calendar settings
 * @returns {Object} { academicYear, termName, termStart, termEnd }
 */
export function getActiveAcademicCalendar() {
  const s = Store.db.settings || {};
  return {
    academicYear: s.academicYear || "2026–2027",
    termName: s.termName || "1st Term",
    termStart: s.termStart || "",
    termEnd: s.termEnd || "",
  };
}

/**
 * Get all stored academic calendars
 * @returns {Array} List of academic calendar records
 */
export function getAcademicCalendars() {
  return Store.db.academicCalendars || [];
}

/**
 * Calculate standard academic milestones for a given date range
 * @param {string} startIso - Term start date YYYY-MM-DD
 * @param {string} endIso - Term end date YYYY-MM-DD
 * @param {string} [termName] - Optional term name
 * @returns {Array} Array of milestone definitions
 */
export function calculateMilestones(startIso, endIso, termName = "Term") {
  const start = fromIso(startIso);
  const end = fromIso(endIso);
  if (!start || !end || end <= start) return [];

  const totalDays = Math.max(1, Math.round((end - start) / DAY));

  // Key academic cadence points:
  // 1. Classes begin (Day 0)
  // 2. Midterm examinations (approx 45% - 50% through semester, e.g. Week 8-9)
  // 3. Final examinations (approx 85% - 90% through semester, e.g. Week 16-17)
  // 4. Term conclusion (End date)
  const midtermDate = addDays(start, Math.round(totalDays * 0.48));
  const finalsDate = addDays(start, Math.max(0, totalDays - 14));

  return [
    {
      title: `${termName} Classes Begin`,
      due: `${dateOnly(start)}T08:00:00`,
      type: "other",
      tag: "academic-milestone",
    },
    {
      title: `${termName} Midterm Examination Week`,
      due: `${dateOnly(midtermDate)}T09:00:00`,
      type: "exam",
      tag: "academic-milestone",
    },
    {
      title: `${termName} Final Examination Week`,
      due: `${dateOnly(finalsDate)}T09:00:00`,
      type: "exam",
      tag: "academic-milestone",
    },
    {
      title: `${termName} Officially Concludes`,
      due: `${dateOnly(end)}T17:00:00`,
      type: "other",
      tag: "academic-milestone",
    },
  ];
}

/**
 * Save or update an academic calendar, set it active, and optionally generate milestones.
 * @param {Object} params
 * @param {string} params.academicYear - e.g. "2026–2027"
 * @param {string} params.termName - e.g. "1st Term" or "1st Semester"
 * @param {string} params.termStart - YYYY-MM-DD
 * @param {string} params.termEnd - YYYY-MM-DD
 * @param {boolean} [params.generateMilestones] - Whether to insert milestone events
 * @param {string} [params.id] - Optional ID for updating existing record
 * @returns {Object} Saved calendar object
 */
export function saveAcademicCalendar({
  academicYear,
  termName,
  termStart,
  termEnd,
  generateMilestones = false,
  id,
}) {
  if (!academicYear) academicYear = "2026–2027";
  if (!termName) termName = "1st Term";
  if (!termStart) termStart = dateOnly(new Date());
  if (!termEnd) termEnd = dateOnly(addDays(fromIso(termStart) || new Date(), 120));

  // 1. Update active settings through the Store namespace (notifies + persists)
  Store.settings.update({ academicYear, termName, termStart, termEnd });

  // 2. Manage academicCalendars registry
  if (!Array.isArray(Store.db.academicCalendars)) {
    Store.db.academicCalendars = [];
  }

  // Deactivate others
  Store.db.academicCalendars.forEach((c) => {
    c.isActive = false;
  });

  const calId = id || `cal-${uid()}`;
  const existing = Store.db.academicCalendars.find((c) => c.id === calId);

  const calRecord = {
    id: calId,
    academicYear,
    termName,
    termStart,
    termEnd,
    isActive: true,
    updatedAt: new Date().toISOString(),
  };

  if (existing) {
    Object.assign(existing, calRecord);
  } else {
    Store.db.academicCalendars.push(calRecord);
  }

  // 3. Optional Milestone Generation into Store.db.events
  if (generateMilestones) {
    // Remove previous auto-generated milestones for this term if any
    Store.db.events = (Store.db.events || []).filter(
      (e) => !(e.academicCalId === calId || (e.tag === "academic-milestone" && e.termName === termName)),
    );

    const milestones = calculateMilestones(termStart, termEnd, termName);
    milestones.forEach((m) => {
      Store.db.events.push({
        id: `ev-${uid()}`,
        title: m.title,
        courseId: null,
        due: m.due,
        type: m.type,
        status: "open",
        tag: "academic-milestone",
        academicCalId: calId,
        termName: termName,
        academicYear: academicYear,
        notes: `Academic Calendar Milestone for ${academicYear} ${termName}`,
        subtasks: [],
      });
    });
  }

  Store.saveNow();
  return calRecord;
}
