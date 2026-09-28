/**
 * Courses View — LMS Canvas/Moodle Style Visual Cards & Designer
 * Features cover image customization, curated templates, search, filter, and sorting.
 */

import { Store } from "../core/store.js";
import { UI, UIState } from "../core/scope.js";
import { Dashboard } from "../domain/dashboard.js";
import { esc, sortBy, safeCssUrl } from "../utils/helpers.js";
import { empty, pageHead } from "./shared.js";
import { getCourseBanner } from "../config/templates.js";
import { q, qa } from "../utils/dom.js";
import { toggleStarCourse, toggleRemoveFromView } from "../core/actions/courses.js";
import {
  renderVisualRoadmapTree,
  renderDeadlines,
  renderReadings,
  renderTables,
} from "./roadmap.js";


// Moodle 4.x Filter Options specification with dividers
const FILTER_OPTIONS = [
  { value: "all-with-removed", label: "All (including removed from view)" },
  { divider: true },
  { value: "all", label: "All" },
  { divider: true },
  { value: "inprogress", label: "In progress" },
  { value: "future", label: "Future" },
  { value: "past", label: "Past" },
  { divider: true },
  { value: "first-year", label: "First Year" },
  { value: "second-year", label: "Second Year" },
  { value: "third-year", label: "Third Year" },
  { value: "fourth-year", label: "Fourth Year" },
  { divider: true },
  { value: "starred", label: "Starred" },
  { divider: true },
  { value: "removed-from-view", label: "Removed from view" },
];

// Session-level filter/sort state
const viewFilterState = {
  search: "",
  filter: "all",
  sort: "name",
  layout: "card",
};

/* One document-level listener set for the view: aborted and re-registered on
   every render so handlers never pile up against detached DOM. */
let _docListenerCtl = null;

export function resetCoursesViewState() {
  viewFilterState.search = "";
  viewFilterState.filter = "all";
  viewFilterState.sort = "name";
  viewFilterState.layout = "card";
}



function renderFocusedCourseBanner(currentCourseId) {
  const targetId =
    !currentCourseId || currentCourseId === "all"
      ? Store.db.courses[0]?.id
      : currentCourseId;
  if (!targetId) return "";
  const course = Store.course(targetId);
  if (!course) return "";

  const titleText = course.code
    ? course.code + " — " + course.title
    : course.title || "Course";
  const yearLevel =
    course.yearLevel ||
    (course.term && course.term.toLowerCase().includes("second")
      ? "Second Year"
      : "First Year");
  const subtitle = [yearLevel, course.instructor].filter(Boolean).join(" · ");
  const rows = Dashboard.completionByCourse({ all: true });
  const row = rows.find((r) => r.course.id === course.id);
  const pctVal = row ? row.pct : 0;

  let h = '<div class="roadmap-focused-banner mb">';
  h += '<div class="roadmap-focused-info">';
  h +=
    '<div class="roadmap-focused-tag"><span class="badge info">Focused course</span></div>';
  h += '<h3 class="roadmap-focused-title">' + esc(titleText) + "</h3>";
  if (subtitle) {
    h +=
      '<div class="roadmap-focused-meta muted">' +
      esc(subtitle) +
      ' · <strong class="focused-prog-text">' +
      pctVal +
      "% complete</strong></div>";
  }
  h += "</div>";
  h += '<div class="roadmap-focused-actions">';
  h +=
    '<button type="button" class="btn sm" data-act="scope-clear-to-courses" title="Return to course overview">← Back to courses</button>';
  h +=
    '<button type="button" class="btn sm" data-act="go-import" title="Import course syllabus">Import syllabus</button>';
  h +=
    '<button type="button" class="btn sm primary" data-act="lesson-new" title="Add topic to this course">+ Add topic</button>';
  h += "</div>";
  h += "</div>";
  return h;
}

export function courses() {
  const defaultTab = "courses";
  const tab = UIState.tab.courses || UIState.tab.roadmap || defaultTab;

  let headActions =
    '<button class="btn sm" data-act="go-import">Import syllabus</button>' +
    '<button class="btn primary sm" data-act="new-course">+ Add course</button>';

  if (UIState.courseId && UIState.courseId !== "all") {
    headActions =
      '<button class="btn sm" data-act="edit-course" data-id="' +
      esc(UIState.courseId) +
      '">Edit course</button>' +
      headActions;
  }

  const h = pageHead(
    "Roadmap",
    "All enrolled courses, weekly curriculum roadmaps, assessment deadlines, and study materials.",
    headActions,
  );

  if (!Store.db.courses.length) {
    return (
      h +
      '<div class="card">' +
      empty(
        "",
        "No courses yet",
        "Add a course or import a syllabus to begin tracking your academic term.",
        '<button class="btn primary mt" data-act="new-course">Add your first course</button><button class="btn mt" data-act="go-import">Import a syllabus</button>',
      ) +
      "</div>"
    );
  }

  if (tab === "courses") {
    const rows = Dashboard.completionByCourse({ all: true });

    // Active filter label
    const curOpt = FILTER_OPTIONS.find((o) => o.value === viewFilterState.filter);
    const curFilterLabel = curOpt ? curOpt.label : "All";

    // Main Course Overview Card with Moodle 4.x Layout
    let out = '<div class="course-overview-card">';
    out +=
      '<div class="course-overview-header">' +
      '<h2 class="course-overview-title">Course overview</h2>' +
      "</div>";

    // 3. Moodle 4.x Interactive Toolbar
    out +=
      '<div class="course-overview-toolbar">' +
      '<div class="course-toolbar-left">' +
      // Moodle Slate Filter Button & Dropdown
      '<div class="moodle-filter-wrap">' +
      '<button type="button" id="coursesFilterBtn" class="moodle-filter-btn" aria-haspopup="true" aria-expanded="false">' +
      '<span id="coursesFilterBtnLabel">' + esc(curFilterLabel) + '</span>' +
      '<span class="moodle-chevron">▾</span>' +
      '</button>' +
      '<div id="coursesFilterDropdown"  class="moodle-dropdown-menu u-hidden" role="menu">';

    FILTER_OPTIONS.forEach((item) => {
      if (item.divider) {
        out += '<div class="moodle-dropdown-divider"></div>';
      } else {
        const isAct = viewFilterState.filter === item.value;
        out +=
          '<button type="button" class="moodle-dropdown-item' +
          (isAct ? " active" : "") +
          '" data-filter-val="' +
          item.value +
          '">' +
          '<span class="dropdown-check">' +
          (isAct ? "✓" : "") +
          "</span>" +
          '<span class="dropdown-text">' +
          esc(item.label) +
          "</span>" +
          "</button>";
      }
    });

    out +=
      "</div>" + // closes #coursesFilterDropdown
      "</div>" + // closes .moodle-filter-wrap
      '<div class="course-search-wrap">' +
      '<input type="search" id="coursesSearchInput" class="course-search-input" placeholder="Search" aria-label="Search courses" value="' +
      esc(viewFilterState.search) +
      '" />' +
      "</div>" +
      "</div>" + // closes .course-toolbar-left
      '<div class="course-toolbar-right">' +
      '<select id="coursesSortSelect" class="moodle-select" aria-label="Sort courses">' +
      '<option value="name"' + (viewFilterState.sort === "name" ? " selected" : "") + ">Sort by course name</option>" +
      '<option value="progress"' + (viewFilterState.sort === "progress" ? " selected" : "") + ">Sort by progress</option>" +
      '<option value="code"' + (viewFilterState.sort === "code" ? " selected" : "") + ">Sort by course code</option>" +
      "</select>" +
      '<select id="coursesViewSelect" class="moodle-select" aria-label="Layout view">' +
      '<option value="card"' + (viewFilterState.layout === "card" ? " selected" : "") + ">Card</option>" +
      '<option value="list"' + (viewFilterState.layout === "list" ? " selected" : "") + ">List</option>" +
      "</select>" +
      "</div>" +
      "</div>"; // closes .course-overview-toolbar

    // 4. Sort courses according to selected sort option
    let sortedRows = rows.slice();
    if (viewFilterState.sort === "progress") {
      sortedRows = sortBy(sortedRows, (r) => r.pct, -1);
    } else if (viewFilterState.sort === "code") {
      sortedRows = sortBy(sortedRows, (r) => (r.course.code || "").toLowerCase());
    } else {
      sortedRows = sortBy(sortedRows, (r) => (r.course.title || r.course.code || "").toLowerCase());
    }

    // 5. Course Cards Grid
    const isListLayout = viewFilterState.layout === "list";
    out += '<div class="lms-courses-grid' + (isListLayout ? " layout-list" : "") + '" id="lmsCoursesGrid">';

    sortedRows.forEach(function (r) {
      const c = r.course;
      const bannerUrl = safeCssUrl(getCourseBanner(c)) || "";
      const titleText = c.code ? c.code + " — " + c.title : c.title || "Course";
      const yearLevel = c.yearLevel || (c.term && c.term.toLowerCase().includes("second") ? "Second Year" : "First Year");
      const subtitle = [yearLevel, c.instructor].filter(Boolean).join(" · ");
      const isCompleted = r.pct >= 100;
      const isStarred = !!c.starred;
      const isRemoved = !!c.removedFromView;

      out +=
        '<div class="lms-course-card" data-course-id="' + esc(c.id) + '" data-completed="' + (isCompleted ? "true" : "false") + '" data-starred="' + (isStarred ? "true" : "false") + '" data-removed="' + (isRemoved ? "true" : "false") + '" data-pct="' + r.pct + '" data-year="' + esc(yearLevel.toLowerCase()) + '" data-name="' + esc(titleText.toLowerCase()) + '" data-code="' + esc((c.code || "").toLowerCase()) + '">' +
        // Cover banner with Image 1 typography overlay and hover customizer
        '<div class="lms-cover-container" data-style="background-image: url(\'' + bannerUrl + '\');" data-act="course-open-roadmap" data-id="' + esc(c.id) + '">' +
        '<div class="lms-cover-overlay">' +
        (c.code ? '<span class="lms-cover-code-badge">' + esc(c.code) + '</span>' : "") +
        '<div class="lms-cover-title-overlay">' + esc(c.title || c.code || "Course") + "</div>" +
        '<div class="lms-cover-category-overlay">' + esc(c.section || c.term || "Education & Pedagogy") + "</div>" +
        "</div>" +
        '<button type="button" class="lms-cover-edit-btn" data-act="course-image-modal" data-id="' + esc(c.id) + '" title="Edit card cover">' +
        "📷 Change cover" +
        "</button>" +
        "</div>" +
        // Card body
        '<div class="lms-card-body">' +
        '<div class="lms-card-info-col">' +
        '<a href="javascript:void(0)" class="lms-card-title-link" data-act="course-view" data-view="roadmap" data-id="' + esc(c.id) + '" title="' + esc(titleText) + '">' +
        (isStarred ? '<span class="lms-card-star" aria-label="Starred course" title="Starred course">★</span>' : "") +
        esc(titleText) +
        "</a>" +
        '<div class="lms-card-term-text">' +
        esc(subtitle) +
        "</div>" +
        '<div class="lms-card-prog-text">' + r.pct + "% complete</div>" +
        "</div>" + // closes .lms-card-info-col
        // Sleek 5px Moodle Progress Bar
        '<div class="lms-card-progress-bar">' +
        '<div class="lms-card-progress-fill" data-style="width: ' + Math.min(100, Math.max(0, r.pct)) + '%;"></div>' +
        "</div>" +
        // Footer: % complete + View Roadmap CTA + unboxed 3-dots kebab menu
        '<div class="lms-card-footer">' +
        '<span class="lms-card-prog-pct">' + r.pct + "% complete</span>" +
        '<div class="lms-card-footer-actions">' +
        '<button type="button" class="btn xs course-roadmap-btn" data-act="course-open-roadmap" data-id="' + esc(c.id) + '" title="Open weekly roadmap for ' + esc(titleText) + '">' +
        "View Roadmap →" +
        "</button>" +
        '<div class="lms-kebab-wrap">' +
        '<button type="button" class="lms-kebab-btn" data-kebab-id="' + esc(c.id) + '" aria-label="Course options">⋮</button>' +
        '<div  class="lms-kebab-popover u-hidden" id="courseMenu-' + esc(c.id) + '">' +
        '<button type="button" class="lms-menu-item" data-act="course-open-roadmap" data-id="' + esc(c.id) + '">' +
        "View Roadmap" +
        "</button>" +
        '<button type="button" class="lms-menu-item" data-act="toggle-star-course" data-id="' + esc(c.id) + '">' +
        (isStarred ? "Unstar this course" : "Star this course") +
        "</button>" +
        '<button type="button" class="lms-menu-item" data-act="toggle-remove-view-course" data-id="' + esc(c.id) + '">' +
        (isRemoved ? "Restore to view" : "Remove from view") +
        "</button>" +
        "</div>" +
        "</div>" +
        "</div>" +
        "</div>" +
        "</div>" +
        "</div>";
    });

    out += "</div>"; // closes #lmsCoursesGrid

    // Search no results state
    out +=
      '<div id="coursesNoResults" class="u-empty-hidden">' +
      '<p class="muted">No courses match your filter criteria.</p>' +
      '<button type="button" class="btn sm" id="btnResetFilter">Reset filters</button>' +
      "</div>";

    out += "</div>"; // closes .course-overview-card
    return h + out;
  }

  // Roadmap Sub-tabs (Weekly Outline, Deadlines, Readings, Tables)
  const events = UI.events();
  const readings = UI.readings();

  const focusedBanner = renderFocusedCourseBanner(UIState.courseId);

  if (tab === "roadmap") {
    const activeCourse =
      UIState.courseId && UIState.courseId !== "all"
        ? Store.course(UIState.courseId)
        : Store.db.courses[0];
    return (
      focusedBanner +
      renderVisualRoadmapTree(
        activeCourse,
        Store.db.lessons,
        Store.db.events,
        Store.db.readings,
      )
    );
  }

  let subContent = "";
  if (tab === "deadlines") {
    subContent = renderDeadlines(events);
  } else if (tab === "readings") {
    subContent = renderReadings(readings);
  } else if (tab === "tables") {
    subContent = renderTables();
  }

  return h + focusedBanner + subContent;
}

/**
 * Lifecycle hook executed after DOM injection to wire interactive filters, search, sort, and popovers.
 */
export function bindCoursesView(root) {
  const filterBtn = q("#coursesFilterBtn", root);
  const filterDropdown = q("#coursesFilterDropdown", root);
  const filterBtnLabel = q("#coursesFilterBtnLabel", root);
  const searchInput = q("#coursesSearchInput", root);
  const sortSelect = q("#coursesSortSelect", root);
  const viewSelect = q("#coursesViewSelect", root);
  const grid = q("#lmsCoursesGrid", root);
  const noResults = q("#coursesNoResults", root);
  const btnReset = q("#btnResetFilter", root);

  /* The markup closes these two with a class — the only kind of initial
     state CSP lets it carry — but the toggles below read and write the
     inline display they own. Take ownership at bind time so "is it open?"
     has exactly one answer from the first click onward. */
  if (filterDropdown) filterDropdown.style.display = "none";
  qa(".lms-kebab-popover", root).forEach((el) => {
    el.style.display = "none";
  });

  function closeMenus() {
    qa(".lms-kebab-popover", root).forEach((el) => {
      el.style.display = "none";
    });
    qa(".lms-kebab-btn", root).forEach((b) => {
      b.classList.remove("active");
    });
    qa(".lms-course-card", root).forEach((c) => {
      c.classList.remove("menu-open");
    });
  }

  function applyFilter() {
    if (!grid) return;
    const qVal = (viewFilterState.search || "").trim().toLowerCase();

    const fVal = viewFilterState.filter || "all";
    const cards = qa(".lms-course-card", grid);
    let visibleCount = 0;

    cards.forEach((card) => {
      const name = card.getAttribute("data-name") || "";
      const code = card.getAttribute("data-code") || "";
      const isCompleted = card.getAttribute("data-completed") === "true";
      const isStarred = card.getAttribute("data-starred") === "true";
      const isRemoved = card.getAttribute("data-removed") === "true";
      const pctVal = parseFloat(card.getAttribute("data-pct")) || 0;
      const year = card.getAttribute("data-year") || "";

      const matchesSearch = !qVal || name.includes(qVal) || code.includes(qVal);
      let matchesFilter = true;

      if (fVal === "all-with-removed") {
        matchesFilter = true;
      } else if (fVal === "removed-from-view") {
        matchesFilter = isRemoved;
      } else {
        if (isRemoved) {
          matchesFilter = false;
        } else if (fVal === "inprogress") {
          matchesFilter = !isCompleted;
        } else if (fVal === "future") {
          matchesFilter = pctVal === 0;
        } else if (fVal === "past") {
          matchesFilter = isCompleted;
        } else if (fVal === "starred") {
          matchesFilter = isStarred;
        } else if (fVal === "first-year") {
          matchesFilter = year.includes("first");
        } else if (fVal === "second-year") {
          matchesFilter = year.includes("second");
        } else if (fVal === "third-year") {
          matchesFilter = year.includes("third");
        } else if (fVal === "fourth-year") {
          matchesFilter = year.includes("fourth");
        }
      }

      if (matchesSearch && matchesFilter) {
        card.style.display = "";
        visibleCount++;
      } else {
        card.style.display = "none";
      }
    });

    if (noResults) {
      noResults.style.display = visibleCount === 0 ? "block" : "none";
    }
  }

  // Toggle filter dropdown menu
  if (filterBtn && filterDropdown) {
    filterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = filterDropdown.style.display === "none";
      qa(".lms-kebab-popover", root).forEach((el) => {
        el.style.display = "none";
      });
      filterDropdown.style.display = isHidden ? "block" : "none";
      filterBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
    });

    qa(".moodle-dropdown-item", filterDropdown).forEach((item) => {
      item.addEventListener("click", () => {
        const val = item.getAttribute("data-filter-val");
        if (!val) return;
        viewFilterState.filter = val;

        const textSpan = q(".dropdown-text", item);
        if (filterBtnLabel && textSpan) {
          filterBtnLabel.textContent = textSpan.textContent;
        }

        qa(".moodle-dropdown-item", filterDropdown).forEach((it) => {
          const isSelected = it === item;
          it.classList.toggle("active", isSelected);
          const chk = q(".dropdown-check", it);
          if (chk) chk.textContent = isSelected ? "✓" : "";
        });

        filterDropdown.style.display = "none";
        filterBtn.setAttribute("aria-expanded", "false");
        applyFilter();
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      viewFilterState.search = e.target.value;
      applyFilter();
    });
  }

  function sortCards() {
    if (!grid) return;
    const sVal = viewFilterState.sort || "name";
    const cards = Array.from(qa(".lms-course-card", grid));
    cards.sort((a, b) => {
      if (sVal === "progress") {
        const pa = parseFloat(a.getAttribute("data-pct")) || 0;
        const pb = parseFloat(b.getAttribute("data-pct")) || 0;
        return pb - pa;
      }
      if (sVal === "code") {
        const ca = (a.getAttribute("data-code") || "").toLowerCase();
        const cb = (b.getAttribute("data-code") || "").toLowerCase();
        return ca.localeCompare(cb);
      }
      const na = (a.getAttribute("data-name") || "").toLowerCase();
      const nb = (b.getAttribute("data-name") || "").toLowerCase();
      return na.localeCompare(nb);
    });
    cards.forEach((card) => grid.appendChild(card));
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      viewFilterState.sort = e.target.value;
      sortCards();
    });
  }

  if (viewSelect) {
    viewSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      viewFilterState.layout = val;
      if (grid) {
        grid.classList.toggle("layout-list", val === "list");
      }
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      viewFilterState.search = "";
      viewFilterState.filter = "all";
      if (searchInput) searchInput.value = "";
      if (filterBtnLabel) filterBtnLabel.textContent = "All";
      if (filterDropdown) {
        qa(".moodle-dropdown-item", filterDropdown).forEach((it) => {
          const isAll = it.getAttribute("data-filter-val") === "all";
          it.classList.toggle("active", isAll);
          const chk = q(".dropdown-check", it);
          if (chk) chk.textContent = isAll ? "✓" : "";
        });
      }
      applyFilter();
    });
  }

  // Handle 3-dots kebab dropdown toggle
  qa(".lms-kebab-btn", root).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (filterDropdown) filterDropdown.style.display = "none";
      const cid = btn.getAttribute("data-kebab-id");
      const menu = q("#courseMenu-" + cid, root);
      if (!menu) return;

      const isHidden = menu.style.display === "none";
      // Close other menus and remove active states first
      closeMenus();

      if (isHidden) {
        menu.style.display = "block";
        btn.classList.add("active");
        const card = btn.closest(".lms-course-card");
        if (card) card.classList.add("menu-open");

        // Flip to dropup if not enough room below
        const rect = btn.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 120 && rect.top > 120) {
          menu.classList.add("dropup");
        } else {
          menu.classList.remove("dropup");
        }
      }
    });
  });

  // Handle menu item actions directly (Star/Unstar, Remove/Restore)
  qa(".lms-menu-item", root).forEach((item) => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenus();
      const action = item.getAttribute("data-act");
      const id = item.getAttribute("data-id");
      if (action === "toggle-star-course") {
        toggleStarCourse(id);
      } else if (action === "toggle-remove-view-course") {
        toggleRemoveFromView(id);
      }
    });
  });

  // Global click & Escape listener closes open dropdowns
  if (_docListenerCtl) _docListenerCtl.abort();
  _docListenerCtl = new AbortController();
  const docSignal = { signal: _docListenerCtl.signal };

  document.addEventListener(
    "click",
    (e) => {
      if (!e.target.closest(".moodle-filter-wrap") && filterDropdown) {
        filterDropdown.style.display = "none";
        if (filterBtn) filterBtn.setAttribute("aria-expanded", "false");
      }
      if (!e.target.closest(".lms-kebab-wrap")) {
        closeMenus();
      }
    },
    docSignal,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        if (filterDropdown) {
          filterDropdown.style.display = "none";
          if (filterBtn) filterBtn.setAttribute("aria-expanded", "false");
        }
        closeMenus();
      }
    },
    docSignal,
  );


  applyFilter();
}

export const coursesView = {
  fn: courses,
  after: bindCoursesView,
};
