/**
 * Import accuracy — slice 1: date provenance and junk rejection.
 *
 * The corpus in `tests/fixtures/syllabi/` is real PNU/TEDPATH syllabus text.
 * It was captured with `pdftotext`, not the app's pdf.js extractor, so line
 * wrapping and tables differ slightly from an in-app import. What it does
 * reproduce faithfully is the *text* the NLP layer sees, which is where every
 * failure asserted below actually lives.
 *
 * The rules under test, decided in the import-accuracy grilling:
 *   - The extractor must never invent a date the document does not state.
 *   - Citations, policy prose and running headers are not assessments.
 * Nothing here asserts an exact count of extracted items: the corpus is the
 * benchmark for *classes* of correctness, not for a golden diff.
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NLP } from "../../src/domain/nlp.js";
import { parseDateSmart } from "../../src/domain/nlp/dates.js";
import { Store } from "../../src/core/store.js";
import { fromIso } from "../../src/utils/date.js";

const FIXTURES = path.resolve(process.cwd(), "tests/fixtures/syllabi");

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

const CORPORA = fs
  .readdirSync(FIXTURES)
  .filter((f) => f.endsWith(".txt"))
  .sort();

/* Independent detectors, deliberately not imported from the implementation —
   a test that reuses the code under test proves nothing. */
const CITATION =
  /\(\d{4}[a-z]?\)|\bet al\.,|\b(?:see|in)\s+[A-Z][a-z]+,\s+[A-Z]\./;
const RUNNING_HEADER =
  /^(?:teacher education pathways|obe course|ucm obe course|pnu philosophy|course syllabus|syllabus form)\b/i;
const MAX_TITLE = 200;

describe("date provenance: no date the document did not state", () => {
  /* Every string below contains a bare month fragment and no day of month.
     The old parser matched month names with no word boundary, so "Summary"
     hit "mar", "decisions" hit "dec" and "maybe" hit "may" — each becoming a
     confident deadline on the 1st. A date needs an explicit day. */
  const NOT_DATES = [
    "Summary",
    "Lecture-Discussion and Summary on Historical Foundations of Education",
    "Grammar & Presentation",
    "maybe",
    "separate",
    "The decision",
    "Decision making",
    "Marketing plan",
    "Augustine",
    "December",
    "March 2026",
    "AY 2025-2026",
    "Teacher Education Pathways Syllabus",
  ];

  it.each(NOT_DATES)("does not read a date out of %j", (line) => {
    expect(parseDateSmart(line)).toBeNull();
  });

  const REAL_DATES = [
    ["Final Examination December 15, 2026", 11, 15],
    ["Midterm on Nov 8", 10, 8],
    ["Due: 2026-03-10", 2, 10],
    ["Submission 15 September 2026", 8, 15],
  ];

  it.each(REAL_DATES)(
    "still reads the real date in %j",
    (line, month, day) => {
      const d = parseDateSmart(line);
      expect(d).not.toBeNull();
      expect(d.getMonth()).toBe(month);
      expect(d.getDate()).toBe(day);
    },
  );
});

describe("citations and prose never become tasks", () => {
  it("ignores a bibliography entry that carries a year", () => {
    const line =
      "Musa, S., and Ziatdinov, R. (2012). Features and historical aspects of the Philippines educational system.";
    expect(CITATION.test(line)).toBe(true);
    const result = NLP.analyse({ name: "refs.txt", text: line });
    expect(result.events).toHaveLength(0);
    expect(result.lessons).toHaveLength(0);
  });

  it("ignores a multi-sentence course description", () => {
    const prose = fixture("TPROFED01 Course Syllabus - Areta.txt");
    const description = prose
      .split("\n")
      .find((l) => l.length > 400 && /course introduces/i.test(l));
    expect(description, "corpus no longer holds the description line").toBeTruthy();
    const result = NLP.analyse({ name: "desc.txt", text: description });
    expect(result.events).toHaveLength(0);
  });

  it("ignores a running header instead of making it a lesson", () => {
    const result = NLP.analyse({
      name: "header.txt",
      text: "TEACHER EDUCATION PATHWAYS SYLLABUS\n1 Course Orientation",
    });
    const boilerplate = result.lessons.filter((l) =>
      RUNNING_HEADER.test(l.topic),
    );
    expect(boilerplate).toHaveLength(0);
  });
});

describe("the real corpus stays clean", () => {
  it.each(CORPORA)("%s produces no citation, header or wall of text", (file) => {
    const result = NLP.analyse({ name: file, text: fixture(file) });

    result.events.forEach((e) => {
      expect(CITATION.test(e.title), "citation event: " + e.title).toBe(false);
      expect(RUNNING_HEADER.test(e.title), "header event: " + e.title).toBe(
        false,
      );
      expect(e.title.length, "wall of text: " + e.title).toBeLessThanOrEqual(
        MAX_TITLE,
      );
    });

    result.lessons.forEach((l) => {
      expect(RUNNING_HEADER.test(l.topic), "header lesson: " + l.topic).toBe(
        false,
      );
      expect(l.topic.length, "wall of text: " + l.topic).toBeLessThanOrEqual(
        MAX_TITLE,
      );
    });
  });

  it.each(CORPORA)("%s keeps every extracted week plausible", (file) => {
    const result = NLP.analyse({ name: file, text: fixture(file) });
    /* Term-length courses run about 12-18 weeks. The old parser reported
       week 16, week 35 and "05 4 / 10" from body text. */
    result.lessons
      .filter((l) => l.week != null)
      .forEach((l) => {
        expect(l.week, file + " week " + l.week).toBeGreaterThanOrEqual(1);
        expect(l.week, file + " week " + l.week).toBeLessThanOrEqual(24);
      });
  });
});

describe("weeks are counted from real week headings, not from every line", () => {
  it("does not report 37 weeks for a 16-week course", () => {
    const file = "TedPaths Syllabus_TCW_Term 1 AY 2024-2025.docx.txt";
    const result = NLP.analyse({ name: file, text: fixture(file) });
    expect(result.meta.weeks).toBeLessThanOrEqual(24);
  });
});

describe("week-numbered assessments get inferred deadlines", () => {
  /* 12 January 2026 is a Monday, the first day of classes named in TPROFED05. */
  const TERM_START = "2026-01-12";

  beforeEach(() => {
    Store.resetAll();
    Store.db.settings.termStart = TERM_START;
  });

  it("dates a week-numbered assessment from the term start", () => {
    const result = NLP.analyse({
      name: "syllabus.pdf",
      text: [
        "Week 6: Assessment and Evaluation",
        "Midterm Examination",
        "",
        "Week 9: Capstone",
        "Capstone Project submission",
      ].join("\n"),
    });
    const midterm = result.events.find((e) => /midterm/i.test(e.title));
    expect(midterm, "the midterm was not detected").toBeTruthy();
    expect(midterm.dueFromWeek).toBe(true);
    expect(midterm.week).toBe(6);
    /* Week 6 starts 2026-01-12 + 35 days = 2026-02-16; the default due is the
       Friday of that week, 2026-02-20, at 23:59. */
    expect(midterm.due.slice(0, 10)).toBe("2026-02-20");
    expect(midterm.due.slice(11, 16)).toBe("23:59");
  });

  it("ignores a date found elsewhere in the week", () => {
    /* A stray document date must not become the anchor: a 2021 line in the
       body dragged every assessment in that week back five years. */
    const result = NLP.analyse({
      name: "syllabus.pdf",
      text: [
        "Week 6: Assessment and Evaluation",
        "Midterm Examination",
        "Terms and conditions last updated January 4, 2021",
      ].join("\n"),
    });
    const midterm = result.events.find((e) => /midterm/i.test(e.title));
    expect(midterm.due.slice(0, 10)).toBe("2026-02-20");
  });

  it("leaves an explicitly dated assessment on its own date", () => {
    const result = NLP.analyse({
      name: "syllabus.pdf",
      text: "Week 6: Assessment\nMidterm Examination - March 3, 2026",
    });
    const midterm = result.events.find((e) => /midterm/i.test(e.title));
    expect(midterm.due.slice(0, 10)).toBe("2026-03-03");
    expect(midterm.dueFromWeek).toBe(false);
  });

  it("infers nothing when the term start is unknown", () => {
    Store.db.settings.termStart = "";
    const result = NLP.analyse({
      name: "syllabus.pdf",
      text: "Week 6: Assessment and Evaluation\nMidterm Examination",
    });
    const midterm = result.events.find((e) => /midterm/i.test(e.title));
    expect(midterm, "the midterm should still be found").toBeTruthy();
    expect(midterm.due).toBeNull();
    expect(midterm.dueFromWeek).toBe(false);
  });

  /* An inferred deadline is anchored to the document's own week date when it
     names one, and to the configured term start when it does not - the same
     rule lessons already follow. It is never anchored to nothing. */
  it.each(CORPORA)("%s marks every inferred deadline with its week", (file) => {
    const result = NLP.analyse({ name: file, text: fixture(file) });
    result.events
      .filter((e) => e.dueFromWeek)
      .forEach((e) => {
        expect(e.due, "inferred without a date: " + e.title).toBeTruthy();
        expect(e.week, "inferred without a week: " + e.title).toBeTruthy();
        expect(e.week).toBeGreaterThanOrEqual(1);
        expect(e.week).toBeLessThanOrEqual(20);
        /* defaultDue() files a week's work on its final evening. */
        expect(e.due.slice(11, 16), e.title).toBe("23:59");
      });
  });

  it("infers deadlines across the corpus", () => {
    const total = CORPORA.reduce((sum, file) => {
      const r = NLP.analyse({ name: file, text: fixture(file) });
      return sum + r.events.filter((e) => e.dueFromWeek).length;
    }, 0);
    expect(total).toBeGreaterThan(0);
  });

  /* The guarantee that makes inference honest: the week numbers are the
     document's, the anchor is the student's. Take the anchor away and not one
     date survives, rather than a plausible-looking fiction. */
  it("infers nothing anywhere without a term start", () => {
    Store.db.settings.termStart = "";
    CORPORA.forEach((file) => {
      const r = NLP.analyse({ name: file, text: fixture(file) });
      expect(
        r.events.filter((e) => e.dueFromWeek).length,
        file + " inferred a date with no term start",
      ).toBe(0);
    });
  });
});

describe("the grading breakdown is never an impossible number", () => {
  it("reads a flattened weights column as weights, not as one item", () => {
    /* TGED04's grading table arrives as label rows, then "Weight 30% 20% 20%
       10%", then "20% 100%". The real breakdown is 30/20/20/10/20 and the
       document's own TOTAL cell is the 100. The old parser read the last
       number on the second line as an assessment and reported 110%. */
    const result = NLP.analyse({
      name: "ethics.pdf",
      text: [
        "Grading System",
        "Component Capstone Project LMS Activities Completion Final Exam Individual Outputs Class Participation",
        "Total",
        "Weight 30% 20% 20% 10%",
        "20% 100%",
      ].join("\n"),
    });
    expect(result.pnu.grading.total).toBe(100);
    expect(result.pnu.grading.valid).toBe(true);
    expect(result.pnu.grading.declaredTotal).toBe(100);
  });

  it("keeps named rows as items and drops leftover cells", () => {
    const result = NLP.analyse({
      name: "syllabus.pdf",
      text: [
        "Course Requirements",
        "Topic Facilitation 15%",
        "e-Portfolio 10%",
        "75%",
      ].join("\n"),
    });
    const labels = result.pnu.grading.items.map((i) => i.label);
    expect(labels).toEqual(["Topic Facilitation", "e-Portfolio"]);
    /* The unnamed 75% is the flattened weight of a row whose label did not
       survive extraction: it still counts towards the total, it just cannot
       be listed as a named requirement. */
    expect(result.pnu.grading.total).toBe(100);
  });

  it("shows no total when the table cannot be read", () => {
    const result = NLP.analyse({
      name: "troubleshooting.pdf",
      text: [
        "Course Requirements",
        "Requirements Assignment (Group facilitation) • Discussion component: 20% • Hands-on demonstration: 80%",
        "Assessments (Quiz, Final Exam) Final Demonstration Class Engagement and Attendance TOTAL",
        "Percentage 30%",
        "20% 30% 20% 100%",
      ].join("\n"),
    });
    expect(result.pnu.grading.valid).toBe(false);
    expect(result.pnu.grading.total).toBeNull();
  });

  it.each(CORPORA)("%s reports no impossible total", (file) => {
    const result = NLP.analyse({ name: file, text: fixture(file) });
    const total = result.pnu.grading.total;
    if (total == null) {
      expect(result.pnu.grading.valid).toBe(false);
      return;
    }
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(100);
  });

  it("does not list rubric text or passing thresholds as requirements", () => {
    /* Everything below ends in a percentage and was previously listed as a
       course requirement. None of it is one. */
    const result = NLP.analyse({
      name: "syllabus.pdf",
      text: [
        "Course Requirements",
        "Topic Facilitation 15%",
        "At least accomplishment of the required forum posts 75%",
        "Obtain scores or higher in the graded activities 85%",
        "❖ Content -- Unity, consistency of giving evidences and elaboration 50%",
        "Class Attendance & Participation Regular attendance, as specified by the instructor, is expected of all students. Extended absence detracts from a student's grade 30%",
      ].join("\n"),
    });
    expect(result.pnu.grading.items.map((i) => i.label)).toEqual([
      "Topic Facilitation",
    ]);
  });

  /* The review screen shows two grading panels. They read the same document and
     used to compute their totals independently, so they could disagree - one
     saying "not read reliably" while the other asserted 200%. */
  it.each(CORPORA)("%s agrees with itself across both panels", (file) => {
    const result = NLP.analyse({ name: file, text: fixture(file) });
    expect(result.standard.grading.total).toBe(result.pnu.grading.total);
    if (result.standard.grading.total == null) {
      expect(result.standard.grading.valid).toBe(false);
    }
  });
});
