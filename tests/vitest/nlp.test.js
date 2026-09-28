import { describe, it, expect } from "vitest";
import * as text from "../../src/domain/nlp/text.js";
import { analyse } from "../../src/domain/nlp/analyse.js";

const NLP = { ...text, analyse };

describe("NLP.typeOf", () => {
  it("detects project type", () => {
    expect(NLP.typeOf("Final Project Due")).toBe("project");
    expect(NLP.typeOf("Capstone Presentation")).toBe("project");
  });

  it("detects exam type", () => {
    expect(NLP.typeOf("Midterm Exam")).toBe("exam");
    expect(NLP.typeOf("Final Exam")).toBe("exam");
  });

  it("detects quiz type", () => {
    expect(NLP.typeOf("Quiz 3")).toBe("quiz");
    expect(NLP.typeOf("Weekly Quizzes")).toBe("quiz");
  });

  it("detects presentation type", () => {
    expect(NLP.typeOf("Oral Presentation")).toBe("presentation");
    expect(NLP.typeOf("Defense Day")).toBe("presentation");
  });

  it("detects lab type", () => {
    expect(NLP.typeOf("Lab Experiment 2")).toBe("lab");
    expect(NLP.typeOf("Laboratory Work")).toBe("lab");
  });

  it("detects assignment type", () => {
    expect(NLP.typeOf("Homework 1")).toBe("assignment");
    expect(NLP.typeOf("Paper Due")).toBe("assignment");
    expect(NLP.typeOf("Problem Set 3")).toBe("assignment");
  });

  it("detects reading type", () => {
    expect(NLP.typeOf("Chapter 5 Reading")).toBe("reading");
    expect(NLP.typeOf("Article Review")).toBe("reading");
  });

  it("returns null for unknown type", () => {
    expect(NLP.typeOf("Random text")).toBeNull();
  });
});

describe("NLP.weekOf", () => {
  it("extracts week number", () => {
    expect(NLP.weekOf("Week 3: Introduction")).toBe(3);
    expect(NLP.weekOf("wk 5 homework")).toBe(5);
    expect(NLP.weekOf("Module 12")).toBe(12);
  });

  it("returns null for no week", () => {
    expect(NLP.weekOf("No week mentioned")).toBeNull();
  });
});

describe("NLP syllabus requirements", () => {
  it("keeps undated exams and deliverables as planner events", () => {
    const result = NLP.analyse({
      name: "syllabus.pdf",
      text: "Session No./ Duration\n1 Learning environment\n6 MIDTERM EXAMINATION/ WELLNESS BREAK\n12 Final submission of LEMP\n1. Whole class discussion\n2. Accomplish Worksheet #1",
    });
    expect(result.events.some((event) => /midterm/i.test(event.title))).toBe(
      true,
    );
    expect(result.events.some((event) => /lemp/i.test(event.title))).toBe(true);
    expect(result.events.some((event) => /worksheet/i.test(event.title))).toBe(
      true,
    );
    expect(result.lessons.filter((lesson) => lesson.week === 1)).toHaveLength(
      1,
    );
  });

  it("extracts the complete course requirements breakdown", () => {
    const result = NLP.analyse({
      name: "pnu-syllabus.pdf",
      text: [
        "Course Requirements",
        "Formative Assessment Accomplished Worksheets, 15%",
        "Topic Facilitation 15%",
        "Discussion Responses, Small Group Activity/ Attendance (Online & F2F) 10%",
        "Summative Assessment Final Examinations 25%",
        "Presentation/ Critique and Final Learning Environment Management Plan 25%",
        "e-Portfolio 10%",
        "TOTAL 100%",
      ].join("\n"),
    });
    expect(result.pnu.courseRequirements).toEqual([
      { name: "Accomplished Worksheets", weight: 15 },
      { name: "Topic Facilitation", weight: 15 },
      {
        name: "Discussion Responses, Small Group Activity/ Attendance (Online & F2F)",
        weight: 10,
      },
      { name: "Final Examinations", weight: 25 },
      {
        name: "Presentation/ Critique and Final Learning Environment Management Plan",
        weight: 25,
      },
      { name: "e-Portfolio", weight: 10 },
    ]);
    expect(result.pnu.grading.total).toBe(100);
  });
});

describe("NLP PNU syllabus fields", () => {
  it("extracts labeled course metadata and session rows", () => {
    const result = NLP.analyse({
      name: "TPPROFED05 syllabus.pdf",
      text: "Course Number TPROFED05\nCourse Title Managing the Learning Environment\nSession No./ Duration\n1 Demonstrate understanding of the nature and components of a learning environment.\n2 Emerging Concepts and Types of Learning Environment",
    });
    expect(result.courseMeta.code).toBe("TPROFED05");
    expect(result.courseMeta.title).toBe("Managing the Learning Environment");
    expect(result.lessons.some((lesson) => lesson.week === 1)).toBe(true);
    expect(result.lessons.some((lesson) => lesson.week === 2)).toBe(true);
  });

  it("scores PNU sections and validates grading totals", () => {
    const result = NLP.analyse({
      name: "PNU syllabus.pdf",
      text: [
        "PNU Philosophy\nPNU Vision\nPNU Mission\nPNU Quality Policy",
        "Course Number TPROFED05\nCourse Title Managing the Learning Environment\nCourse Description A course",
        "Program Outcomes\nApply educational theories critically\nInstitutional Outcomes\nDigitally literate decision maker\nPPST Domain 2\nCourse Intended Learning Outcomes\nDesign positive learning environments",
        "GEDI Themes\nGender Equality\nGCED Themes\nCulture and Intercultural Relations",
        "Session No./ Duration\n1 Learning environment\n2 Content management\n3 Conduct management",
        "Assessment\nEvidence of Performance\nPerformance Standard\nRubric",
        "Grading System\nFormative Assessment 40%\nSummative Assessment 50%\nTOTAL 100%",
        "Required Readings\nCourse References and Learning Resources\nSupplementary References",
        "Course Policies\nInclusive learning\nClass Policies\nRespectful behavior\nCourse Expectations\nRead guidelines and submit outputs",
        "Prepared by\nReviewed by\nApproved by",
      ].join("\n"),
    });
    expect(result.standard.score).toBe(100);
    expect(result.standard.grading.total).toBe(90);
    expect(result.standard.grading.valid).toBe(false);
    expect(result.standard.findings[0]).toContain("not 100%");
    expect(result.pnu.course.code).toBe("TPROFED05");
    expect(result.pnu.course.title).toBe("Managing the Learning Environment");
    expect(
      result.pnu.institutional.institutionalOutcomes.length,
    ).toBeGreaterThan(0);
    expect(result.pnu.outcomes.courseIntended.length).toBeGreaterThan(0);
    expect(result.pnu.themes.gedi).toContain("Gender Equality");
    expect(
      result.lessons.filter((lesson) => lesson.week != null),
    ).toHaveLength(3);
    expect(result.pnu.grading.items).toHaveLength(2);
    expect(result.pnu.policies.expectations.length).toBeGreaterThan(0);
  });
});

describe("NLP.isNoise", () => {
  it("rejects empty/too short strings", () => {
    expect(NLP.isNoise("")).toBe(true);
    expect(NLP.isNoise("ab")).toBe(true);
  });

  it("rejects pure numeric/symbol lines", () => {
    expect(NLP.isNoise("12345")).toBe(true);
    expect(NLP.isNoise("---")).toBe(true);
  });

  it("rejects URLs", () => {
    expect(NLP.isNoise("https://example.com")).toBe(true);
  });

  it("rejects page references", () => {
    expect(NLP.isNoise("Page 15")).toBe(true);
  });

  it("rejects table of contents", () => {
    expect(NLP.isNoise("Table of Contents")).toBe(true);
  });

  it("accepts normal text", () => {
    expect(NLP.isNoise("Assignment 1 due")).toBe(false);
  });
});

describe("NLP.clean", () => {
  it("strips leading bullet characters", () => {
    expect(NLP.clean("- Hello")).toBe("Hello");
    expect(NLP.clean("* Hello")).toBe("Hello");
    expect(NLP.clean("• Hello")).toBe("Hello");
  });

  it("collapses whitespace", () => {
    expect(NLP.clean("  too   many   spaces  ")).toBe("too many spaces");
  });

  it("strips trailing punctuation", () => {
    expect(NLP.clean("Hello:")).toBe("Hello");
    expect(NLP.clean("Hello,")).toBe("Hello");
  });
});

describe("NLP.stripDates", () => {
  it('removes "due" prefix', () => {
    const result = NLP.stripDates("Due: Homework 1");
    expect(result).not.toContain("Due");
  });

  it("removes date strings", () => {
    const result = NLP.stripDates("2026-09-15 Assignment");
    expect(result).not.toContain("2026");
  });

  it("removes month dates", () => {
    const result = NLP.stripDates("Sep 15 Assignment");
    expect(result).not.toContain("Sep");
  });

  it("removes percentage weights", () => {
    const result = NLP.stripDates("Homework 15%");
    expect(result).not.toContain("15%");
  });

  it("removes point values", () => {
    const result = NLP.stripDates("Assignment 100 points");
    expect(result).not.toContain("100 points");
  });
});

describe("NLP.weightOf", () => {
  it("extracts percentage weight", () => {
    const result = NLP.weightOf("Final Exam (25%)");
    expect(result).toEqual({ weight: 25, unit: "%" });
  });

  it("extracts points weight", () => {
    const result = NLP.weightOf("Homework (100 points)");
    expect(result).toEqual({ points: 100, unit: "points" });
  });

  it("returns null for no weight", () => {
    expect(NLP.weightOf("No weight here")).toBeNull();
  });
});

describe("NLP.looksLikeReading", () => {
  it("detects reading keywords", () => {
    expect(NLP.looksLikeReading("Read Chapter 5")).toBe(true);
    expect(NLP.looksLikeReading("Reading pp. 100-120")).toBe(true);
    expect(NLP.looksLikeReading("Textbook article")).toBe(true);
    expect(NLP.looksLikeReading("Skim the handout")).toBe(true);
  });

  it("rejects non-reading text", () => {
    expect(NLP.looksLikeReading("Submit homework")).toBe(false);
  });
});
