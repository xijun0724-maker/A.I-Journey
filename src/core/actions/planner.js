/**
 * Planner action handlers
 */

import { Store } from "../store.js";
import { UI, UIState } from "../scope.js";
import { Router } from "../router.js";
import { toast } from "../../utils/dom.js";
import { confirm } from "../../utils/feedback.js";
import { Planner } from "../../domain/planner.js";
import { RAG } from "../../domain/rag.js";
import { Pipeline } from "../../domain/pipeline.js";
import { minutesToHM } from "../../utils/helpers.js";

export function generatePlan() {
  const preview = Planner.generateInteractive({ courseId: UIState.courseId });
  if (!preview.planItems.length) {
    toast(
      "No open tasks are available to schedule. Add a syllabus or task first.",
      "info",
    );
    return;
  }
  UIState.set("plannerPreview", preview);
  Router.scheduleRender();
}

export function applyPlanSettings() {
  const weekdayEl = document.querySelector("#planWeekday");
  const weekendEl = document.querySelector("#planWeekend");
  const weeksEl = document.querySelector("#planWeeks");
  const patch = {};

  if (weekdayEl) {
    const v = parseFloat(weekdayEl.value);
    if (!isNaN(v) && v >= 0) patch.studyWeekday = v;
  }
  if (weekendEl) {
    const v = parseFloat(weekendEl.value);
    if (!isNaN(v) && v >= 0) patch.studyWeekend = v;
  }
  if (weeksEl) {
    const v = parseInt(weeksEl.value, 10);
    if (!isNaN(v) && v > 0) patch.plannerWeeks = v;
  }

  Store.settings.update(patch);
  generatePlan();
  toast("Study hours updated and plan regenerated.", "ok");
}

export function cancelPlanPreview() {
  UIState.set("plannerPreview", null);
  Router.scheduleRender();
}

export function commitPlanPreview() {
  const preview = UIState.plannerPreview;
  if (!preview) return;

  /* Same persist path as Planner.generate, so an accepted preview and an
     auto-generated plan cannot write different shapes. */
  Planner.commit(preview);

  UIState.set("plannerPreview", null);
  /* A saved schedule supersedes any offer still on screen: leaving an
     "Accept plan" button next to a plan that is already saved would be a
     dead control. */
  UIState.set("planProposal", null);
  UIState.set("showCompletedPlan", false);
  UIState.set("showReviewPlan", false);
  Router.scheduleRender();
  
  if (!preview.meta.totalMinutes && !preview.meta.unscheduled.length) {
    toast(
      "No open tasks are available to schedule. Add a syllabus or task first.",
      "info",
    );
  } else if (preview.meta.unscheduled.length) {
    toast(
      "Study plan generated with " +
        preview.meta.unscheduled.length +
        " item(s) left unscheduled.",
      "warn",
    );
  } else {
    toast(
      "Study plan generated: " + minutesToHM(preview.meta.totalMinutes) + " scheduled.",
      "ok",
    );
  }
}

/* ── AI plan proposals ───────────────────────────────────────────────
   The assistant proposes, the student decides. Accept routes through
   commitPlanPreview so an accepted proposal and an accepted manual preview
   take the exact same persist path. */

/** @returns {object|null} The live proposal, if there is one */
function currentPlanProposal() {
  const proposal = UIState.planProposal;
  return proposal && proposal.draft ? proposal : null;
}

function clearPlanProposal() {
  UIState.set("planProposal", null);
}

export function acceptPlanProposal() {
  const proposal = currentPlanProposal();
  if (!proposal) {
    toast("That proposal is no longer available. Ask for a new plan.", "info");
    return;
  }
  UIState.set("plannerPreview", proposal.draft);
  clearPlanProposal();
  commitPlanPreview();
}

/**
 * Hand the draft to the planner's existing preview, where the student can
 * change study hours, inspect every block and confirm - or cancel.
 *
 * The offer stays live, so cancelling the preview returns the student to a
 * card they can still accept, edit or reject instead of a dead end. Any
 * commit clears it (see commitPlanPreview).
 */
export function editPlanProposal() {
  const proposal = currentPlanProposal();
  if (!proposal) {
    toast("That proposal is no longer available. Ask for a new plan.", "info");
    return;
  }
  UIState.set("plannerPreview", proposal.draft);
  Router.navigate("planner");
}

export function rejectPlanProposal() {
  const proposal = currentPlanProposal();
  if (!proposal) {
    toast("That proposal is no longer available.", "info");
    return;
  }
  clearPlanProposal();
  Router.scheduleRender();
  toast("Proposal discarded. Your current plan is untouched.", "info");
}

/**
 * Drop one task from the proposal and re-schedule without it.
 *
 * @param {string} eventId - Task to exclude (or re-include when already out)
 */
export function toggleProposalExclusion(eventId) {
  const proposal = currentPlanProposal();
  if (!eventId || !proposal) {
    toast("That proposal is no longer available.", "info");
    return;
  }
  const current = proposal.exclude || [];
  const next =
    current.indexOf(eventId) === -1
      ? current.concat(eventId)
      : current.filter(function (id) {
          return id !== eventId;
        });

  const draft = Planner.generateInteractive({
    weeks: Store.db.settings.plannerWeeks,
    /* Same scope the offer was drafted in, even if the student has since
       changed the course filter. */
    courseId: (proposal.draft.meta || {}).courseId,
    exclude: next,
  });
  UIState.set(
    "planProposal",
    Object.assign({}, proposal, { draft: draft, exclude: next }),
  );
  /* Keep an open planner preview in step with the edit rather than leaving a
     stale copy of the schedule on screen. */
  if (UIState.plannerPreview) UIState.set("plannerPreview", draft);
  Router.scheduleRender();
}

export function clearPlan() {
  confirm("Clear the entire study plan?", {
    title: "Clear plan",
    ok: "Clear",
    danger: true,
  }).then((yes) => {
    if (!yes) return;
    Store.plan.clear();
    UIState.set("showCompletedPlan", false);
    UIState.set("showReviewPlan", false);
  });
}

export function togglePlanItem(id) {
  Planner.toggle(id);
}

export function togglePlanCompletedFilter() {
  const next = !UIState.showCompletedPlan;
  UIState.set("showCompletedPlan", next);
  if (next) {
    UIState.set("showReviewPlan", false);
  }
  Router.scheduleRender();
}

export function togglePlanReviewsFilter() {
  const next = !UIState.showReviewPlan;
  UIState.set("showReviewPlan", next);
  if (next) {
    UIState.set("showCompletedPlan", false);
  }
  Router.scheduleRender();
}

export function showPlanActiveFilter() {
  if (UIState.showCompletedPlan || UIState.showReviewPlan) {
    UIState.set("showCompletedPlan", false);
    UIState.set("showReviewPlan", false);
    Router.scheduleRender();
  }
}

export function resetData() {
  confirm(
    "This will permanently delete all courses, tasks, documents and chat messages. Export a backup first.",
    { title: "Reset all data", ok: "Reset everything", danger: true },
  ).then((yes) => {
    if (!yes) return;
    Store.resetAll();
    UIState.set("courseId", "all");
    UIState.set("timelineFilter", "all");
    UIState.set("timelineSearch", "");
    UIState.set("calendarCourseId", "all");
    UIState.set("chatSources", []);
    UIState.set("plannerPreview", null);
    UIState.set("planProposal", null);
    UIState.set("showCompletedPlan", false);
    UIState.set("showReviewPlan", false);
    UIState.set("draft", null);
    Router.navigate("dashboard");
    toast("All data has been reset.", "ok");
  });
}

export function loadDemo() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.docx,.txt,.csv";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      toast("Parsing file...", "info");
      const payload = await Pipeline.analyseFile(file, {
        courseId: null,
        kind: "syllabus",
      });
      const meta = payload.result?.courseMeta || {};
      UI.draft = {
        payloads: [payload],
        courseId: null,
        newCourse: {
          code: meta.code || file.name.replace(/\.[^.]+$/, ""),
          title: meta.title || "",
        },
      };
      Router.navigate("import");
    } catch (e) {
      toast("Failed to import: " + (e.message || e), "bad", "Import error");
    }
  };
  input.click();
}

export function reindexFn() {
  toast("Rebuilding retrieval index...", "info");
  RAG.reindexAll();
  Store.saveNow();
  Store.emit("change", { entity: "documents", op: "reindex", id: null });
  toast("Index rebuilt.", "ok");
}
