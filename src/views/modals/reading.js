/**
 * Reading modal — create and edit required readings
 */

import { Store } from "../../core/store.js";
import { esc, uid } from "../../utils/helpers.js";
import { q, toast } from "../../utils/dom.js";
import { modal } from "../../utils/feedback.js";
import { courseSelectOptions, commit, defaultCourseId } from "../shared.js";

export function readingModal(readingId) {
  const r = readingId
    ? Store.db.readings.find((x) => x.id === readingId)
    : null;
  const body =
    '<label class="fld"><span>Title</span><input id="rdTitle" value="' +
    esc(r ? r.title : "") +
    '" placeholder="Ch. 6 - Hash Tables"></label>' +
    '<div class="grid g2">' +
    '<label class="fld"><span>Course</span><select id="rdCourse">' +
    courseSelectOptions(defaultCourseId(r), false) +
    "</select></label>" +
    '<label class="fld"><span>Week</span><input id="rdWeek" type="number" min="1" max="30" value="' +
    esc(r && r.week ? r.week : "") +
    '"></label>' +
    "</div>" +
    '<div class="grid g2">' +
    '<label class="fld"><span>Source / textbook</span><input id="rdSource" value="' +
    esc(r ? r.source || "" : "") +
    '" placeholder="CLRS, Introduction to Algorithms"></label>' +
    '<label class="fld"><span>Pages</span><input id="rdPages" value="' +
    esc(r ? r.pages || "" : "") +
    '" placeholder="pp. 253-288"></label>' +
    "</div>" +
    '<div class="grid g2">' +
    '<label class="fld"><span>Requirement</span><select id="rdStatus">' +
    ["required:Required", "optional:Optional / suggested", "done:Completed"]
      .map(function (o) {
        const v = o.split(":")[0];
        return (
          '<option value="' +
          v +
          '"' +
          (r && r.status === v ? " selected" : "") +
          ">" +
          o.split(":")[1] +
          "</option>"
        );
      })
      .join("") +
    "</select></label>" +
    '<label class="fld"><span>Link to an uploaded document</span><select id="rdDoc">' +
    '<option value="">- none -</option>' +
    Store.db.documents
      .map(function (d) {
        return (
          '<option value="' +
          esc(d.id) +
          '"' +
          (r && r.docId === d.id ? " selected" : "") +
          ">" +
          esc(d.name) +
          "</option>"
        );
      })
      .join("") +
    "</select></label>" +
    "</div>";
  modal({
    title: r ? "Edit reading" : "Add required reading",
    body: body,
    footer:
      '<button class="btn" data-close="1">Cancel</button>' +
      (r ? '<button class="btn danger" id="rdDel">Delete</button>' : "") +
      '<button class="btn primary" id="rdSave">' +
      (r ? "Save" : "Add reading") +
      "</button>",
    onMount: function (m, closeFn) {
      q("#rdSave", m).addEventListener("click", function () {
        const title = q("#rdTitle", m).value.trim();
        if (!title) {
          toast("A title is required.", "warn");
          return;
        }
        const payload = {
          title: title,
          courseId: q("#rdCourse", m).value || null,
          week: parseInt(q("#rdWeek", m).value, 10) || null,
          source: q("#rdSource", m).value.trim(),
          pages: q("#rdPages", m).value.trim(),
          status: q("#rdStatus", m).value,
          docId: q("#rdDoc", m).value || null,
        };
        if (r) Object.assign(r, payload);
        else Store.db.readings.push(Object.assign({ id: uid("rdg") }, payload));
        commit(closeFn);
      });
      const d = q("#rdDel", m);
      if (d)
        d.addEventListener("click", function () {
          Store.db.readings = Store.db.readings.filter((x) => x.id !== r.id);
          Store.db.events.forEach(function (e) {
            e.readingIds = (e.readingIds || []).filter((id) => id !== r.id);
          });
          commit(closeFn, "Reading removed.", "ok");
        });
    },
  });
}
