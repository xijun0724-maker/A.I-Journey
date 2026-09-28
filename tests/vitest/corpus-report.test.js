/**
 * Corpus report — the measuring instrument for import accuracy work.
 *
 * Not a specification. The rules live in `import-accuracy.test.js`; this file
 * prints what the extractor currently does to the reference syllabi so each
 * slice can be compared against the last.
 *
 * Run it visible with:
 *     CORPUS_REPORT=1 npx vitest run tests/vitest/corpus-report.test.js
 *
 * It reads `tests/fixtures/syllabi/`, captured from real PNU/TEDPATH PDFs with
 * `pdftotext`. That is not the app's pdf.js extractor, so table data is absent
 * and line wrapping differs; the text the NLP layer sees is faithful.
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NLP } from "../../src/domain/nlp.js";
import { Store } from "../../src/core/store.js";

/* A student always has a term configured, and week-derived deadlines need that
   anchor. Without one the extractor correctly infers nothing, which would
   make this report read as a total regression. */
const TERM_START = "2026-01-12";

const DIR = path.resolve(process.cwd(), "tests/fixtures/syllabi");
const SHOW = !!process.env.CORPUS_REPORT;

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".txt"))
  .sort();

describe("corpus report", () => {
  beforeEach(() => {
    Store.resetAll();
    Store.db.settings.termStart = TERM_START;
  });

  it("has a term start to anchor inferred deadlines to", () => {
    expect(Store.db.settings.termStart).toBe(TERM_START);
  });

  it("analyses every reference syllabus without throwing", () => {
    files.forEach((f) => {
      const text = fs.readFileSync(path.join(DIR, f), "utf8");
      const r = NLP.analyse({ name: f, text: text });
      expect(r.meta.blocked, f + " failed to analyse").toBe(false);
    });
  });

  it("prints the current extraction", () => {
    if (!SHOW) return;
    const totals = { lessons: 0, events: 0, dated: 0, inferred: 0, readings: 0 };

    files.forEach((f) => {
      const text = fs.readFileSync(path.join(DIR, f), "utf8");
      const r = NLP.analyse({ name: f, text: text });
      const s = NLP.summary(r);
      const dated = r.events.filter((e) => e.due);
      const inferred = r.events.filter((e) => e.dueFromWeek);

      totals.lessons += r.lessons.length;
      totals.events += r.events.length;
      totals.dated += dated.length;
      totals.inferred += inferred.length;
      totals.readings += r.readings.length;

      if (!SHOW) return;

      console.log(
        [
          f.replace(/\.txt$/, "").slice(0, 42).padEnd(44),
          "L=" + String(r.lessons.length).padStart(3),
          "E=" + String(r.events.length).padStart(3),
          "dated=" + String(dated.length).padStart(3),
          "inferred=" + String(inferred.length).padStart(3),
          "R=" + String(r.readings.length).padStart(3),
          "wk=" + String(r.meta.weeks).padStart(3),
          "gr=" + String(r.pnu && r.pnu.grading ? r.pnu.grading.total : "-").padStart(3),
          "conf=" + (s.confidence * 100).toFixed(0).padStart(3),
        ].join("  "),
      );

      /* A dated event is either explicitly dated in the source, or derived
         from a week number and flagged. Anything else is a fabrication. */
      dated
        .filter((e) => !e.dueFromWeek)
        .forEach((e) => {
          console.log(
            "      EXPLICIT " + e.due.slice(0, 10) + "  " + e.title.slice(0, 64),
          );
        });
      inferred.slice(0, 3).forEach((e) => {
        console.log(
          "      w" +
            String(e.week).padEnd(2) +
            " -> " +
            e.due.slice(0, 10) +
            "  " +
            e.title.slice(0, 60),
        );
      });

      const g = r.pnu && r.pnu.grading;
      if (g) {
        console.log(
          "      GRADING " +
            (g.total == null ? "unreadable" : g.total + "%") +
            "  declared=" +
            g.declaredTotal +
            "  weights=[" +
            g.weights.join(",") +
            "]  items=[" +
            g.items
              .map((i) => i.label + " " + i.weight + "%")
              .join("; ")
              .slice(0, 150) +
            "]",
        );
      }
    });    if (SHOW) {
      console.log("\nterm start: " + TERM_START);
      console.log("TOTAL  lessons=" +
          totals.lessons +
          "  events=" +
          totals.events +
          "  dated=" +
          totals.dated +
          "  inferred=" +
          totals.inferred +
          "  readings=" +
          totals.readings,
      );
    }
  });
});
