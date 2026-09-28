/**
 * Event/to-do modal — create and edit academic tasks with clean information hierarchy.
 * Focuses on title, course context, priority, deadline, status, and notes.
 * Grading calculations, weights, and points clutter have been removed.
 */

import { CFG } from "../../config/constants.js";
import { Store } from "../../core/store.js";
import { UIState } from "../../core/scope.js";
import { Tasks } from "../../domain/tasks.js";
import { esc, uid } from "../../utils/helpers.js";
import { q, toast } from "../../utils/dom.js";
import { modal, confirm } from "../../utils/feedback.js";
import { courseSelectOptions, commit } from "../shared.js";

export function eventModal(eventId, preset) {
  preset = preset || {};
  const e = eventId ? Store.event(eventId) : null;
  const defaultType = e ? e.type : preset.type || "assignment";

  const typeOpts = Object.keys(CFG.taskTypes)
    .map(function (k) {
      const t = CFG.taskTypes[k];
      return (
        '<option value="' +
        k +
        '"' +
        (k === defaultType ? " selected" : "") +
        ">" +
        esc(t.label) +
        "</option>"
      );
    })
    .join("");

  const curPri = e
    ? e.priority || Tasks.priority(e).label
    : preset.priority || "Medium";
  const priOpts = ["Critical", "High", "Medium", "Low"]
    .map(function (p) {
      return (
        '<option value="' +
        p +
        '"' +
        (p === curPri ? " selected" : "") +
        ">" +
        p +
        " priority</option>"
      );
    })
    .join("");

  const curStatus = e ? e.status : preset.status || "todo";
  const statusOpts = [
    { val: "todo", label: "Not started" },
    { val: "doing", label: "In progress" },
    { val: "done", label: "Completed" },
  ]
    .map(function (s) {
      return (
        '<option value="' +
        s.val +
        '"' +
        (s.val === curStatus ? " selected" : "") +
        ">" +
        s.label +
        "</option>"
      );
    })
    .join("");

  const curCourseId = e
    ? e.courseId
    : preset.courseId ||
      (UIState.courseId !== "all" ? UIState.courseId : "");

  const courseOpts =
    '<option value=""' +
    (!curCourseId ? " selected" : "") +
    ">General (No course)</option>" +
    courseSelectOptions(curCourseId, false);

  const dueDateVal =
    e && e.due
      ? e.due.slice(0, 10)
      : preset.due
        ? preset.due.slice(0, 10)
        : "";

  const dueTimeVal =
    e && e.due && e.due.length > 10
      ? e.due.slice(11, 16)
      : preset.due && preset.due.length > 10
        ? preset.due.slice(11, 16)
        : "23:59";

  // ── INFORMATION HIERARCHY ───────────────────────────────────────────
  // 1. Primary Identity: To-do Title
  // 2. Organization: Course, Priority, Category (3-column grid)
  // 3. Scheduling & Status: Due Date, Due Time, Status (3-column grid)
  // 4. Details: Notes & instructions textarea
  // 5. Provenance: Source information badge (if syllabus-imported)
  const body =
    '<div class="event-modal-content">' +
    '<label class="fld" for="evTitle">' +
    '<span>To-do title <strong class="u-crit">*</strong></span>' +
    '<input id="evTitle" type="text" placeholder="e.g. Problem Set 2 or Chapter 4 Summary" value="' +
    esc(e ? e.title : preset.title || "") +
    '" autocomplete="off" autofocus>' +
    "</label>" +
    '<div class="grid g3">' +
    '<label class="fld" for="evCourse">' +
    "<span>Course</span>" +
    '<select id="evCourse">' +
    courseOpts +
    "</select>" +
    "</label>" +
    '<label class="fld" for="evPriority">' +
    "<span>Priority</span>" +
    '<select id="evPriority">' +
    priOpts +
    "</select>" +
    "</label>" +
    '<label class="fld" for="evType">' +
    "<span>Category</span>" +
    '<select id="evType">' +
    typeOpts +
    "</select>" +
    "</label>" +
    "</div>" +
    '<div class="grid g3">' +
    '<label class="fld" for="evDue">' +
    "<span>Due date</span>" +
    '<input id="evDue" type="date" value="' +
    esc(dueDateVal) +
    '">' +
    "</label>" +
    '<label class="fld" for="evTime">' +
    "<span>Due time</span>" +
    '<input id="evTime" type="time" value="' +
    esc(dueTimeVal) +
    '">' +
    "</label>" +
    '<label class="fld" for="evStatus">' +
    "<span>Status</span>" +
    '<select id="evStatus">' +
    statusOpts +
    "</select>" +
    "</label>" +
    "</div>" +
    '<label class="fld" for="evNotes">' +
    "<span>Notes & instructions</span>" +
    '<textarea id="evNotes" rows="3" placeholder="Add requirements, submission links, or study notes...">' +
    esc(e ? e.notes || "" : "") +
    "</textarea>" +
    "</label>" +
    (e && (e.sourceDocId || e.source === "import")
      ? '<div  class="row tiny muted u-mt-2"><span>Source: ' +
        (e.sourceDocId
          ? esc((Store.doc(e.sourceDocId) || {}).name || "document")
          : "syllabus import") +
        "</span>" +
        (e.confidence
          ? '<span class="badge ' +
            (e.confidence >= 0.75
              ? "ok"
              : e.confidence >= 0.55
                ? "info"
                : "high") +
            '">extraction confidence ' +
            Math.round(e.confidence * 100) +
            "%</span>"
          : "") +
        "</div>"
      : "") +
    "</div>";

  const footer =
    (e
      ? '<button type="button" class="btn danger" id="evDelete">Delete to-do</button><span class="spacer"></span>'
      : '<span class="spacer"></span>') +
    '<button type="button" class="btn" data-close="1">Cancel</button>' +
    '<button type="button" class="btn primary" id="evSave">' +
    (e ? "Save changes" : "Add to-do") +
    "</button>";

  modal({
    title: e ? "Edit to-do" : "New to-do",
    wide: false,
    body: body,
    footer: footer,
    onMount: function (m, closeFn) {
      q("#evSave", m).addEventListener("click", function () {
        const title = q("#evTitle", m).value.trim();
        if (!title) {
          toast("Please enter a to-do title.", "warn");
          q("#evTitle", m).focus();
          return;
        }

        const dueDate = q("#evDue", m).value;
        const dueTime = q("#evTime", m).value || "23:59";
        const due = dueDate ? dueDate + "T" + dueTime : null;
        const type = q("#evType", m).value;
        const courseId = q("#evCourse", m).value || null;
        const priorityVal = q("#evPriority", m)?.value || "Medium";
        const status = q("#evStatus", m).value;
        const notes = q("#evNotes", m).value.trim();

        const target = e || {
          id: uid("ev"),
          createdAt: new Date().toISOString(),
          points: null,
          pointsEarned: null,
          sourceDocId: null,
          confidence: 1,
          readingIds: [],
          subtasks: [],
        };

        target.title = title;
        target.type = type;
        target.courseId = courseId;
        target.due = due;
        target.priority = priorityVal;
        target.notes = notes;
        target.status = status;
        target.subtasks = e ? e.subtasks || [] : [];

        // Preserve existing weight & points if they previously existed
        target.weight = e && e.weight != null ? e.weight : null;
        target.points = e && e.points != null ? e.points : null;
        target.pointsEarned =
          e && e.pointsEarned != null ? e.pointsEarned : null;
        if (target.points == null && !target.weight)
          target.grade = e ? e.grade : null;

        if (status === "done" && target.subtasks.length) {
          target.subtasks.forEach(function (s) {
            s.done = true;
          });
        }

        if (!e) Store.db.events.push(target);
        Tasks.recompute(target);
        commit(closeFn, e ? "To-do updated." : "To-do added.");
      });

      const del = q("#evDelete", m);
      if (del) {
        del.addEventListener("click", function () {
          confirm('Delete "' + e.title + '"?', {
            title: "Delete to-do",
            ok: "Delete",
            danger: true,
          }).then(function (yes) {
            if (!yes) return;
            Store.db.events = Store.db.events.filter(function (x) {
              return x.id !== e.id;
            });
            Store.db.plan = Store.db.plan.filter(function (p) {
              return p.eventId !== e.id;
            });
            commit(closeFn, "To-do deleted.", "ok");
          });
        });
      }
    },
  });
}
