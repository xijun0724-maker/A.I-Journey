import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { Standards } from "../../src/config/standards/index.js";
import { analyse } from "../../src/domain/nlp/analyse.js";
import { analyseAgainstStandard } from "../../src/domain/nlp/standards.js";

beforeEach(() => {
  Store.resetAll();
});

describe("Standards registry", () => {
  it("has PNU and generic built-ins", () => {
    const list = Standards.list();
    const ids = list.map((s) => s.id);
    expect(ids).toContain("pnu-cmi-teacher-education-2025");
    expect(ids).toContain("generic-higher-ed");
    expect(Standards.DEFAULT_ID).toBe("pnu-cmi-teacher-education-2025");
  });

  it("get() returns the default for unknown ids", () => {
    const s = Standards.get("does-not-exist");
    expect(s.id).toBe(Standards.DEFAULT_ID);
    expect(s.label).toMatch(/PNU/i);
  });

  it("get() returns registered standards by id", () => {
    expect(Standards.get("generic-higher-ed").label).toMatch(/generic/i);
    expect(Standards.get("pnu-cmi-teacher-education-2025").builtin).toBe(true);
  });

  it("resolve() accepts id string, settings object, or nothing", () => {
    expect(Standards.resolve("generic-higher-ed").id).toBe("generic-higher-ed");
    expect(
      Standards.resolve({ syllabusStandard: "generic-higher-ed" }).id,
    ).toBe("generic-higher-ed");
    expect(Standards.resolve(null).id).toBe(Standards.DEFAULT_ID);
    expect(Standards.resolve().id).toBe(Standards.DEFAULT_ID);
  });
});

describe("analyseAgainstStandard with registry", () => {
  const emptyResult = { lessons: [], events: [], readings: [] };

  it("defaults to the configured settings standard", () => {
    const a = analyseAgainstStandard("nothing here", emptyResult);
    expect(a.standard).toBe(Store.db.settings.syllabusStandard);
    expect(a.standardLabel).toBeTruthy();
    expect(typeof a.score).toBe("number");
  });

  it("analyses against an explicit standard id", () => {
    const text = [
      "Course Code: CS 101",
      "Learning Outcomes: Students will be able to design algorithms.",
      "Schedule",
      "Week 1 Intro",
      "Assessment: midterm and final",
      "Grading scale: A 90-100",
      "Required readings: textbook chapter 1",
      "Attendance policy: attend class",
      "Instructor: Dr Smith office hours",
    ].join("\n");
    const a = analyseAgainstStandard(
      text,
      emptyResult,
      "generic-higher-ed",
    );
    expect(a.standard).toBe("generic-higher-ed");
    expect(a.standardLabel).toMatch(/generic/i);
    expect(a.score).toBeGreaterThan(50);
    const present = a.sections.filter((s) => s.status === "present");
    expect(present.length).toBeGreaterThanOrEqual(5);
  });

  it("scores poorly on empty text against any standard", () => {
    const a = analyseAgainstStandard("", emptyResult, "generic-higher-ed");
    expect(a.score).toBe(0);
    expect(a.sections.every((s) => s.status === "missing")).toBe(true);
  });

  it("analyse() honours settings.syllabusStandard", () => {
    Store.db.settings.syllabusStandard = "generic-higher-ed";
    const res = analyse({
      name: "syllabus.txt",
      text: "Course Code: CS101\nLearning Outcomes: know things\nAssessment: exams\nGrading scale: A/B\nRequired readings: book\nAttendance policy: show up\nInstructor: someone",
    });
    expect(res.standard.standard).toBe("generic-higher-ed");
    expect(res.standard.standardLabel).toMatch(/generic/i);
  });
});

