/**
 * Course, document, lesson, and chat action handlers
 */

import { Store } from "../store.js";
import { UIState } from "../state.js";
import { toast } from "../../utils/dom.js";
import { confirm } from "../../utils/feedback.js";

/** Late-import a modal from views so core does not statically depend on views. */
async function _modal(name, ...args) {
  const mod = await import("../../views/modals/index.js");
  if (typeof mod[name] === "function") mod[name](...args);
}

export function deleteCourse(id) {
  const c = Store.courses.get(id);
  if (!c) return;
  confirm(
    'Delete "' +
      (c.code || c.title) +
      '" and all its tasks, topics and readings?',
    {
      title: "Delete course",
      ok: "Delete",
      danger: true,
    },
  ).then((yes) => {
    if (!yes) return;
    Store.courses.remove(id);
    if (UIState.courseId === id) UIState.set("courseId", "all");
    toast("Course deleted.", "ok");
  });
}

export function deleteDocument(id) {
  const d = Store.documents.get(id);
  if (!d) return;
  confirm('Remove "' + d.name + '" from your library?', {
    title: "Delete document",
    ok: "Delete",
    danger: true,
  }).then((yes) => {
    if (!yes) return;
    Store.documents.remove(id);
    const newSources = (UIState.chatSources || []).filter(
      (sourceId) => sourceId !== id,
    );
    UIState.set("chatSources", newSources);
    toast("Document removed.", "ok");
  });
}

export function toggleLesson(id) {
  Store.lessons.toggle(id);
}

export function toggleStarCourse(id) {
  const starred = Store.courses.toggleStar(id);
  toast(starred ? "Course starred!" : "Course unstarred.", "ok");
}

export function toggleRemoveFromView(id) {
  const c = Store.courses.get(id);
  if (!c) return;
  c.removedFromView = !c.removedFromView;
  Store.courses.save(c);
  toast(
    c.removedFromView ? "Course removed from view." : "Course restored to view.",
    "ok",
  );
}

export function clearChat() {
  confirm("Clear all chat messages? This cannot be undone.", {
    title: "Clear chat",
    ok: "Clear",
    danger: true,
  }).then((yes) => {
    if (!yes) return;
    Store.chat.clear();
    toast("Chat cleared.", "ok");
  });
}

export function loadMoodleSample() {
  const sampleCourses = [
    {
      id: "c-vid-prod",
      title: "VIDEO AND AUDIO PRODUCTION",
      code: "BTLE TP-S-ICT10",
      section: "BTLE-TP 3-III-13",
      schedule: "T/F 11:00AM-01:00PM/11:00AM-01:00PM",
      color: "#ea580c",
      yearLevel: "Third Year",
      starred: false,
    },
    {
      id: "c-agri-fish",
      title: "AGRI-FISHERY I",
      code: "BTLE TP-S-TLE07",
      section: "BTLE-TP 3-III-13",
      schedule: "M/TH 05:00PM-07:00PM/05:00PM-07:00PM",
      color: "#10b981",
      yearLevel: "Third Year",
      starred: false,
    },
    {
      id: "c-res-writ",
      title: "INTRODUCTION TO RESEARCH WRITING IN ICT (RESEARCH 1)",
      code: "BTLE TP-S-ICTSP01",
      section: "BTLE-TP 3-III-13",
      schedule: "S 03:30PM-06:30PM",
      color: "#0f6cbf",
      yearLevel: "Third Year",
      starred: true,
    },
  ];

  const sampleEvents = [
    {
      id: "ev-1",
      courseId: "c-res-writ",
      title: "Attendance - Sep 5",
      due: "2026-09-05T09:00:00",
      type: "other",
      status: "done",
    },
    {
      id: "ev-2",
      courseId: "c-vid-prod",
      title: "Final Project: Frontend Design",
      due: "2026-09-06T23:59:00",
      type: "project",
      status: "done",
    },
    {
      id: "ev-3",
      courseId: "c-vid-prod",
      title: "Activity #6. Application of Split Screen",
      due: "2026-09-11T10:00:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-4",
      courseId: "c-agri-fish",
      title: "Attendance",
      due: "2026-09-12T08:00:00",
      type: "other",
      status: "open",
    },
    {
      id: "ev-5",
      courseId: "c-res-writ",
      title: "Attendance - Sep 12",
      due: "2026-09-12T13:00:00",
      type: "other",
      status: "open",
    },
    {
      id: "ev-6",
      courseId: "c-agri-fish",
      title: "Individual Project: Marcotting in Plants",
      due: "2026-09-13T23:59:00",
      type: "project",
      status: "open",
    },
    {
      id: "ev-7",
      courseId: "c-res-writ",
      title: "Company Interview Transcript and Photo Documentation Research Immersion",
      due: "2026-09-14T10:33:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-8",
      courseId: "c-res-writ",
      title: "Letter to the Company Partner",
      due: "2026-09-14T11:00:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-9",
      courseId: "c-res-writ",
      title: "Company Interview Audio File",
      due: "2026-09-14T14:00:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-10",
      courseId: "c-res-writ",
      title: "Weekly Accomplishment Report",
      due: "2026-09-14T16:00:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-11",
      courseId: "c-res-writ",
      title: "Company Interview Transcript and Photo Documentation Research Immersion",
      due: "2026-09-14T23:59:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-13",
      courseId: "c-res-writ",
      title: "Immersion Logbook Signature Sheet",
      due: "2026-09-14T17:00:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-14",
      courseId: "c-res-writ",
      title: "Field Notes Submission",
      due: "2026-09-14T18:00:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-15",
      courseId: "c-res-writ",
      title: "Supervisor Endorsement Form",
      due: "2026-09-14T19:00:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-16",
      courseId: "c-res-writ",
      title: "Interview Consent Documents",
      due: "2026-09-14T20:00:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-17",
      courseId: "c-res-writ",
      title: "Immersion Site Photo Appendix",
      due: "2026-09-14T21:00:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-18",
      courseId: "c-res-writ",
      title: "Partner Agency Clearance",
      due: "2026-09-14T22:00:00",
      type: "assignment",
      status: "open",
    },
    {
      id: "ev-12",
      courseId: "c-res-writ",
      title: "Attendance - Sep 19",
      due: "2026-09-19T09:00:00",
      type: "other",
      status: "open",
    },
  ];

  Store.db.courses = sampleCourses;
  Store.db.events = sampleEvents;
  Store.saveNow();
  Store.emit("change", { entity: "all", op: "moodle-sample" });
  if (typeof document !== "undefined") {
    toast("Loaded Moodle academic schedule sample.", "ok");
  }
}

export const courseModal = (...args) => _modal("courseModal", ...args);
export const eventModal = (...args) => _modal("eventModal", ...args);
export const lessonModal = (...args) => _modal("lessonModal", ...args);
export const docModal = (...args) => _modal("docModal", ...args);
export const readingModal = (...args) => _modal("readingModal", ...args);
