/**
 * Course modal — create and edit courses
 */

import { CFG } from "../../config/constants.js";
import { Store } from "../../core/store.js";
import { esc, uid } from "../../utils/helpers.js";
import { q, toast } from "../../utils/dom.js";
import { modal } from "../../utils/feedback.js";
import { commit } from "../shared.js";

export function courseModal(courseId) {
  const c = courseId ? Store.course(courseId) : null;
  const colors = CFG.palette;
  const body =
    '<div class="grid g2">' +
    '<label class="fld"><span>Course code</span><input id="cmCode" placeholder="CS 301" value="' +
    esc(c ? c.code : "") +
    '"></label>' +
    '<label class="fld"><span>Colour</span><select id="cmColor">' +
    colors
      .map(function (col) {
        return (
          '<option value="' +
          col +
          '"' +
          (c && c.color === col ? " selected" : "") +
          ' data-style="color:' +
          col +
          '">' +
          col +
          "</option>"
        );
      })
      .join("") +
    "</select></label>" +
    "</div>" +
    '<label class="fld"><span>Course title</span><input id="cmTitle" placeholder="Data Structures & Algorithms" value="' +
    esc(c ? c.title : "") +
    '"></label>' +
    '<div class="grid g3">' +
    '<label class="fld"><span>Year level</span><select id="cmYear">' +
    ["First Year", "Second Year", "Third Year", "Fourth Year", "Graduate"]
      .map(function (y) {
        const isSel = c && (c.yearLevel === y || (!c.yearLevel && c.term === y));
        return '<option value="' + y + '"' + (isSel ? " selected" : "") + ">" + y + "</option>";
      })
      .join("") +
    "</select></label>" +
    '<label class="fld"><span>Instructor</span><input id="cmInstructor" placeholder="Dr. R. Mehta" value="' +
    esc(c ? c.instructor || "" : "") +
    '"></label>' +
    '<label class="fld"><span>Term / Semester</span><input id="cmTerm" placeholder="1st Semester" value="' +
    esc(c ? c.term || "" : "") +
    '"></label>' +
    "</div>" +
    '<div class="grid g3">' +
    '<label class="fld"><span>Meeting days / time</span><input id="cmDays" placeholder="MWF 9:00" value="' +
    esc(c ? c.days || "" : "") +
    '"></label>' +
    '<label class="fld"><span>Room</span><input id="cmRoom" placeholder="Eng 214" value="' +
    esc(c ? c.room || "" : "") +
    '"></label>' +
    '<label class="fld"><span>Credits</span><input id="cmCredits" type="number" min="0" step="0.5" value="' +
    esc(c ? c.credits || 3 : 3) +
    '"></label>' +
    "</div>" +
    '<div class="grid g2">' +
    '<label class="fld"><span>Term starts</span><input id="cmStart" type="date" value="' +
    esc(c && c.startDate ? c.startDate : Store.db.settings.termStart) +
    '"></label>' +
    '<label class="fld"><span>Term ends</span><input id="cmEnd" type="date" value="' +
    esc(c && c.endDate ? c.endDate : Store.db.settings.termEnd) +
    '"></label>' +
    "</div>";
  const close = modal({
    title: c ? "Edit course" : "Add a course",
    body: body,
    footer:
      (c
        ? '<button type="button"  class="btn danger u-mr-auto" id="cmDelete" data-act="del-course" data-id="' +
          esc(c.id) +
          '" data-close="1">Delete course</button>'
        : "") +
      '<button class="btn" data-close="1">Cancel</button><button class="btn primary" id="cmSave">' +
      (c ? "Save changes" : "Create course") +
      "</button>",
    onMount: function (m, closeFn) {
      q("#cmSave", m).addEventListener("click", function () {
        const code = q("#cmCode", m).value.trim();
        const title = q("#cmTitle", m).value.trim();
        if (!code && !title) {
          toast("Give the course a code or a title.", "warn");
          return;
        }
        const payload = {
          code: code,
          title: title,
          color: q("#cmColor", m).value,
          yearLevel: q("#cmYear", m).value,
          instructor: q("#cmInstructor", m).value.trim(),
          term: q("#cmTerm", m).value.trim() || "Term",
          days: q("#cmDays", m).value.trim(),
          room: q("#cmRoom", m).value.trim(),
          credits: parseFloat(q("#cmCredits", m).value) || 3,
          startDate: q("#cmStart", m).value || null,
          endDate: q("#cmEnd", m).value || null,
        };
        if (c) Object.assign(c, payload);
        else
          Store.db.courses.push(
            Object.assign(
              { id: uid("crs"), createdAt: new Date().toISOString() },
              payload,
            ),
          );
        commit(closeFn, c ? "Course updated." : "Course created.");
      });
    },
  });
  return close;
}
