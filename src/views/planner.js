/**
 * Study Planner View for Journey A.I
 * Multi-Tier Academic Schedule Hierarchy:
 * Tier 1: Executive Page Header with Actions (Rebuild, Export, Clear)
 * Tier 2: Study Schedule & Time Settings (Top-level pace and horizon adjustment)
 * Tier 3: Balanced Academic Pacing & Progress KPI Strip (Zero Redundancy)
 * Tier 4: Day-by-Day Balanced Schedule Grid (Zero Empty Space)
 */

import { Store } from "../core/store.js";
import { Coach } from "../domain/coach.js";
import { UIState } from "../core/state.js";
import { esc, sum, minutesToHM, groupBy, pct } from "../utils/helpers.js";
import { fmtDate, fmtDay, fromIso, dateOnly } from "../utils/date.js";
import { empty, bar, statBox, pageHead } from "./shared.js";
import { planProvenance } from "../utils/format.js";

/**
 * One honest line about where a plan came from.
 * Returns "" when there is nothing to say.
 */
function provenanceLine(meta) {
  if (!meta) return "";
  const prov = planProvenance(meta.provenance);
  if (!prov) return "";
  return (
    '<div class="notice info mb"><div>' +
    esc(prov) +
    "</div></div>"
  );
}

/**
 * Render the Top Study Schedule & Settings Bar with integrated Average Pace & Capacity
 * Allows adjusting weekday study hours, weekend hours, and horizon directly.
 */
function renderPlannerSettingsBar(paceStats) {
  const s = Store.db.settings || {};
  const weekday = s.studyWeekday != null ? s.studyWeekday : 2;
  const weekend = s.studyWeekend != null ? s.studyWeekend : 4;
  const weeks = s.plannerWeeks != null ? s.plannerWeeks : 6;
  const weeklyCap = Math.round(weekday * 5 + weekend * 2);
  const dailyAvg = (weeklyCap / 7).toFixed(1);

  const stats = paceStats || {};
  const totalMin =
    stats.totalMinutes != null
      ? stats.totalMinutes
      : sum(Store.db.plan || [], function (p) {
          return p.minutes;
        }) || 0;
  const horizonWeeks = stats.weeks || weeks;
  const weeklyMin =
    stats.weeklyMinutes != null
      ? stats.weeklyMinutes
      : horizonWeeks > 0
        ? Math.ceil(totalMin / horizonWeeks)
        : 0;
  const dailyMin =
    stats.dailyMinutes != null
      ? stats.dailyMinutes
      : Math.ceil(weeklyMin / 7);

  const weekdayOpts = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6]
    .map(function (n) {
      return (
        '<option value="' +
        n +
        '"' +
        (n === weekday ? " selected" : "") +
        ">" +
        n +
        " hrs / weekday</option>"
      );
    })
    .join("");

  const weekendOpts = [1, 2, 3, 4, 5, 6, 8]
    .map(function (n) {
      return (
        '<option value="' +
        n +
        '"' +
        (n === weekend ? " selected" : "") +
        ">" +
        n +
        " hrs / weekend day</option>"
      );
    })
    .join("");

  const weekOpts = [2, 4, 6, 8, 12]
    .map(function (n) {
      return (
        '<option value="' +
        n +
        '"' +
        (n === weeks ? " selected" : "") +
        ">" +
        n +
        " weeks horizon</option>"
      );
    })
    .join("");

  return (
    '<div class="card planner-settings-card mb" data-total-minutes="' +
    totalMin +
    '">' +
    '<div class="planner-settings-grid">' +
    // Column 1: Study Schedule & Settings Controls
    '<div class="planner-settings-col-controls">' +
    '<div class="planner-settings-header">' +
    '<div class="planner-settings-title-cluster">' +
    '<span class="planner-settings-sparkle" aria-hidden="true">&#9881;</span>' +
    '<h2 class="planner-settings-heading">Study Schedule &amp; Settings</h2>' +
    "</div>" +
    "</div>" +
    '<div class="planner-settings-controls">' +
    '<div class="planner-setting-field">' +
    '<label for="planWeekday">Weekday pace</label>' +
    '<select id="planWeekday" class="planner-select" aria-label="Weekday study hours per day">' +
    weekdayOpts +
    "</select>" +
    "</div>" +
    '<div class="planner-setting-field">' +
    '<label for="planWeekend">Weekend pace</label>' +
    '<select id="planWeekend" class="planner-select" aria-label="Weekend study hours per day">' +
    weekendOpts +
    "</select>" +
    "</div>" +
    '<div class="planner-setting-field">' +
    '<label for="planWeeks">Planning horizon</label>' +
    '<select id="planWeeks" class="planner-select" aria-label="Planning horizon in weeks">' +
    weekOpts +
    "</select>" +
    "</div>" +
    '<div class="planner-setting-actions">' +
    '<button type="button" class="btn sm primary planner-apply-btn" data-act="plan-settings-apply" title="Save hours and rebuild study plan">Apply &amp; Re-plan</button>' +
    "</div>" +
    "</div>" +
    "</div>" + // .planner-settings-col-controls

    // Column 2: Average Pace & Capacity Stat Panel
    '<div class="planner-settings-col-pace">' +
    '<div class="planner-pace-panel">' +
    '<div class="planner-pace-header">' +
    '<span class="planner-pace-label">Average Pace</span>' +
    '<span class="planner-pace-tag">Target</span>' +
    "</div>" +
    '<div class="planner-pace-value" id="planLiveAvgPaceVal">' +
    (weeklyMin > 0
      ? "~" + minutesToHM(weeklyMin) + "/wk"
      : "~" + weeklyCap + " hrs/wk") +
    "</div>" +
    '<div class="planner-pace-meta">' +
    '<div class="planner-pace-meta-item">' +
    '<span class="pace-meta-icon" aria-hidden="true">&#9201;</span>' +
    '<span id="planLiveDailyTargetVal">' +
    (dailyMin > 0
      ? minutesToHM(dailyMin) + " daily target"
      : "~" + dailyAvg + "h/day target") +
    "</span>" +
    "</div>" +
    '<div class="planner-pace-meta-item">' +
    '<span class="pace-meta-icon ok" aria-hidden="true">&#9889;</span>' +
    '<span id="planLiveCapacityVal">' +
    weeklyCap +
    " hrs/wk capacity (~" +
    dailyAvg +
    "h/day)</span>" +
    "</div>" +
    "</div>" +
    "</div>" + // .planner-pace-panel
    "</div>" + // .planner-settings-col-pace
    "</div>" + // .planner-settings-grid
    "</div>" // .planner-settings-card
  );
}

export function planner() {
  const preview = UIState.plannerPreview;
  if (preview) {
    return renderPlannerPreview(preview);
  }

  const plan = Store.db.plan || [];
  const meta = Store.db.planMeta;
  const byDay = groupBy(plan, function (p) {
    return p.date;
  });
  const dates = Object.keys(byDay).sort();
  const total = sum(plan, function (p) {
    return p.minutes;
  });
  const doneMin = sum(
    plan.filter(function (p) {
      return p.done;
    }),
    function (p) {
      return p.minutes;
    },
  );
  const doneCount = plan.filter(function (p) {
    return p.done;
  }).length;
  const compPct = plan.length ? Math.round((doneCount / plan.length) * 100) : 0;
  const reviewBlocks = plan.filter(function (p) {
    return /^Review:/i.test(String(p.label || ""));
  }).length;

  const planWeeks = (meta && meta.weeks) || Store.db.settings.plannerWeeks || 6;
  const weeklyMinutes = Math.ceil(total / planWeeks);
  const dailyMinutes = Math.ceil(weeklyMinutes / 7);

  // ── HIERARCHY LEVEL 1: EXECUTIVE PAGE HEAD ───────────────────────────
  let h = pageHead(
    "Study Planner",
    "A structured academic schedule tailored to your course deadlines and study pace.",
    (plan.length
      ? '<button type="button" class="btn sm danger-ghost" data-act="plan-clear">Clear plan</button>'
      : "") +
      '<button type="button" class="btn primary sm" data-act="plan-generate">' +
      (plan.length ? "+ Rebuild plan" : "Generate plan") +
      "</button>",
  );

  // ── HIERARCHY LEVEL 2: TOP STUDY SCHEDULE, SETTINGS & AVERAGE PACE ───
  h += renderPlannerSettingsBar({
    totalMinutes: total,
    weeks: planWeeks,
    weeklyMinutes,
    dailyMinutes,
  });

  // ── EMPTY STATE IF NO PLAN GENERATED ─────────────────────────────────
  if (!plan.length) {
    const s = Store.db.settings || {};
    const weeklyCap = Math.round((s.studyWeekday || 2) * 5 + (s.studyWeekend || 4) * 2);
    return (
      '<div class="view-padded">' +
      h +
      '<div  class="card todo-empty-ruled u-empty-32">' +
      empty(
        "",
        "No study plan yet",
        "Journey A.I distributes your upcoming course tasks across the next " +
          (s.plannerWeeks || 6) +
          " weeks, tailored to your configured pace (" +
          (s.studyWeekday || 2) +
          "h weekdays, " +
          (s.studyWeekend || 4) +
          "h weekends, ~" +
          weeklyCap +
          "h/week total capacity).",
        '<button type="button" class="btn primary mt" data-act="plan-generate">Generate my study plan</button>',
      ) +
      "</div>" +
      "</div>"
    );
  }

  // ── HIERARCHY LEVEL 3: BALANCED 3-CARD WORKLOAD KPI STRIP ────────────
  const isShowingCompleted = !!UIState.showCompletedPlan;
  const isShowingReviews = !!UIState.showReviewPlan;
  const isFiltered = isShowingCompleted || isShowingReviews;

  const plannedCard =
    '<div class="card pad-sm' +
    (!isFiltered ? " active-kpi info" : " clickable-kpi") +
    '" data-act="plan-show-active" role="button" tabindex="0" title="' +
    (isFiltered
      ? "Click to switch to active study schedule"
      : "Viewing active study schedule") +
    '"><div class="kpi"><div  class="v u-color-info">' +
    minutesToHM(total) +
    '</div><div class="k">Planned Study Time' +
    (!isFiltered
      ? ' <span class="kpi-active-pill info">Active</span>'
      : "") +
    '</div><div class="d muted">' +
    planWeeks +
    " weeks horizon</div></div></div>";

  const reviewCard =
    '<div class="card pad-sm clickable-kpi' +
    (isShowingReviews ? " active-kpi warn" : "") +
    '" data-act="plan-toggle-reviews" role="button" tabindex="0" title="' +
    (isShowingReviews
      ? "Click to hide review sessions and show active schedule"
      : "Click to filter and view review sessions") +
    '" aria-pressed="' +
    (isShowingReviews ? "true" : "false") +
    '" aria-label="Review Sessions: ' +
    reviewBlocks +
    ". " +
    (isShowingReviews ? "Click to hide" : "Click to view review sessions") +
    '"><div class="kpi"><div  class="v u-color-warn">' +
    reviewBlocks +
    '</div><div class="k">Review Sessions' +
    (isShowingReviews
      ? ' <span class="kpi-active-pill warn">Showing &#128269;</span>'
      : reviewBlocks > 0
        ? ' <span class="kpi-click-tag warn" title="Click to view review sessions">Show &#128065;</span>'
        : "") +
    '</div><div class="d muted">' +
    (reviewBlocks ? "scheduled before due dates" : "none needed") +
    (isShowingReviews ? " · Click to hide" : "") +
    "</div></div></div>";

  const completedCard =
    '<div class="card pad-sm clickable-kpi' +
    (isShowingCompleted ? " active-kpi ok" : "") +
    '" data-act="plan-toggle-completed" role="button" tabindex="0" title="' +
    (isShowingCompleted
      ? "Click to hide completed and show active schedule"
      : "Click to show completed study blocks") +
    '" aria-pressed="' +
    (isShowingCompleted ? "true" : "false") +
    '" aria-label="Completed: ' +
    minutesToHM(doneMin) +
    ". " +
    (isShowingCompleted ? "Click to hide completed" : "Click to view completed") +
    '"><div class="kpi"><div  class="v u-color-ok">' +
    minutesToHM(doneMin) +
    '</div><div class="k">Completed' +
    (isShowingCompleted
      ? ' <span class="kpi-active-pill ok">Showing &#10003;</span>'
      : ' <span class="kpi-click-tag" title="Click to view completed">Show &#128065;</span>') +
    '</div><div class="d muted">' +
    doneCount +
    " of " +
    plan.length +
    " done (" +
    compPct +
    "%)" +
    (isShowingCompleted ? " · Click to hide" : "") +
    "</div></div></div>";

  h +=
    '<div class="library-stats-grid planner-kpi-grid mb">' +
    plannedCard +
    reviewCard +
    completedCard +
    "</div>";

  if (meta) {
    h += provenanceLine(meta);
  }

  // Filter banner when viewing completed tasks
  if (isShowingCompleted) {
    h +=
      '<div class="planner-filter-banner mb">' +
      '<div class="filter-banner-info">' +
      '<span class="filter-banner-badge ok">&#10003; Completed View</span>' +
      '<span class="filter-banner-text">Showing <strong>' +
      doneCount +
      "</strong> completed study block" +
      (doneCount === 1 ? "" : "s") +
      " (" +
      minutesToHM(doneMin) +
      " completed)</span>" +
      "</div>" +
      '<button type="button" class="btn sm ghost" data-act="plan-toggle-completed">Back to active schedule &rarr;</button>' +
      "</div>";
  } else if (isShowingReviews) {
    h +=
      '<div class="planner-filter-banner mb">' +
      '<div class="filter-banner-info">' +
      '<span class="filter-banner-badge warn">&#128269; Review Sessions</span>' +
      '<span class="filter-banner-text">Showing <strong>' +
      reviewBlocks +
      "</strong> scheduled review session" +
      (reviewBlocks === 1 ? "" : "s") +
      " before deadlines</span>" +
      "</div>" +
      '<button type="button" class="btn sm ghost" data-act="plan-toggle-reviews">Back to active schedule &rarr;</button>' +
      "</div>";
  } else if (doneCount === plan.length && plan.length > 0) {
    h +=
      '<div class="planner-filter-banner mb">' +
      '<div class="filter-banner-info">' +
      '<span class="filter-banner-badge ok">&#127881; All Caught Up</span>' +
      '<span class="filter-banner-text">All <strong>' +
      plan.length +
      "</strong> study blocks completed (" +
      minutesToHM(doneMin) +
      " studied). Great job!</span>" +
      "</div>" +
      '<button type="button" class="btn sm ok" data-act="plan-toggle-completed">View completed schedule &rarr;</button>' +
      "</div>";
  }

  if (isShowingCompleted && doneCount === 0) {
    h +=
      '<div  class="card todo-empty-ruled mb u-empty-32">' +
      empty(
        "",
        "No completed study blocks yet",
        "As you check off tasks in your active study schedule, they will disappear from the schedule and appear here.",
        '<button type="button" class="btn primary sm mt" data-act="plan-toggle-completed">Back to active schedule</button>',
      ) +
      "</div>";
    return '<div class="view-padded">' + h + "</div>";
  }

  if (isShowingReviews && reviewBlocks === 0) {
    h +=
      '<div  class="card todo-empty-ruled mb u-empty-32">' +
      empty(
        "",
        "No review sessions scheduled",
        "Review sessions are automatically scheduled before major course deadlines when needed.",
        '<button type="button" class="btn primary sm mt" data-act="plan-toggle-reviews">Back to active schedule</button>',
      ) +
      "</div>";
    return '<div class="view-padded">' + h + "</div>";
  }

  // ── HIERARCHY LEVEL 4: BALANCED DAY-BY-DAY SCHEDULE GRID (FULL WIDTH) ─
  const datesToRender = isShowingCompleted
    ? dates.filter(function (date) {
        return (byDay[date] || []).some(function (p) {
          return p.done;
        });
      })
    : isShowingReviews
      ? dates.filter(function (date) {
          return (byDay[date] || []).some(function (p) {
            return /^Review:/i.test(String(p.label || ""));
          });
        })
      : dates.filter(function (date) {
          return (byDay[date] || []).some(function (p) {
            return !p.done;
          });
        });

  // When active schedule has completed every single study block
  if (!isFiltered && !datesToRender.length && plan.length > 0) {
    h +=
      '<div  class="card todo-empty-ruled mb u-empty-40">' +
      empty(
        "",
        "All planned study blocks completed! 🎉",
        "You have completed all scheduled study blocks in your study plan. Great work staying ahead of your academic goals!",
        '<div class="flex-center gap-sm mt">' +
          '<button type="button" class="btn sm" data-act="plan-toggle-completed">View completed blocks (' +
          doneCount +
          ")</button>" +
          '<button type="button" class="btn primary sm" data-act="plan-generate">+ Rebuild plan</button>' +
        "</div>",
      ) +
      "</div>";
    return '<div class="view-padded">' + h + "</div>";
  }

  h += '<div class="planner-days-grid">';
  datesToRender.forEach(function (date) {
    const allDayItems = byDay[date] || [];
    const openItems = allDayItems.filter(function (p) {
      return !p.done;
    });
    const doneItems = allDayItems.filter(function (p) {
      return p.done;
    });
    const reviewItems = allDayItems.filter(function (p) {
      return /^Review:/i.test(String(p.label || ""));
    });
    const items = isShowingCompleted
      ? doneItems
      : isShowingReviews
        ? reviewItems
        : openItems;
    const cap = Coach.dailyCapacity(fromIso(date + "T00:00"));
    const isPast = date < dateOnly(new Date());

    const openMin = sum(openItems, function (p) {
      return p.minutes;
    });
    const doneDayMin = sum(doneItems, function (p) {
      return p.minutes;
    });

    let capText = "";
    if (isShowingCompleted) {
      capText = minutesToHM(doneDayMin) + " completed";
    } else if (isShowingReviews) {
      const reviewDayMin = sum(reviewItems, function (p) {
        return p.minutes;
      });
      capText = minutesToHM(reviewDayMin) + " review";
    } else {
      capText =
        minutesToHM(openMin) +
        " of " +
        minutesToHM(cap) +
        (doneItems.length ? " (" + minutesToHM(doneDayMin) + " done)" : "");
    }

    h +=
      '<div class="card planner-day-card"><div class="card-head day-head">' +
      '<div class="day-title-wrap">' +
      '<span class="day-num">' +
      fmtDay(date + "T00:00") +
      "</span>" +
      (isPast ? ' <span class="badge mute">past</span>' : "") +
      "</div>" +
      '<span class="spacer"></span><span class="day-capacity-text tiny muted">' +
      capText +
      "</span></div>";

    h +=
      bar(
        isShowingCompleted
          ? 100
          : isShowingReviews
            ? 100
            : pct(openMin, cap),
        isShowingCompleted
          ? "ok"
          : isShowingReviews
            ? "warn"
            : openMin > cap
              ? "warn"
              : "ok",
      ) +
      '<div class="planner-day-blocks mt">';

    items.forEach(function (p) {
      const isReview = /^Review:/i.test(String(p.label || ""));
      const isStudy = /^Study:/i.test(String(p.label || ""));
      const isReading = /^Read:/i.test(String(p.label || ""));
      const dueSoon = !!(
        p.due &&
        fromIso(p.due) &&
        (fromIso(p.due) - new Date()) / 86400000 <= 2
      );
      const kind = isReview
        ? "review"
        : isStudy
          ? "study"
          : isReading
            ? "reading"
            : dueSoon
              ? "urgent"
              : "default";
      const kindLabel = isReview
        ? "Review"
        : isStudy
          ? "Study"
          : isReading
            ? "Reading"
            : dueSoon
              ? "Urgent"
              : "Planned";
      const courseName = Store.courseName(p.courseId);

      h +=
        '<div class="sched-block' +
        (p.done ? " done" : "") +
        '" data-plan-kind="' +
        kind +
        '">' +
        // 1. Square Checklist Checkbox (Matching Tasks & Dashboard)
        '<button type="button" class="chk-square' +
        (p.done ? " on" : "") +
        '" data-act="plan-toggle" data-id="' +
        esc(p.id) +
        '" role="checkbox" tabindex="0" aria-checked="' +
        (p.done ? "true" : "false") +
        '" aria-label="Mark ' +
        esc(p.label) +
        (p.done ? " incomplete" : " done") +
        '">' +
        (p.done ? "&#10003;" : "") +
        "</button>" +
        // 2. Clickable Schedule Content (non-events open as read-only)
        '<div class="sched-block-content"' +
        (p.eventId
          ? ' data-act="event-edit" data-id="' +
            esc(p.eventId) +
            '" role="button" tabindex="0" title="Click to view or edit task: ' +
            esc(p.label) +
            '"'
          : "") +
        ">" +
        '<div class="sched-label-row">' +
        '<span class="sched-badge ' +
        kind +
        '">' +
        kindLabel +
        "</span>" +
        '<span class="sched-title' +
        (p.done ? " done-text" : "") +
        '">' +
        esc(p.label) +
        "</span>" +
        "</div>" +
        '<div class="sched-meta-row">' +
        "<span>⏱️ " +
        minutesToHM(p.minutes) +
        "</span>" +
        (courseName
          ? ' <span class="msep">·</span> <span>📚 ' + esc(courseName) + "</span>"
          : "") +
        (p.due
          ? ' <span class="msep">·</span> <span>📅 Due ' + fmtDate(p.due) + "</span>"
          : "") +
        /* A review block schedules retrieval of *material*, not of a
           deadline — so it offers the drill, which needs no chat question. */
        (isReview && (Store.db.documents || []).length
          ? ' <span class="msep">·</span> ' +
            '<button type="button" class="btn xs ghost" data-act="practise-course" data-id="' +
            esc(p.courseId || "") +
            '" title="Open the recall drill on this course&rsquo;s documents">Practise</button>'
          : "") +
        "</div>" +
        "</div>" +
        "</div>"; // .sched-block
    });

    h += "</div>"; // .planner-day-blocks

    h += "</div>"; // .planner-day-card
  });
  h += "</div>"; // .planner-days-grid

  return '<div class="view-padded">' + h + "</div>";
}

function renderPlannerPreview(preview) {
  const { days, planItems, meta } = preview;
  const totalMinutes = meta.totalMinutes || sum(planItems, (p) => p.minutes);
  const existingBlocks = (Store.db.plan || []).length;
  const weeks = meta.weeks || Store.db.settings.plannerWeeks || 6;
  const weeklyMin = Math.ceil(totalMinutes / weeks);

  let h = pageHead(
    "Study Planner — Preview",
    "Review your generated study schedule. Adjust hours above if needed, or confirm to save.",
    '<button type="button" class="btn danger-ghost sm" data-act="plan-preview-cancel">Cancel</button>' +
      '<button type="button" class="btn primary sm" data-act="plan-preview-commit">Confirm &amp; Save plan</button>',
  );

  // Settings bar on top in preview mode with live pace calculations
  h += renderPlannerSettingsBar({
    totalMinutes,
    weeks,
    weeklyMinutes: weeklyMin,
    dailyMinutes: Math.ceil(weeklyMin / 7),
  });

  if (existingBlocks) {
    h +=
      '<div class="notice warn mb"><div><strong>Replacing current plan:</strong> You currently have ' +
      existingBlocks +
      " scheduled block" +
      (existingBlocks === 1 ? "" : "s") +
      ". Confirm &amp; Save will update your schedule; Cancel keeps what you currently have.</div></div>";
  }

  h +=
    '<div class="library-stats-grid planner-kpi-grid mb">' +
    statBox(
      minutesToHM(totalMinutes),
      "Total Planned Time",
      weeks + " weeks horizon",
      "info",
    ) +
    statBox(
      planItems.length,
      "Study Blocks",
      "ready to schedule",
      "ok",
    ) +
    statBox(
      weeks + " weeks",
      "Planning Horizon",
      "academic horizon",
      "info",
    ) +
    "</div>";

  if (meta) {
    h += provenanceLine(meta);
  }

  h += '<div class="planner-days-grid">';
  days.forEach(function (day) {
    const cap = Coach.dailyCapacity(fromIso(day.date + "T00:00"));
    const used = sum(day.items, function (p) {
      return p.minutes;
    });
    const isPast = day.date < dateOnly(new Date());

    h +=
      '<div class="card planner-day-card"><div class="card-head day-head">' +
      '<div class="day-title-wrap">' +
      '<span class="day-num">' +
      fmtDay(day.date + "T00:00") +
      "</span>" +
      (isPast ? ' <span class="badge mute">past</span>' : "") +
      "</div>" +
      '<span class="spacer"></span><span class="day-capacity-text tiny muted">' +
      minutesToHM(used) +
      " of " +
      minutesToHM(cap) +
      "</span></div>";

    h +=
      bar(pct(used, cap), used > cap ? "warn" : "ok") +
      '<div class="planner-day-blocks mt">';

    day.items.forEach(function (p) {
      const isReview = /^Review:/i.test(String(p.label || ""));
      const isStudy = /^Study:/i.test(String(p.label || ""));
      const isReading = /^Read:/i.test(String(p.label || ""));
      const dueSoon = !!(
        p.due &&
        fromIso(p.due) &&
        (fromIso(p.due) - new Date()) / 86400000 <= 2
      );
      const kind = isReview
        ? "review"
        : isStudy
          ? "study"
          : isReading
            ? "reading"
            : dueSoon
              ? "urgent"
              : "default";
      const kindLabel = isReview
        ? "Review"
        : isStudy
          ? "Study"
          : isReading
            ? "Reading"
            : dueSoon
              ? "Urgent"
              : "Planned";
      const courseName = Store.courseName(p.courseId);

      h +=
        '<div class="sched-block" data-plan-kind="' +
        kind +
        '">' +
        '<div class="sched-block-content"' +
        (p.eventId
          ? ' data-act="event-edit" data-id="' +
            esc(p.eventId) +
            '" role="button" tabindex="0" title="Click to view task: ' +
            esc(p.label) +
            '"'
          : "") +
        ">" +
        '<div class="sched-label-row">' +
        '<span class="sched-badge ' +
        kind +
        '">' +
        kindLabel +
        "</span>" +
        '<span class="sched-title">' +
        esc(p.label) +
        "</span>" +
        "</div>" +
        '<div class="sched-meta-row">' +
        "<span>⏱️ " +
        minutesToHM(p.minutes) +
        "</span>" +
        (courseName
          ? ' <span class="msep">·</span> <span>📚 ' + esc(courseName) + "</span>"
          : "") +
        (p.due
          ? ' <span class="msep">·</span> <span>📅 Due ' + fmtDate(p.due) + "</span>"
          : "") +
        /* A review block schedules retrieval of *material*, not of a
           deadline — so it offers the drill, which needs no chat question. */
        (isReview && (Store.db.documents || []).length
          ? ' <span class="msep">·</span> ' +
            '<button type="button" class="btn xs ghost" data-act="practise-course" data-id="' +
            esc(p.courseId || "") +
            '" title="Open the recall drill on this course&rsquo;s documents">Practise</button>'
          : "") +
        "</div>" +
        "</div>" +
        "</div>";
    });

    h += "</div></div>";
  });
  h += "</div>";

  return '<div class="view-padded">' + h + "</div>";
}

/**
 * Wire interactive DOM behavior for Planner view
 * Enables live capacity recalculation when user changes dropdowns
 */
export function afterPlanner(container) {
  const root = container || document;
  const weekdayEl = root.querySelector("#planWeekday");
  const weekendEl = root.querySelector("#planWeekend");
  const weeksEl = root.querySelector("#planWeeks");
  const capacityVal = root.querySelector("#planLiveCapacityVal");
  const paceVal = root.querySelector("#planLiveAvgPaceVal");
  const dailyTargetVal = root.querySelector("#planLiveDailyTargetVal");
  const settingsCard = root.querySelector(".planner-settings-card");

  function updateLiveCapacity() {
    const wd = parseFloat(weekdayEl?.value) || 2;
    const we = parseFloat(weekendEl?.value) || 4;
    const wk = parseInt(weeksEl?.value, 10) || 6;
    const weekly = Math.round(wd * 5 + we * 2);
    const daily = (weekly / 7).toFixed(1);
    if (capacityVal) {
      capacityVal.textContent = weekly + " hrs/wk capacity (~" + daily + "h/day)";
    }
    const totalMin = settingsCard
      ? parseInt(settingsCard.getAttribute("data-total-minutes") || "0", 10)
      : 0;
    if (totalMin > 0 && wk > 0) {
      const weeklyMin = Math.ceil(totalMin / wk);
      const dailyMin = Math.ceil(weeklyMin / 7);
      if (paceVal) {
        paceVal.textContent = "~" + minutesToHM(weeklyMin) + "/wk";
      }
      if (dailyTargetVal) {
        dailyTargetVal.textContent = minutesToHM(dailyMin) + " daily target";
      }
    } else {
      if (paceVal) {
        paceVal.textContent = "~" + weekly + " hrs/wk";
      }
      if (dailyTargetVal) {
        dailyTargetVal.textContent = "~" + daily + "h/day target";
      }
    }
    const s = Store.db.settings;
    if (s) {
      s.studyWeekday = wd;
      s.studyWeekend = we;
      s.plannerWeeks = wk;
      Store.saveNow();
    }
  }

  if (weekdayEl) weekdayEl.addEventListener("change", updateLiveCapacity);
  if (weekendEl) weekendEl.addEventListener("change", updateLiveCapacity);
  if (weeksEl) weeksEl.addEventListener("change", updateLiveCapacity);
}

export const plannerView = {
  title: "Study planner",
  fn: planner,
  after: afterPlanner,
};
