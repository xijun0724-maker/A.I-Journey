/**
 * Export action handlers (roadmap, CSV)
 */

import { Store } from "../store.js";
import { toast } from "../../utils/dom.js";
import { csv } from "../../utils/helpers.js";
import { stripKey } from "../../utils/secure.js";

export function exportData() {
  const snapshot = stripKey(Store.db);
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download =
    "journeyai-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000); // matches CFG.timeouts
  toast("Data exported.", "ok");
}

/**
 * Build the schedule CSV for a plan.
 *
 * Pure so it can be tested without a DOM: the previous CSV assertion in the
 * suite re-implemented the escaping inline and never called this code, which
 * is how a renamed exporter shipped while its test stayed green.
 *
 * @param {Array} plan - Store.db.plan
 * @param {(courseId: string|null) => string} courseName - id -> label resolver
 * @returns {string} CSV text, header included
 */
export function planToCSV(plan, courseName) {
  const rows = [["Date", "Task", "Course", "Minutes", "Done"]];
  (plan || []).forEach((p) => {
    rows.push([p.date, p.label, courseName(p.courseId), p.minutes, p.done]);
  });
  return csv(rows) + "\n";
}

export function exportRoadmap() {
  try {
    const csv = planToCSV(Store.db.plan, (id) => Store.courseName(id));
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "journeyai-schedule.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast("Schedule exported.", "ok");
  } catch (e) {
    toast("Failed to export schedule: " + e.message, "bad");
  }
}
