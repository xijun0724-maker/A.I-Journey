/**
 * Shared UI helper functions for Journey A.I Views
 * Scope/course filtering lives in core/scope.js.
 * This module re-exports them alongside view-specific helpers
 * (typeMeta, courseSelectOptions, pageHead, etc.).
 */

import { CFG } from "../config/constants.js";
import { Store } from "../core/store.js";
import { UIState } from "../core/scope.js";
import { Router } from "../core/router.js";
import { esc } from "../utils/helpers.js";
import { toast, toastSaved } from "../utils/dom.js";

export {
  courses,
  courseIds,
  inScope,
  events,
  lessons,
  readings,
  docs,
  eventProgress,
} from "../core/scope.js";

export {
  bar,
  ring,
  empty,
  priBadge,
  statusBadge,
  eventBadge,
  courseChip,
  dueLabel,
  statBox,
  tabBtn,
} from "../utils/format.js";

export { toastSaved };

function typeMeta(t) {
  return CFG.taskTypes[t] || CFG.taskTypes.other;
}

function courseSelectOptions(selected, allowAll) {
  let h = allowAll
    ? '<option value="all"' +
      (selected === "all" ? " selected" : "") +
      ">All courses</option>"
    : "";
  Store.db.courses.forEach((c) => {
    h +=
      '<option value="' +
      esc(c.id) +
      '"' +
      (selected === c.id ? " selected" : "") +
      ">" +
      esc(c.code || c.title) +
      "</option>";
  });
  return h;
}

function defaultCourseId(item) {
  return item
    ? item.courseId
    : UIState.courseId !== "all"
      ? UIState.courseId
      : Store.db.courses[0] && Store.db.courses[0].id;
}

export function pageHead(title, lead, right) {
  let h =
    '<div class="page-head"><div><h1>' + esc(title == null ? "" : title) + "</h1>";
  if (lead) h += '<p class="lead">' + esc(lead) + "</p>";
  h += "</div>";
  if (right) h += '<span class="spacer"></span>' + right;
  h += "</div>";
  return h;
}

export function truncate(text, max) {
  const s = String(text == null ? "" : text);
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}

export function commit(closeFn, msg, kind) {
  Store.saveNow();
  closeFn();
  Router.scheduleRender();
  kind ? toast(msg, kind) : toastSaved(msg);
}

export function tableHtml({ label, header, rows, cls }) {
  return (
    '<div class="tbl-wrap' +
    (cls ? " " + cls : "") +
    '"><table aria-label="' +
    label +
    '"><tbody>' +
    (header
      ? "<tr>" + header.map((c) => "<th>" + esc(c) + "</th>").join("") + "</tr>"
      : "") +
    rows
      .map((row) => "<tr>" + row.map((c) => "<td>" + esc(c) + "</td>").join("") + "</tr>")
      .join("") +
    "</tbody></table></div>"
  );
}

export { typeMeta, courseSelectOptions, defaultCourseId };
