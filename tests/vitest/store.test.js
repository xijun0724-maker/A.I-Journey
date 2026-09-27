import { describe, it, expect, beforeEach } from "vitest";

import { Store } from "../../src/core/store.js";
import { CFG } from "../../src/config/constants.js";

beforeEach(() => {
  Store.resetAll();
});

describe("Store.lookup", () => {
  it("course() returns null for unknown id", () => {
    expect(Store.course("nonexistent")).toBeNull();
  });

  it("course() finds a course by id", () => {
    Store.db.courses = [{ id: "c1", title: "Math" }];
    expect(Store.course("c1")).toEqual({ id: "c1", title: "Math" });
  });

  it('courseName() returns "Unassigned" for missing course', () => {
    expect(Store.courseName("nope")).toBe("Unassigned");
  });

  it("courseName() returns code or title", () => {
    Store.db.courses = [{ id: "c1", code: "CS101", title: "Intro" }];
    expect(Store.courseName("c1")).toBe("CS101");
  });

  it("courseColor() returns default for missing course", () => {
    expect(Store.courseColor("nope")).toBe("#67717a");
  });

  it("event() returns null for unknown id", () => {
    expect(Store.event("nonexistent")).toBeNull();
  });

  it("event() finds an event by id", () => {
    Store.db.events = [{ id: "e1", title: "Midterm" }];
    expect(Store.event("e1")).toEqual({ id: "e1", title: "Midterm" });
  });

  it("doc() returns null for unknown id", () => {
    expect(Store.doc("nonexistent")).toBeNull();
  });

  it("doc() finds a document by id", () => {
    Store.db.documents = [{ id: "d1", name: "syllabus.pdf" }];
    expect(Store.doc("d1")).toEqual({ id: "d1", name: "syllabus.pdf" });
  });

  it("lesson() returns null for unknown id", () => {
    expect(Store.lesson("nonexistent")).toBeNull();
  });

  it("lesson() finds a lesson by id", () => {
    Store.db.lessons = [{ id: "l1", topic: "Week 1" }];
    expect(Store.lesson("l1")).toEqual({ id: "l1", topic: "Week 1" });
  });
});

describe("Store.usage", () => {
  it("returns bytes, pretty string, and cap", () => {
    const u = Store.usage();
    expect(u).toHaveProperty("bytes");
    expect(u).toHaveProperty("pretty");
    expect(u).toHaveProperty("cap");
    expect(u.cap).toBe(CFG.storage.maxBytes);
    expect(typeof u.pretty).toBe("string");
  });

  it("reports non-negative bytes", () => {
    const u = Store.usage();
    expect(u.bytes).toBeGreaterThanOrEqual(0);
  });
});

describe("Store.resetAll", () => {
  it("resets db to blank schema", () => {
    Store.db.courses = [{ id: "c1" }];
    Store.db.events = [{ id: "e1" }];
    Store.resetAll();
    expect(Store.db.courses).toEqual([]);
    expect(Store.db.events).toEqual([]);
    expect(Store.db.version).toBe(CFG.schemaVersion);
  });
});

describe("Store shape guard (test/dev seal)", () => {
  it("rejects a new top-level key while allowing schema reassignment", () => {
    Store.resetAll();
    expect(Object.isSealed(Store.db)).toBe(true);
    Store.db.courses = [{ id: "ok" }];
    expect(Store.db.courses).toHaveLength(1);
    expect(() => {
      Store.db.typoKey = [];
    }).toThrow();
    expect("typoKey" in Store.db).toBe(false);
  });
});

describe("Store.rev()", () => {
  it("starts at 0 and advances on each persist", () => {
    Store.resetAll();
    const before = Store.rev();
    expect(typeof before).toBe("number");
    expect(Store.saveNow()).toBe(true);
    expect(Store.rev()).toBeGreaterThan(before);
  });
});

describe("Store.deduplicateData", () => {
  it("removes repeated imported lessons, events, and readings", () => {
    Store.db.lessons = [
      {
        id: "l1",
        courseId: "c1",
        week: 1,
        topic: "Content management",
        done: false,
      },
      {
        id: "l2",
        courseId: "c1",
        week: 1,
        topic: "Content management",
        done: true,
      },
    ];
    Store.db.events = [
      {
        id: "e1",
        courseId: "c1",
        title: "Final Examination",
        due: null,
        subtasks: [],
      },
      {
        id: "e2",
        courseId: "c1",
        title: "Final Examination",
        due: null,
        subtasks: [],
      },
    ];
    Store.db.readings = [
      { id: "r1", courseId: "c1", week: 1, title: "Classroom management" },
      { id: "r2", courseId: "c1", week: 1, title: "Classroom management" },
    ];

    expect(Store.deduplicateData(Store.db)).toBe(true);
    expect(Store.db.lessons).toHaveLength(1);
    expect(Store.db.lessons[0].done).toBe(true);
    expect(Store.db.events).toHaveLength(1);
    expect(Store.db.readings).toHaveLength(1);
    expect(Store.db.plan).toEqual([]);
    expect(Store.db.planMeta).toBeNull();
  });
});

describe("Store.removeCourse", () => {
  it("removes a course and associated events/lessons", () => {
    Store.db.courses = [{ id: "c1" }, { id: "c2" }];
    Store.db.events = [
      { id: "e1", courseId: "c1", subtasks: [] },
      { id: "e2", courseId: "c2", subtasks: [] },
    ];
    Store.db.lessons = [
      { id: "l1", courseId: "c1" },
      { id: "l2", courseId: "c2" },
    ];
    Store.removeCourse("c1");
    expect(Store.db.courses.length).toBe(1);
    expect(Store.db.courses[0].id).toBe("c2");
    expect(Store.db.events.length).toBe(1);
    expect(Store.db.events[0].id).toBe("e2");
    expect(Store.db.lessons.length).toBe(1);
    expect(Store.db.lessons[0].id).toBe("l2");
  });
});

describe("Store entity namespaces & change events", () => {
  it("emits change event with entity and op on mutations", () => {
    const changes = [];
    const unsub = Store.on("change", (c) => changes.push(c));

    const course = Store.courses.save({ title: "Algorithms", code: "CS201" });
    expect(course.id).toBeDefined();
    expect(changes.length).toBe(1);
    expect(changes[0]).toEqual({ entity: "courses", op: "insert", id: course.id });

    Store.courses.toggleStar(course.id);
    expect(changes.length).toBe(2);
    expect(changes[1]).toEqual({ entity: "courses", op: "toggleStar", id: course.id });

    unsub();
    Store.courses.save({ id: course.id, title: "Adv Algorithms" });
    expect(changes.length).toBe(2); // unsubscribed
  });

  it("Store.courses.remove cascades deletion across all related entities", () => {
    const c1 = Store.courses.save({ id: "c1", title: "Math" });
    const c2 = Store.courses.save({ id: "c2", title: "History" });

    Store.lessons.save({ id: "l1", courseId: "c1", title: "Algebra" });
    Store.lessons.save({ id: "l2", courseId: "c2", title: "Rome" });

    Store.events.save({ id: "e1", courseId: "c1", title: "Exam 1", subtasks: [] });
    Store.events.save({ id: "e2", courseId: "c2", title: "Essay", subtasks: [] });

    Store.readings.save({ id: "r1", courseId: "c1", title: "Ch 1" });
    Store.readings.save({ id: "r2", courseId: "c2", title: "Ch 2" });

    Store.documents.save({ id: "d1", courseId: "c1", name: "syllabus.pdf" });
    Store.db.chunks = [
      { id: "chk1", docId: "d1", text: "chunk 1" },
      { id: "chk2", docId: "d2", text: "chunk 2" },
    ];

    Store.plan.save([
      { id: "p1", courseId: "c1", label: "Study Math" },
      { id: "p2", courseId: "c2", label: "Study Rome" },
    ]);

    Store.courses.remove("c1");

    expect(Store.courses.get("c1")).toBeNull();
    expect(Store.courses.get("c2")).not.toBeNull();
    expect(Store.lessons.get("l1")).toBeNull();
    expect(Store.lessons.get("l2")).not.toBeNull();
    expect(Store.events.get("e1")).toBeNull();
    expect(Store.events.get("e2")).not.toBeNull();
    expect(Store.readings.get("r1")).toBeNull();
    expect(Store.readings.get("r2")).not.toBeNull();
    expect(Store.documents.get("d1")).toBeNull();
    expect(Store.db.chunks.find((c) => c.docId === "d1")).toBeUndefined();
    expect(Store.db.chunks.find((c) => c.docId === "d2")).toBeDefined();
    expect(Store.plan.get().blocks.find((p) => p.courseId === "c1")).toBeUndefined();
    expect(Store.plan.get().blocks.find((p) => p.courseId === "c2")).toBeDefined();
  });

  it("Store.events.toggle cascades subtask done states and recomputes task", () => {
    const ev = Store.events.save({
      id: "ev1",
      title: "Project",
      status: "open",
      subtasks: [
        { id: "s1", title: "Draft", done: false },
        { id: "s2", title: "Submit", done: false },
      ],
    });

    // Toggle event to done
    Store.events.toggle("ev1");
    expect(ev.status).toBe("done");
    expect(ev.completedAt).toBeDefined();
    expect(ev.subtasks.every((s) => s.done)).toBe(true);

    // Toggle event back to open/todo
    Store.events.toggle("ev1");
    expect(ev.status).toBe("todo");
    expect(ev.completedAt).toBeNull();
    expect(ev.subtasks.every((s) => !s.done)).toBe(true);
  });

  it("Store.events.toggleSubtask toggles subtask and recomputes task", () => {
    const ev = Store.events.save({
      id: "ev1",
      title: "Project",
      status: "open",
      subtasks: [
        { id: "s1", title: "Draft", done: false },
        { id: "s2", title: "Submit", done: false },
      ],
    });

    Store.events.toggleSubtask("ev1", "s1");
    expect(ev.subtasks.find((s) => s.id === "s1").done).toBe(true);
    expect(ev.subtasks.find((s) => s.id === "s2").done).toBe(false);

    Store.events.toggleSubtask("ev1", "s1");
    expect(ev.subtasks.find((s) => s.id === "s1").done).toBe(false);
  });

  it("Store.readings.toggle toggles reading status and done flag", () => {
    const r = Store.readings.save({ id: "r1", title: "Chapter 1", status: "required", done: false });
    expect(r.done).toBe(false);

    Store.readings.toggle("r1");
    expect(r.status).toBe("done");
    expect(r.done).toBe(true);

    Store.readings.toggle("r1");
    expect(r.status).toBe("required");
    expect(r.done).toBe(false);
  });

  it("Store.chat methods append, group into conversations, and clear", () => {
    Store.chat.append({ role: "user", content: "hello" });
    Store.chat.append({ role: "assistant", content: "hi" });
    Store.chat.append({ role: "user", content: "how to code?" });
    expect(Store.chat.all()).toHaveLength(3);

    /* One conversation: every message shares the cid the first append
       opened, and Recents lists it once, titled by the first prompt. */
    const convos = Store.chat.conversations();
    expect(convos).toHaveLength(1);
    expect(convos[0].title).toBe("hello");
    expect(Store.chat.activeId()).toBe(convos[0].cid);
    expect(Store.chat.activeMessages()).toHaveLength(3);

    /* New: nothing open, the landing page shows, history stays listed. */
    Store.chat.newConversation();
    expect(Store.chat.activeId()).toBeNull();
    expect(Store.chat.activeMessages()).toEqual([]);
    expect(Store.chat.conversations()).toHaveLength(1);

    /* The next message starts a second conversation. */
    Store.chat.append({ role: "user", content: "new topic" });
    const after = Store.chat.conversations();
    expect(after).toHaveLength(2);
    expect(after[0].title).toBe("new topic");
    expect(Store.chat.activeMessages().map((m) => m.content)).toEqual([
      "new topic",
    ]);
  });

  it("Store.chat.removeConversation drops one chat and closes it", () => {
    Store.chat.append({ role: "user", content: "first chat" });
    const first = Store.chat.activeId();
    Store.chat.newConversation();
    Store.chat.append({ role: "user", content: "second chat" });

    Store.chat.removeConversation(first);
    expect(Store.chat.conversations()).toHaveLength(1);
    expect(Store.chat.activeId()).not.toBe(first);

    Store.chat.removeConversation(Store.chat.activeId());
    expect(Store.chat.all()).toEqual([]);
    expect(Store.chat.activeId()).toBeNull();

    Store.chat.clear();
    expect(Store.chat.all()).toEqual([]);
  });

  it("Store.plan and Store.settings namespaces update and notify correctly", () => {
    Store.plan.save([{ id: "p1", label: "Study" }], { totalMinutes: 60 });
    const p = Store.plan.get();
    expect(p.blocks).toHaveLength(1);
    expect(p.meta.totalMinutes).toBe(60);

    Store.plan.clear();
    expect(Store.plan.get().blocks).toEqual([]);
    expect(Store.plan.get().meta).toBeNull();

    const s = Store.settings.update({ studyWeekday: 3, studyWeekend: 5 });
    expect(s.studyWeekday).toBe(3);
    expect(s.studyWeekend).toBe(5);
    expect(Store.settings.get().studyWeekday).toBe(3);
  });
});

