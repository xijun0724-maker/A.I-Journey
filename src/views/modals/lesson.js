/**
 * Lesson/topic modal — create and edit topics
 */

import { Store } from "../../core/store.js";
import { UI, UIState } from "../../core/state.js";
import { Router } from "../../core/router.js";
import { Coach } from "../../domain/coach.js";
import { esc, uid } from "../../utils/helpers.js";
import { dateOnly, fromIso, addDays } from "../../utils/date.js";
import { q, toast } from "../../utils/dom.js";
import { modal } from "../../utils/feedback.js";
import { courseSelectOptions } from "../shared.js";

export function lessonModal(lessonId) {
  const l = lessonId ? Store.lesson(lessonId) : null;
  const body =
    '<label class="fld"><span>Topic</span><input id="lsTopic" value="' +
    esc(l ? l.topic : "") +
    '" placeholder="Hash tables and collision resolution"></label>' +
    '<div class="grid g2">' +
    '<label class="fld"><span>Course</span><select id="lsCourse">' +
    courseSelectOptions(
      l
        ? l.courseId
        : UIState.courseId !== "all"
          ? UIState.courseId
          : Store.db.courses[0] && Store.db.courses[0].id,
      false,
    ) +
    "</select></label>" +
    '<label class="fld"><span>Week</span><input id="lsWeek" type="number" min="1" max="30" value="' +
    (l && l.week ? l.week : Coach.currentWeek()) +
    '"></label>' +
    "</div>" +
    '<label class="fld"><span>Notes / learning outcomes</span><textarea id="lsNotes">' +
    esc(l ? l.notes || "" : "") +
    "</textarea></label>" +
    '<label  class="row small u-gap-8"><input type="checkbox" id="lsDone"' +
    (l && l.done ? " checked" : "") +
    "> Covered in class</label>";
  modal({
    title: l ? "Edit topic" : "Add a topic",
    body: body,
    footer:
      '<button class="btn" data-close="1">Cancel</button>' +
      (l ? '<button class="btn danger" id="lsDel">Delete</button>' : "") +
      '<button class="btn primary" id="lsSave">' +
      (l ? "Save" : "Add topic") +
      "</button>",
    onMount: function (m, closeFn) {
      q("#lsSave", m).addEventListener("click", function () {
        const topic = q("#lsTopic", m).value.trim();
        if (!topic) {
          toast("A topic is required.", "warn");
          return;
        }
        const week = parseInt(q("#lsWeek", m).value, 10) || 1;
        const courseId = q("#lsCourse", m).value || null;
        const start = dateOnly(Coach.weekStartDate(week) || new Date());
        const payload = {
          topic: topic,
          week: week,
          courseId: courseId,
          notes: q("#lsNotes", m).value.trim(),
          done: q("#lsDone", m).checked,
          start: start,
          end: dateOnly(addDays(fromIso(start + "T00:00"), 2)),
        };
        if (l) Object.assign(l, payload);
        else
          Store.db.lessons.push(
            Object.assign(
              {
                id: uid("lsn"),
                readings: [],
                eventIds: [],
                source: "manual",
              },
              payload,
            ),
          );
        Store.saveNow();
        closeFn();
        Router.scheduleRender();
        UI.toastSaved();
      });
      const del = q("#lsDel", m);
      if (del)
        del.addEventListener("click", function () {
          Store.db.lessons = Store.db.lessons.filter(function (x) {
            return x.id !== l.id;
          });
          Store.saveNow();
          closeFn();
          Router.scheduleRender();
          toast("Topic removed.", "ok");
        });
    },
  });
}
