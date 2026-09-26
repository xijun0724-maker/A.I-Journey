// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { UIState } from "../../src/core/state.js";
import { planner, afterPlanner, plannerView } from "../../src/views/planner.js";
import {
  applyPlanSettings,
  togglePlanCompletedFilter,
  togglePlanReviewsFilter,
  togglePlanItem,
} from "../../src/core/actions/planner.js";

describe("Study Planner View — Hierarchy, Top Time Settings, and Removal of Capacity Bottlenecks", () => {
  beforeEach(() => {
    Store.resetAll();
    UIState.plannerPreview = null;
    UIState.showCompletedPlan = false;
    UIState.showReviewPlan = false;
    Store.db.settings.studyWeekday = 2;
    Store.db.settings.studyWeekend = 4;
    Store.db.settings.plannerWeeks = 6;
    Store.db.courses = [
      { id: "c1", code: "CS 101", title: "Intro to Computer Science" },
    ];
    Store.db.events = [
      {
        id: "ev1",
        title: "Submit Problem Set 1",
        type: "assignment",
        courseId: "c1",
        due: "2026-09-30T23:59:00Z",
        priority: "High",
        status: "todo",
        subtasks: [
          { id: "st1", title: "Draft answers", done: false, minutes: 60 },
        ],
      },
    ];
    Store.db.plan = [
      {
        id: "p1",
        eventId: "ev1",
        date: "2026-09-25",
        label: "Submit Problem Set 1 — Draft answers",
        minutes: 60,
        courseId: "c1",
        done: false,
        due: "2026-09-30T23:59:00Z",
      },
      {
        id: "p2",
        eventId: "ev1",
        date: "2026-09-26",
        label: "Review: Submit Problem Set 1",
        minutes: 30,
        courseId: "c1",
        done: true,
        due: "2026-09-30T23:59:00Z",
      },
    ];
    Store.db.planMeta = {
      weeks: 6,
      totalMinutes: 90,
      unscheduled: [],
      atRisk: [],
    };
  });

  it("renders the interactive study schedule & settings bar together with average pace on top", () => {
    const html = planner();
    expect(html).toContain("planner-settings-card");
    expect(html).toContain("planner-settings-grid");
    expect(html).toContain("Study Schedule &amp; Settings");
    expect(html).toContain('id="planWeekday"');
    expect(html).toContain('id="planWeekend"');
    expect(html).toContain('id="planWeeks"');
    expect(html).toContain('id="planLiveCapacityVal"');
    expect(html).toContain('id="planLiveAvgPaceVal"');
    expect(html).toContain("planner-pace-panel");
    expect(html).toContain("Average Pace");
    expect(html).toContain('data-act="plan-settings-apply"');
    expect(html).toContain("Apply &amp; Re-plan");
  });

  it("completely removes the Capacity Bottlenecks card and warning notices", () => {
    // Even if unscheduled or atRisk exists in meta
    Store.db.planMeta.unscheduled = ["Some task"];
    Store.db.planMeta.atRisk = ["Another task"];

    const html = planner();
    expect(html).not.toContain("Capacity Bottlenecks");
    expect(html).not.toContain("Capacity Warning");
    expect(html).not.toContain("Not enough study time configured");
    expect(html).not.toContain("plan-alert-chip bad");
  });

  it("unifies settings and average pace together, providing a balanced 3-card execution KPI strip (planned, reviews, completed)", () => {
    const html = planner();
    // 3 KPI strip for execution
    expect(html).toContain("planner-kpi-grid");
    expect(html).toContain("Planned Study Time");
    expect(html).toContain("Review Sessions");
    expect(html).toContain("Completed");

    // Ordered: Planned Study Time (left) -> Review Sessions (middle) -> Completed (right)
    const plannedIdx = html.indexOf("Planned Study Time");
    const reviewIdx = html.indexOf("Review Sessions");
    const completedIdx = html.indexOf("Completed");
    expect(plannedIdx).toBeLessThan(reviewIdx);
    expect(reviewIdx).toBeLessThan(completedIdx);

    // Right rail and redundant cards are removed
    expect(html).not.toContain("dash-col-right");
    expect(html).not.toContain("Weekly Study Rhythm");
    expect(html).not.toContain("CURRENT PACE: BALANCED");
  });

  it("renders a full-width balanced day-by-day schedule grid with square checkboxes and clickable tasks", () => {
    const html = planner();
    expect(html).toContain("planner-days-grid");
    expect(html).toContain("planner-day-card");
    expect(html).toContain("chk-square");
    expect(html).toContain('data-act="plan-toggle"');
    expect(html).toContain('data-act="event-edit"');
    // Explicit edit button is removed; content is clickable
    expect(html).not.toContain('class="btn xs ghost" data-act="event-edit"');
  });

  it("updates live capacity and store settings dynamically in afterPlanner", () => {
    const container = document.createElement("div");
    container.innerHTML = planner();
    document.body.appendChild(container);
    afterPlanner(container);

    const weekdaySelect = container.querySelector("#planWeekday");
    const weekendSelect = container.querySelector("#planWeekend");
    const capacityVal = container.querySelector("#planLiveCapacityVal");

    // Initial capacity: 2*5 + 4*2 = 18 hrs
    expect(capacityVal.textContent).toContain("18 hrs");

    // Change weekday to 3 hrs, weekend to 5 hrs -> 3*5 + 5*2 = 25 hrs
    weekdaySelect.value = "3";
    weekdaySelect.dispatchEvent(new window.Event("change"));

    weekendSelect.value = "5";
    weekendSelect.dispatchEvent(new window.Event("change"));

    expect(capacityVal.textContent).toContain("25 hrs");
    expect(Store.db.settings.studyWeekday).toBe(3);
    expect(Store.db.settings.studyWeekend).toBe(5);

    container.remove();
  });

  it("applyPlanSettings reads top inputs, updates Store settings, and regenerates plan", () => {
    const container = document.createElement("div");
    container.innerHTML = planner();
    document.body.appendChild(container);

    container.querySelector("#planWeekday").value = "4";
    container.querySelector("#planWeekend").value = "6";
    container.querySelector("#planWeeks").value = "8";

    applyPlanSettings();

    expect(Store.db.settings.studyWeekday).toBe(4);
    expect(Store.db.settings.studyWeekend).toBe(6);
    expect(Store.db.settings.plannerWeeks).toBe(8);

    container.remove();
  });

  it("by default hides checked plan items and completed days from the active schedule view", () => {
    UIState.showCompletedPlan = false;
    const html = planner();

    // p1 is open on Friday Sep 25 -> rendered
    expect(html).toContain("Submit Problem Set 1 — Draft answers");
    expect(html).toContain("Friday, Sep 25");
    // p2 is done on Saturday Sep 26 -> both task and completed day disappear from active view
    expect(html).not.toContain("Review: Submit Problem Set 1");
    expect(html).not.toContain("Saturday, Sep 26");
    expect(html).not.toContain("All study blocks for this day completed!");
  });

  it("drills the document a review block covers, and falls back to the course", () => {
    UIState.showCompletedPlan = false;
    Store.db.documents = [{ id: "d1", courseId: "c1", name: "Thermo notes" }];
    Store.db.plan = [
      {
        id: "p1",
        eventId: "ev1",
        date: "2026-09-25",
        label: "Review: Essay draft",
        minutes: 30,
        courseId: "c1",
        done: false,
        due: "2026-09-30T23:59:00Z",
        docId: "d1",
      },
      {
        id: "p2",
        eventId: "ev1",
        date: "2026-09-26",
        label: "Review: Lab report",
        minutes: 30,
        courseId: "c1",
        done: false,
        due: "2026-09-30T23:59:00Z",
      },
    ];

    const html = planner();

    /* The block that can name its material drills that material. */
    expect(html).toContain('data-act="practise-doc" data-id="d1"');
    expect(html).toContain("Open the recall drill on Thermo notes");
    /* The one that cannot still has a way in. */
    expect(html).toContain('data-act="practise-course" data-id="c1"');
  });

  it("makes the Completed KPI card clickable with toggle action and accessibility attributes", () => {
    UIState.showCompletedPlan = false;
    const html = planner();

    expect(html).toContain('data-act="plan-toggle-completed"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("clickable-kpi");
    expect(html).toContain("kpi-click-tag");
  });

  it("shows completed items and completed days when Completed KPI card is clicked", () => {
    UIState.showCompletedPlan = false;

    // Toggle filter to show completed items
    togglePlanCompletedFilter();
    expect(UIState.showCompletedPlan).toBe(true);

    const html = planner();
    // Banner indicator
    expect(html).toContain("Completed View");
    expect(html).toContain("Showing <strong>1</strong> completed study block");
    // Completed item p2 and its day are now visible!
    expect(html).toContain("Review: Submit Problem Set 1");
    expect(html).toContain("Saturday, Sep 26");
    // Open item p1 is hidden from completed view
    expect(html).not.toContain("Submit Problem Set 1 — Draft answers");

    // Toggle back to active view
    togglePlanCompletedFilter();
    expect(UIState.showCompletedPlan).toBe(false);

    const htmlActive = planner();
    expect(htmlActive).toContain("Submit Problem Set 1 — Draft answers");
    expect(htmlActive).toContain("Friday, Sep 25");
    expect(htmlActive).not.toContain("Review: Submit Problem Set 1");
    expect(htmlActive).not.toContain("Saturday, Sep 26");
  });

  it("when all plan items are checked, they disappear and the view displays a clean completion state", () => {
    UIState.showCompletedPlan = false;
    // p1 is initially visible
    expect(planner()).toContain("Submit Problem Set 1 — Draft answers");

    // Check off p1
    togglePlanItem("p1");
    expect(Store.db.plan.find((p) => p.id === "p1").done).toBe(true);

    // In active view, p1 and the completed day now disappear!
    const htmlAfter = planner();
    expect(htmlAfter).not.toContain("Submit Problem Set 1 — Draft answers");
    expect(htmlAfter).not.toContain("Friday, Sep 25");
    expect(htmlAfter).not.toContain("Saturday, Sep 26");
    expect(htmlAfter).toContain("All planned study blocks completed!");
    expect(htmlAfter).toContain("View completed blocks");
  });

  it("removes the export schedule button from the study planner header", () => {
    const html = planner();
    expect(html).not.toContain("Export schedule");
    expect(html).not.toContain('data-act="export-roadmap"');
    // Header should still have Clear plan and Rebuild plan
    expect(html).toContain("Clear plan");
    expect(html).toContain("+ Rebuild plan");
  });

  it("makes the Review Sessions KPI card clickable with toggle action and accessibility attributes", () => {
    const html = planner();
    expect(html).toContain('data-act="plan-toggle-reviews"');
    expect(html).toContain("Review Sessions");
    expect(html).toContain("clickable-kpi");
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
  });

  it("filters and shows review sessions when Review Sessions KPI card is clicked", () => {
    UIState.showReviewPlan = false;

    togglePlanReviewsFilter();
    expect(UIState.showReviewPlan).toBe(true);

    const html = planner();
    // Banner indicator
    expect(html).toContain("Review Sessions");
    expect(html).toContain("scheduled review session");
    // Review item p2 is visible
    expect(html).toContain("Review: Submit Problem Set 1");
    // Non-review item p1 is hidden in review filter
    expect(html).not.toContain("Submit Problem Set 1 — Draft answers");

    // Toggle back to active view
    togglePlanReviewsFilter();
    expect(UIState.showReviewPlan).toBe(false);

    const htmlActive = planner();
    expect(htmlActive).toContain("Submit Problem Set 1 — Draft answers");
  });
});
