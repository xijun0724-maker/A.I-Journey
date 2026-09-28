// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";

vi.mock("../../src/core/router.js", () => {
  const Router = {
    render: vi.fn(),
    scheduleRender: vi.fn(),
    navigate: vi.fn(),
  };
  return { Router, default: Router };
});

import { Store } from "../../src/core/store.js";
import { UIState } from "../../src/core/scope.js";
import { courses, bindCoursesView, resetCoursesViewState } from "../../src/views/courses.js";
import { initActionDelegation } from "../../src/app/actions-delegation.js";

function click(el) {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("Courses View — Moodle 4.x Layout & Functionality", () => {
  beforeAll(() => {
    initActionDelegation();
  });

  beforeEach(() => {
    Store.resetAll();
    resetCoursesViewState();
    UIState.courseId = "all";
    // Seed test courses
    Store.db.courses = [
      {
        id: "c1",
        title: "2D Digital Animation",
        code: "BTLE-TP 2-II-13",
        yearLevel: "Second Year",
        instructor: "Prof. Cruz",
        starred: false,
        removedFromView: false,
      },
      {
        id: "c2",
        title: "Introduction to ICT Education",
        code: "BTLE-TP-S-TLE05",
        yearLevel: "Second Year",
        instructor: "Dr. Reyes",
        starred: true,
        removedFromView: false,
      },
      {
        id: "c3",
        title: "Old Archived Course",
        code: "OLD-101",
        yearLevel: "First Year",
        starred: false,
        removedFromView: true,
      },
    ];

    // Seed events for completion calculation
    Store.db.events = [
      { id: "e1", courseId: "c1", status: "done", type: "assignment", subtasks: [] },
      { id: "e2", courseId: "c2", status: "done", type: "assignment", subtasks: [] },
    ];
  });

  it("renders the Moodle 4.x toolbar with filter button, search input, and select controls", () => {
    const html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    const root = document.getElementById("viewRoot");
    bindCoursesView(root);

    const filterBtn = root.querySelector("#coursesFilterBtn");
    const filterDropdown = root.querySelector("#coursesFilterDropdown");
    const searchInput = root.querySelector("#coursesSearchInput");
    const sortSelect = root.querySelector("#coursesSortSelect");
    const viewSelect = root.querySelector("#coursesViewSelect");

    expect(filterBtn).not.toBeNull();
    expect(filterDropdown).not.toBeNull();
    expect(searchInput).not.toBeNull();
    expect(sortSelect).not.toBeNull();
    expect(viewSelect).not.toBeNull();

    // Verify filter dropdown menu items and dividers
    const items = filterDropdown.querySelectorAll(".moodle-dropdown-item");
    const itemValues = Array.from(items).map((el) => el.getAttribute("data-filter-val"));
    expect(itemValues).toContain("all-with-removed");
    expect(itemValues).toContain("all");
    expect(itemValues).toContain("inprogress");
    expect(itemValues).toContain("future");
    expect(itemValues).toContain("past");
    expect(itemValues).toContain("starred");
    expect(itemValues).toContain("removed-from-view");

    const dividers = filterDropdown.querySelectorAll(".moodle-dropdown-divider");
    expect(dividers.length).toBeGreaterThanOrEqual(4);
  });

  it("toggles the filter dropdown menu when clicking the filter button", () => {
    const html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    const root = document.getElementById("viewRoot");
    bindCoursesView(root);

    const filterBtn = root.querySelector("#coursesFilterBtn");
    const filterDropdown = root.querySelector("#coursesFilterDropdown");

    expect(filterDropdown.style.display).toBe("none");
    click(filterBtn);
    expect(filterDropdown.style.display).toBe("block");
    expect(filterBtn.getAttribute("aria-expanded")).toBe("true");

    click(filterBtn);
    expect(filterDropdown.style.display).toBe("none");
  });

  it("filters correctly when selecting 'Removed from view'", () => {
    const html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    const root = document.getElementById("viewRoot");
    bindCoursesView(root);

    const filterBtn = root.querySelector("#coursesFilterBtn");
    const filterDropdown = root.querySelector("#coursesFilterDropdown");
    const filterBtnLabel = root.querySelector("#coursesFilterBtnLabel");

    // Initially in 'All' view: c1 and c2 are visible, c3 (removed) is hidden
    const cardC1 = root.querySelector('.lms-course-card[data-course-id="c1"]');
    const cardC2 = root.querySelector('.lms-course-card[data-course-id="c2"]');
    const cardC3 = root.querySelector('.lms-course-card[data-course-id="c3"]');

    expect(cardC1.style.display).toBe("");
    expect(cardC2.style.display).toBe("");
    expect(cardC3.style.display).toBe("none");

    // Click filter button and choose 'Removed from view'
    click(filterBtn);
    const removedItem = filterDropdown.querySelector('[data-filter-val="removed-from-view"]');
    click(removedItem);

    // Button label updates to 'Removed from view'
    expect(filterBtnLabel.textContent).toBe("Removed from view");
    expect(removedItem.querySelector(".dropdown-check").textContent).toBe("✓");

    // Now c3 is visible, c1 and c2 are hidden
    expect(cardC1.style.display).toBe("none");
    expect(cardC2.style.display).toBe("none");
    expect(cardC3.style.display).toBe("");
  });

  it("filters correctly when selecting 'Starred'", () => {
    const html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    const root = document.getElementById("viewRoot");
    bindCoursesView(root);

    const filterDropdown = root.querySelector("#coursesFilterDropdown");
    const starredItem = filterDropdown.querySelector('[data-filter-val="starred"]');
    click(starredItem);

    const cardC1 = root.querySelector('.lms-course-card[data-course-id="c1"]');
    const cardC2 = root.querySelector('.lms-course-card[data-course-id="c2"]');
    const cardC3 = root.querySelector('.lms-course-card[data-course-id="c3"]');

    expect(cardC1.style.display).toBe("none");
    expect(cardC2.style.display).toBe(""); // c2 is starred
    expect(cardC3.style.display).toBe("none");
  });

  it("filters courses when typing in search input", () => {
    const html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    const root = document.getElementById("viewRoot");
    bindCoursesView(root);

    const searchInput = root.querySelector("#coursesSearchInput");
    searchInput.value = "Animation";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    const cardC1 = root.querySelector('.lms-course-card[data-course-id="c1"]');
    const cardC2 = root.querySelector('.lms-course-card[data-course-id="c2"]');

    expect(cardC1.style.display).toBe("");
    expect(cardC2.style.display).toBe("none");
  });

  it("renders 3-dots kebab menu, toggles active states, and handles star/unstar and remove/restore", () => {
    let html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    let root = document.getElementById("viewRoot");
    bindCoursesView(root);

    const card = root.querySelector('.lms-course-card[data-course-id="c1"]');
    const progBar = card.querySelector(".lms-card-progress-bar");
    const progFill = card.querySelector(".lms-card-progress-fill");
    const progPct = card.querySelector(".lms-card-prog-pct");
    const kebabBtn = card.querySelector(".lms-kebab-btn");
    const menu = root.querySelector("#courseMenu-c1");

    expect(progBar).not.toBeNull();
    expect(progFill).not.toBeNull();
    expect(progPct.textContent).toContain("% complete");
    expect(kebabBtn.textContent.trim()).toBe("⋮");

    // Initially menu is closed
    expect(menu.style.display).toBe("none");
    expect(kebabBtn.classList.contains("active")).toBe(false);
    expect(card.classList.contains("menu-open")).toBe(false);

    // Open kebab menu
    click(kebabBtn);
    expect(menu.style.display).toBe("block");
    expect(kebabBtn.classList.contains("active")).toBe(true);
    expect(card.classList.contains("menu-open")).toBe(true);

    // Verify menu items: c1 is unstarred, not removed
    const starBtn = menu.querySelector('[data-act="toggle-star-course"]');
    const removeBtn = menu.querySelector('[data-act="toggle-remove-view-course"]');
    expect(starBtn.textContent.trim()).toBe("Star this course");
    expect(removeBtn.textContent.trim()).toBe("Remove from view");

    // Click "Star this course"
    click(starBtn);
    expect(Store.db.courses.find((c) => c.id === "c1").starred).toBe(true);
    expect(menu.style.display).toBe("none");

    // Re-render to verify starred state reflections
    html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    root = document.getElementById("viewRoot");
    bindCoursesView(root);

    const updatedCard = root.querySelector('.lms-course-card[data-course-id="c1"]');
    expect(updatedCard.querySelector(".lms-card-star")).not.toBeNull();
    const updatedMenu = root.querySelector("#courseMenu-c1");
    const updatedStarBtn = updatedMenu.querySelector('[data-act="toggle-star-course"]');
    expect(updatedStarBtn.textContent.trim()).toBe("Unstar this course");

    // Open kebab menu and click "Remove from view"
    const updatedKebabBtn = updatedCard.querySelector(".lms-kebab-btn");
    click(updatedKebabBtn);
    const updatedRemoveBtn = updatedMenu.querySelector('[data-act="toggle-remove-view-course"]');
    click(updatedRemoveBtn);
    expect(Store.db.courses.find((c) => c.id === "c1").removedFromView).toBe(true);

    // Re-render and filter by "Removed from view"
    html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    root = document.getElementById("viewRoot");
    bindCoursesView(root);

    // Click filter button and choose "Removed from view"
    const filterBtn = root.querySelector("#coursesFilterBtn");
    const filterDropdown = root.querySelector("#coursesFilterDropdown");
    click(filterBtn);
    const removedItem = filterDropdown.querySelector('[data-filter-val="removed-from-view"]');
    click(removedItem);

    // c1 is now visible in Removed from view filter and menu shows "Restore to view"
    const removedCard = root.querySelector('.lms-course-card[data-course-id="c1"]');
    expect(removedCard.style.display).toBe("");
    const removedMenu = root.querySelector("#courseMenu-c1");
    const restoreBtn = removedMenu.querySelector('[data-act="toggle-remove-view-course"]');
    expect(restoreBtn.textContent.trim()).toBe("Restore to view");

    // Click "Restore to view"
    click(restoreBtn);
    expect(Store.db.courses.find((c) => c.id === "c1").removedFromView).toBe(false);
  });

  it("switches between Card and List layout when selecting from coursesViewSelect", () => {
    const html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    const root = document.getElementById("viewRoot");
    bindCoursesView(root);

    const grid = root.querySelector("#lmsCoursesGrid");
    const viewSelect = root.querySelector("#coursesViewSelect");

    expect(grid.classList.contains("layout-list")).toBe(false);

    viewSelect.value = "list";
    viewSelect.dispatchEvent(new Event("change", { bubbles: true }));
    expect(grid.classList.contains("layout-list")).toBe(true);

    viewSelect.value = "card";
    viewSelect.dispatchEvent(new Event("change", { bubbles: true }));
    expect(grid.classList.contains("layout-list")).toBe(false);
  });

  it("sorts courses in real-time when selecting sort options", () => {
    const html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    const root = document.getElementById("viewRoot");
    bindCoursesView(root);

    const sortSelect = root.querySelector("#coursesSortSelect");
    const grid = root.querySelector("#lmsCoursesGrid");

    sortSelect.value = "code";
    sortSelect.dispatchEvent(new Event("change", { bubbles: true }));

    const cards = Array.from(grid.querySelectorAll(".lms-course-card"));
    const codes = cards.map((c) => c.getAttribute("data-code"));
    // Alphabetical order of codes: "btle-tp 2-ii-13", "btle-tp-s-tle05", "old-101"
    expect(codes[0]).toBe("btle-tp 2-ii-13");
    expect(codes[1]).toBe("btle-tp-s-tle05");
  });

  it("lists every course even when a course scope is focused", () => {
    // Opening a course once locks UIState.courseId to it — My courses must
    // still show all courses so newly imported ones are never hidden.
    UIState.courseId = "c1";

    const html = courses();
    expect(html).toContain('data-course-id="c1"');
    expect(html).toContain('data-course-id="c2"');
    expect(html).toContain('data-course-id="c3"');

    UIState.courseId = "all";
  });

  it("does not render the redundant tab switcher in Courses and Roadmap view", () => {
    const html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    const root = document.getElementById("viewRoot");

    const tabsContainer = root.querySelector(".courses-roadmap-tabs");
    expect(tabsContainer).toBeNull();
  });

  it("renders streamlined courses overview grid without side companion rail", () => {
    const html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    const root = document.getElementById("viewRoot");

    const sideCol = root.querySelector(".courses-side-col");
    expect(sideCol).toBeNull();

    const overviewCard = root.querySelector(".course-overview-card");
    expect(overviewCard).not.toBeNull();
    expect(root.querySelector("#lmsCoursesGrid")).not.toBeNull();
  });

  it("renders card 'View Roadmap →' CTA button and kebab menu item", () => {
    const html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    const root = document.getElementById("viewRoot");

    const card = root.querySelector('.lms-course-card[data-course-id="c1"]');
    const ctaBtn = card.querySelector(".course-roadmap-btn");
    expect(ctaBtn).not.toBeNull();
    expect(ctaBtn.textContent).toContain("View Roadmap →");
    expect(ctaBtn.getAttribute("data-act")).toBe("course-open-roadmap");
    expect(ctaBtn.getAttribute("data-id")).toBe("c1");

    const menu = root.querySelector("#courseMenu-c1");
    const roadmapMenuItem = menu.querySelector('[data-act="course-open-roadmap"]');
    expect(roadmapMenuItem).not.toBeNull();
    expect(roadmapMenuItem.textContent).toContain("View Roadmap");
  });

  it("renders roadmap weekly outline, course scope pills, and focused banner when roadmap tab is active", () => {
    // Seed lessons for roadmap
    Store.db.lessons = [
      { id: "l1", courseId: "c1", week: 1, topic: "Intro to Animation", done: false },
      { id: "l2", courseId: "c2", week: 2, topic: "ICT Fundamentals", done: true },
    ];

    UIState.tab.courses = "roadmap";
    UIState.courseId = "c1";

    const html = courses();
    document.body.innerHTML = '<div id="viewRoot">' + html + "</div>";
    const root = document.getElementById("viewRoot");

    // Course scope bar is removed for clean layout
    expect(root.querySelector(".roadmap-scope-bar")).toBeNull();

    // Focused course banner is rendered
    const focusedBanner = root.querySelector(".roadmap-focused-banner");
    expect(focusedBanner).not.toBeNull();
    expect(focusedBanner.textContent).toContain("2D Digital Animation");
    expect(focusedBanner.textContent).toContain("Focused course");

    // Course Pulse KPI dock is removed
    expect(root.querySelector("#roadmapKpiDock")).toBeNull();

    // Weekly rail outline is rendered
    expect(root.querySelector(".rail")).not.toBeNull();
    expect(root.textContent).toContain("Intro to Animation");

    // Reset state
    UIState.tab.courses = "courses";
    UIState.courseId = "all";
  });

  it("renders assessment calendar, readings, and extracted tables on their respective tabs", () => {
    Store.db.events.push({
      id: "e3",
      courseId: "c1",
      title: "Midterm Exam",
      type: "exam",
      status: "open",
      due: "2026-10-15T10:00",
      subtasks: [],
    });
    Store.db.readings = [
      { id: "r1", courseId: "c1", week: 1, title: "Animation Principles Chapter 1", status: "open" }
    ];

    // Deadlines tab
    UIState.tab.courses = "deadlines";
    let html = courses();
    expect(html).toContain("Midterm Exam");

    // Readings tab
    UIState.tab.courses = "readings";
    html = courses();
    expect(html).toContain("Required reading &amp; reference list");
    expect(html).toContain("Animation Principles Chapter 1");

    // Tables tab
    UIState.tab.courses = "tables";
    html = courses();
    expect(html).toContain("Tables extracted from documents");

    // Reset
    UIState.tab.courses = "courses";
  });
});


