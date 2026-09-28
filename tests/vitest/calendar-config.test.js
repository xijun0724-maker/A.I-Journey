// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { UIState } from "../../src/core/scope.js";
import { KNOWN_ACTIONS } from "../../src/core/actions/index.js";
import {
  getCalendarConfig,
  configureCalendar,
  configureAcademicCalendar,
  renderCalendarCard,
  calendarViewDef,
  showDayEventsModal,
} from "../../src/views/calendar.js";

describe("Calendar Configuration Feature", () => {
  beforeEach(() => {
    Store.resetAll();
    document.body.innerHTML = '<div id="modalRoot"></div>';
    UIState.set("calendarCourseId", "all");
    UIState.set("calendarMonth", 8); // September
    UIState.set("calendarYear", 2026);
  });

  it("registers academic-calendar-modal in KNOWN_ACTIONS", () => {
    expect(KNOWN_ACTIONS.has("academic-calendar-modal")).toBe(true);
  });

  it("configures academic calendar term start and end dates via configureAcademicCalendar", () => {
    const saved = configureAcademicCalendar({
      academicYear: "2026–2027",
      termName: "1st Term",
      termStart: "2026-09-01",
      termEnd: "2027-01-20",
      generateMilestones: true,
    });

    expect(saved).toBeDefined();
    expect(saved.termStart).toBe("2026-09-01");
    expect(saved.termEnd).toBe("2027-01-20");
    expect(Store.db.settings.termStart).toBe("2026-09-01");
    expect(Store.db.settings.termEnd).toBe("2027-01-20");

    const milestones = Store.db.events.filter((e) => e.tag === "academic-milestone");
    expect(milestones.length).toBe(4);
  });

  it("retrieves standard default calendar configuration", () => {
    const cfg = getCalendarConfig();
    expect(cfg.startOfWeek).toBe(1); // Monday default
    expect(cfg.maxEventsPerCell).toBe(4);
    expect(cfg.timeFormat).toBe("12h");
    expect(cfg.showMilestones).toBe(true);
    expect(cfg.showExams).toBe(true);
    expect(cfg.showAssignments).toBe(true);
    expect(cfg.showOther).toBe(true);
  });

  it("updates calendar configuration programmatically via configureCalendar()", () => {
    const updated = configureCalendar({
      startOfWeek: 0, // Sunday
      maxEventsPerCell: 2,
      timeFormat: "24h",
      showMilestones: false,
      showOther: false,
    });

    expect(updated.startOfWeek).toBe(0);
    expect(updated.maxEventsPerCell).toBe(2);
    expect(updated.timeFormat).toBe("24h");
    expect(updated.showMilestones).toBe(false);
    expect(updated.showOther).toBe(false);
    expect(updated.showExams).toBe(true); // preserved

    // Check persistence into Store.db.settings
    expect(Store.db.settings.calendarStartOfWeek).toBe(0);
    expect(Store.db.settings.calendarMaxEvents).toBe(2);
    expect(Store.db.settings.calendarTimeFormat).toBe("24h");
    expect(Store.db.settings.calendarShowMilestones).toBe(false);
    expect(Store.db.settings.calendarShowOther).toBe(false);
  });

  it("renders calendar card with Add academic calendar button", () => {
    const html = renderCalendarCard();
    expect(html).toContain('id="btnAcademicCal"');
    expect(html).toContain('data-act="academic-calendar-modal"');
    expect(html).toContain("Add academic calendar");
  });

  it("renders Monday-first week headers by default", () => {
    configureCalendar({ startOfWeek: 1 });
    const html = renderCalendarCard();
    expect(html).toContain('<th scope="col" class="cal-th">Mon</th>');
    expect(html).toContain('<th scope="col" class="cal-th">Sun</th>');

    const monIdx = html.indexOf('<th scope="col" class="cal-th">Mon</th>');
    const sunIdx = html.indexOf('<th scope="col" class="cal-th">Sun</th>');
    expect(monIdx).toBeLessThan(sunIdx);
  });

  it("renders Sunday-first week headers when configured to start on Sunday", () => {
    configureCalendar({ startOfWeek: 0 });
    const html = renderCalendarCard();
    expect(html).toContain('<th scope="col" class="cal-th">Sun</th>');
    expect(html).toContain('<th scope="col" class="cal-th">Mon</th>');

    const sunIdx = html.indexOf('<th scope="col" class="cal-th">Sun</th>');
    const monIdx = html.indexOf('<th scope="col" class="cal-th">Mon</th>');
    expect(sunIdx).toBeLessThan(monIdx);
  });

  it("filters out categories when disabled in configuration", () => {
    Store.db.events = [
      {
        id: "ev-assign",
        title: "Assignment Due",
        due: "2026-09-15T10:00:00",
        type: "assignment",
      },
      {
        id: "ev-milestone",
        title: "Classes Begin Milestone",
        due: "2026-09-15T08:00:00",
        type: "other",
        tag: "academic-milestone",
      },
      {
        id: "ev-exam",
        title: "Midterm Exam",
        due: "2026-09-15T13:00:00",
        type: "exam",
      },
    ];

    // Case 1: All visible
    configureCalendar({
      showAssignments: true,
      showMilestones: true,
      showExams: true,
    });
    let html = renderCalendarCard();
    expect(html).toContain("Assignment Due");
    expect(html).toContain("Classes Begin");
    expect(html).toContain("Midterm Exam");

    // Case 2: Hide milestones
    configureCalendar({
      showMilestones: false,
    });
    html = renderCalendarCard();
    expect(html).toContain("Assignment Due");
    expect(html).not.toContain("Classes Begin");
    expect(html).toContain("Midterm Exam");

    // Case 3: Hide assignments
    configureCalendar({
      showAssignments: false,
      showMilestones: true,
    });
    html = renderCalendarCard();
    expect(html).not.toContain("Assignment Due");
    expect(html).toContain("Classes Begin");
  });

  it("respects maxEventsPerCell limit and shows overflow count", () => {
    Store.db.events = [
      { id: "e1", title: "Task 1", due: "2026-09-10T09:00:00", type: "assignment" },
      { id: "e2", title: "Task 2", due: "2026-09-10T10:00:00", type: "assignment" },
      { id: "e3", title: "Task 3", due: "2026-09-10T11:00:00", type: "assignment" },
      { id: "e4", title: "Task 4", due: "2026-09-10T12:00:00", type: "assignment" },
      { id: "e5", title: "Task 5", due: "2026-09-10T13:00:00", type: "assignment" },
    ];

    configureCalendar({ maxEventsPerCell: 2 });
    const html = renderCalendarCard();
    expect(html).toContain("Task 1");
    expect(html).toContain("Task 2");
    expect(html).not.toContain("Task 3");
    expect(html).toContain("+ 3 more");
  });

  it("formats time properly in day events modal for 12h vs 24h", () => {
    Store.db.events = [
      { id: "e1", title: "Physics Lab", due: "2026-09-10T14:30:00", type: "assignment" },
    ];

    // 12-hour format
    configureCalendar({ timeFormat: "12h" });
    showDayEventsModal("2026-09-10");
    const modalEl = document.querySelector(".modal");
    expect(modalEl.innerHTML).toContain("2:30 PM");

    // 24-hour format
    configureCalendar({ timeFormat: "24h" });
    showDayEventsModal("2026-09-10");
    expect(document.querySelector(".modal").innerHTML).toContain("14:30");
  });
});
