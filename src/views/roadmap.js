import { PNU_REQUIREMENT_ROW } from "../config/standards/pnu.js";
import { UIState } from "../core/scope.js";
import { Coach } from "../domain/coach.js";
import { Tasks } from "../domain/tasks.js";
import { esc, sortBy, groupBy } from "../utils/helpers.js";
import { fmtDate, fromIso, addDays } from "../utils/date.js";
import {
  empty,
  bar,
  courseChip,
  eventBadge,
  dueLabel,
  typeMeta,
  eventProgress,
  priBadge,
  docs,
  tableHtml,
} from "./shared.js";
import { courses, bindCoursesView } from "./courses.js";

function renderDeadlines(events) {
  const all = sortBy(
    events.filter(function (e) {
      return e.due || e.status !== "done";
    }),
    function (e) {
      return e.due || "9999";
    },
  );
  if (!all.length)
    return (
      '<div class="card">' +
      empty(
        "",
        "No deadlines yet",
        "Import a syllabus or add tasks manually.",
      ) +
      "</div>"
    );

  const grouped = groupBy(all, function (e) {
    return e.due ? e.due.slice(0, 7) : "none";
  });
  let h = '<div class="card">';
  Object.keys(grouped)
    .sort()
    .forEach(function (month) {
      const label =
        month === "none"
          ? "No date set"
          : fromIso(month + "-01T00:00").toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            });
      h +=
        '<div class="week-hdr mt"><span class="wk">' +
        label +
        '</span><span class="spacer"></span>' +
        '<span class="tiny muted">' +
        grouped[month].length +
        " assessment" +
        (grouped[month].length === 1 ? "" : "s") +
        "</span></div>";
      h +=
        '<div class="tbl-wrap"><table aria-label="Assessment calendar"><thead><tr><th>Due</th><th>Assessment</th><th>Type</th><th>Course</th><th>Weight</th><th>Progress</th><th></th></tr></thead><tbody>';
      grouped[month].forEach(function (e) {
        const p = Tasks.priority(e);
        h +=
          '<tr><td class="nowrap-cell">' +
          dueLabel(e.due) +
          "</td>" +
          "<td><strong>" +
          esc(e.title) +
          "</strong></td>" +
          "<td>" +
          esc(typeMeta(e.type).label) +
          "</td>" +
          "<td>" +
          courseChip(e.courseId) +
          "</td>" +
          "<td>" +
          (e.weight != null
            ? e.weight + "%"
            : e.points != null
              ? e.points + " pts"
              : '<span class="tiny muted">\u2014</span>') +
          "</td>" +
          '<td class="u-minw-110">' +
          bar(eventProgress(e)) +
          '<div class="tiny muted">' +
          eventProgress(e) +
          "%</div></td>" +
          '<td class="nowrap-cell">' +
          priBadge(p.label) +
          ' <button class="btn xs" data-act="event-edit" data-id="' +
          esc(e.id) +
          '">Open</button></td></tr>';
      });
      h += "</tbody></table></div>";
    });
  h += "</div>";
  return h;
}

function renderReadings(readings) {
  const rds = sortBy(readings, function (r) {
    return (r.week || 99) + "";
  });
  let h =
    '<div class="card"><div class="card-head"><h2>Required reading &amp; reference list</h2><span class="spacer"></span>' +
    '<button class="btn sm" data-act="reading-new">Add reading</button></div>';
  if (!rds.length) {
    h += empty(
      "",
      "No readings recorded",
      "Import a syllabus or add readings manually.",
    );
  } else {
    h +=
      '<div class="tbl-wrap"><table aria-label="Required readings"><thead><tr><th>Week</th><th>Title</th><th>Source</th><th>Pages</th><th>Course</th><th>Status</th><th></th></tr></thead><tbody>';
    rds.forEach(function (r) {
      h +=
        '<tr><td class="nowrap-cell">' +
        (r.week ? "W" + r.week : "\u2014") +
        "</td><td><strong" +
        (r.status === "done" ? ' class="done-text"' : "") +
        ">" +
        esc(r.title) +
        "</strong>" +
        (r.docId
          ? ' <span class="tag" title="Linked to an uploaded document">document</span>'
          : "") +
        "</td>" +
        '<td class="small">' +
        esc(r.source || "\u2014") +
        '</td><td class="small">' +
        esc(r.pages || "\u2014") +
        "</td>" +
        "<td>" +
        courseChip(r.courseId) +
        "</td>" +
        '<td><span class="badge ' +
        (r.status === "done"
          ? "ok"
          : r.status === "optional"
            ? "mute"
            : "med") +
        '">' +
        esc(r.status) +
        "</span></td>" +
        '<td class="nowrap-cell">' +
        (r.status !== "done"
          ? '<button class="btn xs ok" data-act="reading-toggle" data-id="' +
            esc(r.id) +
            '">Done</button> '
          : "") +
        '<button class="btn xs" data-act="reading-edit" data-id="' +
        esc(r.id) +
        '">Edit</button></td></tr>';
    });
    h += "</tbody></table></div>";
  }
  h += "</div>";
  return h;
}

function renderTables() {
  const docsWithTables = docs().filter(function (d) {
    return d.tables && d.tables.length;
  });
  let h =
    '<div class="card"><div class="card-head"><h2>Tables extracted from documents</h2><span class="spacer"></span>' +
    '<span class="tiny muted">' +
    docsWithTables.length +
    " document(s)</span></div>";
  if (!docsWithTables.length) {
    h += empty(
      "",
      "No tables found",
      "Tables are detected in PDFs and Word documents, including schedules and grading schemes.",
    );
  }
  docsWithTables.forEach(function (d) {
    h += '<h3 class="mt">' + esc(d.name) + "</h3>";
    d.tables.forEach(function (t, i) {
      const rows = (t.rows || []).filter(function (row) {
        return PNU_REQUIREMENT_ROW.test(row.join(" "));
      });
      if (!rows.length) return;
      h +=
        '<div class="table-note">Table ' +
        (i + 1) +
        (t.page ? ' <i class="msep"></i> page ' + t.page : "") +
        ' <i class="msep"></i> ' +
        Math.round((t.confidence || 0.5) * 100) +
        "% confidence</div>";
      h += tableHtml({
        label: "Extracted tables",
        cls: "mb scroll-md",
        header: t.header,
        rows: rows,
      });
    });
  });
  h += "</div>";
  return h;
}

function groupLessonsByWeek(course, allLessons) {
  const courseLessons = (allLessons || []).filter(
    (l) => l.courseId === course.id,
  );
  const byWeek = groupBy(courseLessons, (l) => {
    const w = Number(l.week);
    return Number.isFinite(w) && w > 0 ? w : 1;
  });
  const weeks = Object.keys(byWeek)
    .map(Number)
    .filter((w) => Number.isFinite(w) && byWeek[w] && byWeek[w].length)
    .sort((a, b) => a - b);
  return { courseLessons, byWeek, weeks };
}

/**
 * Render PNU Curriculum Matrix table — Week × ILOs × Content × TLA × Assessment.
 * Mirrors the session-plan table structure used in PNU TEDPATH syllabi.
 * @param {Object} course - Active course
 * @param {Array} allLessons - Lessons/topics from syllabus
 * @param {Array} allEvents - Course events/assessments
 * @returns {string} HTML markup
 */
function renderCurriculumMatrix(course, allLessons, allEvents) {
  if (!course) return "";
  const { courseLessons, byWeek, weeks } = groupLessonsByWeek(
    course,
    allLessons,
  );
  const courseEvents = (allEvents || []).filter(
    (e) => e.courseId === course.id,
  );
  if (!courseLessons.length) return "";

  let h =
    '<div class="tbl-wrap scroll-md"><table class="curriculum-matrix-table" aria-label="Curriculum matrix">' +
    "<thead><tr>" +
    '<th class="cm-th-week">Week / Session</th>' +
    '<th class="cm-th-ilo">Course Intended Learning Outcomes</th>' +
    '<th class="cm-th-content">Content / Topics</th>' +
    '<th class="cm-th-tla">Learning Activities (TLA)</th>' +
    '<th class="cm-th-assess">Assessment</th>' +
    "</tr></thead><tbody>";

  weeks.forEach((w) => {
    const group = byWeek[w] || [];
    const weekEvents = courseEvents.filter(
      (e) => Number(e.week) === w,
    );
    const isWeekDone = group.length > 0 && group.every((l) => l.done);
    const topicsHtml = group
      .map(
        (l) =>
          '<div class="cm-topic' +
          (l.done ? " is-done" : "") +
          '" data-act="lesson-edit" data-id="' +
          esc(l.id) +
          '">' +
          (l.done ? '<span class="cm-done-dot" title="Covered">✓</span>' : "") +
          esc(l.topic) +
          "</div>",
      )
      .join("");
    const ilosHtml = group
      .map((l) => (l.ilo ? '<div class="cm-ilo">' + esc(l.ilo) + "</div>" : ""))
      .filter(Boolean)
      .join("") || '<span class="muted small">—</span>';
    const tlasHtml = group
      .map((l) => (l.tla ? '<div class="cm-tla">' + esc(l.tla) + "</div>" : ""))
      .filter(Boolean)
      .join("") || '<span class="muted small">—</span>';
    const assessHtml = weekEvents.length
      ? weekEvents
          .map(
            (e) =>
              '<div class="cm-assess" data-act="event-edit" data-id="' +
              esc(e.id) +
              '">' +
              esc(e.title) +
              (e.weight != null
                ? ' <span class="cm-weight">' + e.weight + "%</span>"
                : "") +
              "</div>",
          )
          .join("")
      : '<span class="muted small">—</span>';

    h +=
      "<tr" +
      (isWeekDone ? ' class="cm-row-done"' : "") +
      ">" +
      '<td class="cm-td-week"><span class="cm-week-badge">W' +
      w +
      "</span></td>" +
      '<td class="cm-td-ilo">' +
      ilosHtml +
      "</td>" +
      '<td class="cm-td-content">' +
      (topicsHtml || '<span class="muted small">—</span>') +
      "</td>" +
      '<td class="cm-td-tla">' +
      tlasHtml +
      "</td>" +
      '<td class="cm-td-assess">' +
      assessHtml +
      "</td>" +
      "</tr>";
  });

  h += "</tbody></table></div>";
  return h;
}

/**
 * Render visual roadmap.sh-style curriculum tree (matching Image 3)
 * @param {Object} course - Active course
 * @param {Array} allLessons - Lessons/topics from syllabus
 * @param {Array} allEvents - Course events/assessments
 * @param {Array} allReadings - Course readings
 * @returns {string} HTML markup
 */
function renderVisualRoadmapTree(
  course,
  allLessons,
  allEvents,
  allReadings,
) {
  if (!course) {
    return (
      '<div class="card">' +
      empty(
        "",
        "No course selected",
        "Select a course to view its curriculum roadmap.",
        '<button type="button" class="btn primary mt" data-act="scope-clear-to-courses">View all courses</button>',
      ) +
      "</div>"
    );
  }

  const { courseLessons, byWeek, weeks } = groupLessonsByWeek(
    course,
    allLessons,
  );
  const courseEvents = (allEvents || []).filter(
    (e) => e.courseId === course.id,
  );
  const courseReadings = (allReadings || []).filter(
    (r) => r.courseId === course.id,
  );

  if (!courseLessons.length) {
    return (
      '<div class="roadmap-visual-wrapper">' +
      '<div class="roadmap-tree-empty-box">' +
      '<div class="empty-tree-icon">🗺️</div>' +
      "<h3>No topics extracted yet for " +
      esc(course.title || course.code || "this course") +
      "</h3>" +
      '<p class="small muted">Import a course syllabus (PDF, DOCX, or text) to automatically map weekly modules, extracted topics, and assessment milestones into this roadmap.</p>' +
      '<div class="row gap mt">' +
      '<button type="button" class="btn primary" data-act="go-import">Import syllabus</button>' +
      '<button type="button" class="btn" data-act="lesson-new">+ Add topic manually</button>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderTopicPill(l) {
    return (
      '<div class="roadmap-topic-pill' +
      (l.done ? " is-done" : "") +
      '" data-act="lesson-edit" data-id="' +
      esc(l.id) +
      '" title="Edit topic">' +
      '<span class="topic-pill-title">' +
      esc(l.topic) +
      "</span>" +
      '<button type="button" class="roadmap-pill-chk' +
      (l.done ? " done" : "") +
      '" data-act="lesson-toggle" data-id="' +
      esc(l.id) +
      '" title="' +
      (l.done ? "Mark topic as pending" : "Mark topic as covered") +
      '" aria-label="Toggle topic coverage">' +
      (l.done ? "✓" : "") +
      "</button>" +
      "</div>"
    );
  }

  function renderEventPill(e) {
    const dueTxt = e.due ? fmtDate(e.due, true) : "No deadline";
    const weightTxt = e.weight != null ? " · " + e.weight + "%" : "";
    return (
      '<div class="roadmap-event-pill" data-act="event-edit" data-id="' +
      esc(e.id) +
      '" title="Open assessment details">' +
      '<span class="event-pill-tag">Assessment</span>' +
      '<div class="event-pill-title">' +
      esc(e.title) +
      "</div>" +
      '<div class="event-pill-meta">' +
      dueTxt +
      weightTxt +
      "</div>" +
      "</div>"
    );
  }

  function renderReadingPill(r) {
    const pagesTxt = r.pages ? " (" + esc(r.pages) + ")" : "";
    return (
      '<div class="roadmap-reading-tag" title="' +
      esc(r.title) +
      '">' +
      '<span class="reading-tag-icon" aria-hidden="true">📖</span>' +
      '<span class="reading-tag-text">' +
      esc(r.title) +
      "</span>" +
      (pagesTxt ? '<span class="reading-tag-pages">' + pagesTxt + "</span>" : "") +
      "</div>"
    );
  }

  let treeStepsHtml = "";
  const midpoint = Math.floor(weeks.length / 2);

  /* An assessment belongs to a week by its explicit `week`, or - for every
     event the importer and the sample loader write, which carry only `due` -
     by the date window that week covers. Matching on `e.week` alone matched
     nothing for any dataset, so the roadmap drew no assessments at all while
     its legend advertised them. */
  const weekStartOf = (w) => {
    const group = byWeek[w] || [];
    const first = group[0];
    return first && first.start
      ? fromIso(first.start + "T00:00")
      : Coach.weekStartDate(w);
  };

  weeks.forEach((w, idx) => {
    const group = byWeek[w] || [];
    const isWeekDone = group.length > 0 && group.every((l) => l.done);
    const wkStart = weekStartOf(w);
    const wkEnd = wkStart ? addDays(wkStart, 6) : null;
    const weekEvents = courseEvents.filter((e) => {
      if (Number(e.week) === Number(w)) return true;
      if (!e.due || !wkStart) return false;
      const due = fromIso(e.due);
      return !!due && due >= addDays(wkStart, -1) && due <= wkEnd;
    });
    const weekReadings = courseReadings.filter((r) => r.week === w);

    let leftPills = "";
    let rightPills = "";
    let leftLineStyle = "";
    let rightLineStyle = "";

    const hasEventsOrReadings = weekEvents.length > 0 || weekReadings.length > 0;

    if (hasEventsOrReadings) {
      // Balanced: Topics on one side, Assessments/Readings on the other
      const isTopicsLeft = idx % 2 === 0;
      const topicsHtml = group.map(renderTopicPill).join("");
      const eventsHtml =
        weekEvents.map(renderEventPill).join("") +
        weekReadings.map(renderReadingPill).join("");

      if (isTopicsLeft) {
        leftPills = topicsHtml;
        rightPills = eventsHtml;
        leftLineStyle = " dotted";
        rightLineStyle = " solid";
      } else {
        leftPills = eventsHtml;
        rightPills = topicsHtml;
        leftLineStyle = " solid";
        rightLineStyle = " dotted";
      }
    } else if (group.length >= 2) {
      // Multiple topics: split evenly across left and right
      const mid = Math.ceil(group.length / 2);
      leftPills = group.slice(0, mid).map(renderTopicPill).join("");
      rightPills = group.slice(mid).map(renderTopicPill).join("");
      leftLineStyle = " dotted";
      rightLineStyle = " dotted";
    } else {
      // Exactly 1 topic: contextual schedule badge on the opposite side
      const topicsHtml = group.map(renderTopicPill).join("");
      const first = group[0];
      const dateText =
        first && first.start ? fmtDate(first.start, false) : "Syllabus Unit " + w;
      const badgeHtml =
        '<div class="roadmap-schedule-badge">' +
        '<span class="schedule-badge-icon" aria-hidden="true">🎯</span>' +
        '<div class="schedule-badge-content">' +
        '<span class="schedule-badge-text">' +
        esc(dateText) +
        "</span>" +
        '<span class="schedule-badge-sub">Core Objective · 1 Topic</span>' +
        "</div>" +
        "</div>";

      if (idx % 2 === 0) {
        leftPills = badgeHtml;
        rightPills = topicsHtml;
        leftLineStyle = " dotted";
        rightLineStyle = " dotted";
      } else {
        leftPills = topicsHtml;
        rightPills = badgeHtml;
        leftLineStyle = " dotted";
        rightLineStyle = " dotted";
      }
    }

    // Midterm Divider (Image 3 style)
    if (weeks.length >= 4 && idx === midpoint) {
      treeStepsHtml +=
        '<div class="roadmap-tree-divider">' +
        '<div class="roadmap-divider-box">' +
        '<span class="roadmap-divider-pill">Midterm Checkpoint</span>' +
        '<p class="roadmap-divider-text">Verify that introductory topics are covered and preliminary coursework is submitted.</p>' +
        '<button type="button" class="btn xs ghost" data-act="tab" data-view="courses" data-arg="deadlines">View assessment calendar →</button>' +
        "</div>" +
        "</div>";
    }

    // Module Row (The rail class ensures test compatibility)
    treeStepsHtml +=
      '<div class="roadmap-tree-step rail' +
      (isWeekDone ? " week-completed" : "") +
      '" id="roadmap-week-' +
      w +
      '">' +
      // Left Column
      '<div class="roadmap-step-col left">' +
      '<div class="roadmap-branch-pills">' +
      leftPills +
      "</div>" +
      (leftPills
        ? '<div class="roadmap-branch-line' +
          leftLineStyle +
          '" aria-hidden="true"></div>'
        : "") +
      "</div>" +
      // Center Spine Yellow Box Node (Image 3)
      '<div class="roadmap-spine-node" id="roadmap-node-' +
      w +
      '">' +
      '<span class="spine-node-title">Week ' +
      w +
      "</span>" +
      (isWeekDone
        ? '<span class="spine-done-pill" title="All topics covered">✓</span>'
        : "") +
      "</div>" +
      // Right Column
      '<div class="roadmap-step-col right">' +
      (rightPills
        ? '<div class="roadmap-branch-line' +
          rightLineStyle +
          '" aria-hidden="true"></div>'
        : "") +
      '<div class="roadmap-branch-pills">' +
      rightPills +
      "</div>" +
      "</div>" +
      "</div>";
  });

  // End of course endpoint
  treeStepsHtml +=
    '<div class="roadmap-tree-endpoint">' +
    '<div class="roadmap-endpoint-badge">🏁 Final Evaluation &amp; Term Mastery</div>' +
    "</div>";

  let h = '<div class="roadmap-visual-wrapper">';

  // Diagram Top Header: Legend on Left, Interactive Tip on Right (Image 3)
  h += '<div class="roadmap-canvas-header">';
  h += '<div class="roadmap-legend-card" role="region" aria-label="Roadmap legend">';
  h += '<div class="roadmap-legend-row"><span class="legend-chk-dot">✓</span><span>Covered Topic</span></div>';
  h += '<div class="roadmap-legend-row"><span class="legend-color-box yellow"></span><span>Core Module</span></div>';
  h += '<div class="roadmap-legend-row"><span class="legend-color-box amber"></span><span>Extracted Topic</span></div>';
  h += '<div class="roadmap-legend-row"><span class="legend-color-box blue"></span><span>Assessment / Milestone</span></div>';
  h += '<div class="roadmap-legend-row"><span class="legend-reading-dot">📖</span><span>Required Reading</span></div>';
  h += "</div>";

  h += '<div class="roadmap-canvas-tip">';
  h += '<span class="small muted">Click <strong class="purple-text">✓</strong> on any topic to track syllabus mastery. Click assessments for deadlines.</span>';
  h += "</div>";
  h += "</div>"; // closes .roadmap-canvas-header

  // Visual Roadmap Tree Canvas
  h += '<div class="roadmap-tree-canvas">';
  h += '<div class="roadmap-canvas-spine-line" aria-hidden="true"></div>';
  h += treeStepsHtml;
  h += "</div>"; // closes .roadmap-tree-canvas

  h += "</div>"; // closes .roadmap-visual-wrapper

  // ── Dual-view wrapper: Visual Tree | Curriculum Matrix ─────────────────
  const view = (UIState && UIState.roadmapView) || "tree";
  const matrixHtml = renderCurriculumMatrix(course, allLessons, allEvents);
  const showMatrix = view === "matrix" && matrixHtml;

  const tabBar =
    '<div class="roadmap-view-tabs" role="tablist" aria-label="Roadmap view">' +
    '<button type="button" class="roadmap-view-tab' +
    (!showMatrix ? " active" : "") +
    '" data-act="roadmap-view" data-view="tree" role="tab" aria-selected="' +
    (!showMatrix ? "true" : "false") +
    '">🗺 Visual Roadmap</button>' +
    (matrixHtml
      ? '<button type="button" class="roadmap-view-tab' +
        (showMatrix ? " active" : "") +
        '" data-act="roadmap-view" data-view="matrix" role="tab" aria-selected="' +
        (showMatrix ? "true" : "false") +
        '">📋 Curriculum Matrix</button>'
      : "") +
    "</div>";

  return (
    tabBar +
    (showMatrix
      ? '<div class="card roadmap-matrix-card">' +
        '<div class="card-head"><h2>PNU Curriculum Matrix</h2>' +
        '<span class="tiny muted">Week × ILOs × Content × TLA × Assessment</span></div>' +
        matrixHtml +
        "</div>"
      : h)
  );
}

export {
  renderVisualRoadmapTree,
  renderDeadlines,
  renderReadings,
  renderTables,
};

export function roadmap() {
  if (!UIState.tab.courses) {
    UIState.tab.courses =
      UIState.courseId && UIState.courseId !== "all" ? "roadmap" : "courses";
  }
  return courses();
}

export const roadmapView = {
  fn: roadmap,
  after: bindCoursesView,
};

