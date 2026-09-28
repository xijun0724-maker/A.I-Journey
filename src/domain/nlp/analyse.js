/**
 * Main syllabus analysis pipeline — extracts lessons, events, and readings.
 */

import { Store } from "../../core/store.js";
import { slug } from "../../utils/helpers.js";
import { addDays, dateOnly, fromIso, iso } from "../../utils/date.js";
import {
  clean,
  isJunkLine,
  isNoise,
  isSyllabusAssessmentLine,
  sessionOf,
  stripDates,
  tableLines,
  typeOf,
  weightOf,
  weekOf,
} from "./text.js";
import { defaultDue, parseDateSmart, weekStartFrom } from "./dates.js";
import { analyseAgainstStandard, extractPnuSections } from "./standards.js";

/**
 * Analyse extracted document text.
 * -> { lessons[], events[], readings[], tables[], courseMeta, meta }
 */
export function analyse(input) {
  input = input || {};
  const text = String(input.text || "");
  const tables = (input.tables || []).filter(function (t) {
    return t && t.rows && t.rows.length;
  });
  const res = {
    lessons: [],
    events: [],
    readings: [],
    tables: tables,
    courseMeta: {},
    sourceName: input.name || "",
    meta: { weeks: 0, dates: 0, weights: 0, lines: 0, blocked: true },
  };
  const eventKeys = {};

  try {
    const lines = [];
    text
      .replace(/\r\n?/g, "\n")
      /* A bulleted run is one physical line to a PDF text extractor but
         several items to a reader: TPROFED05's entire academic calendar
         arrives as a single 460-character line holding five real deadlines.
         Split the run before any length rule sees it, or the prose guard
         throws the deadlines away. Only true bullet glyphs count - splitting
         on dashes would tear "February 16 - March 14" apart. */
      .replace(/[ \t]*[\u2022\u25cf\u25aa\u25cb\u2023\u00b7][ \t]*/g, "\n")
      .split("\n")
      .forEach(function (l) {
        l = l
          .replace(/\u00a0/g, " ")
          .replace(/\t+/g, "\t")
          .replace(/[ ]{2,}/g, " ")
          .trim();
        if (!l || isNoise(l)) return;
        lines.push(l);
      });
    res.meta.lines = lines.length;

    lines.forEach(function (line, index) {
      const courseNumber = /^course\s+(?:number|no\.?|code)\s+(.+)$/i.exec(line);
      const courseTitle = /^course\s+title\s+(.+)$/i.exec(line);
      const description = /^course\s+description\s+(.+)$/i.exec(line);
      if (courseNumber) {
        const code = clean(courseNumber[1])
          .replace(/\s*Course\s+(?:Title|Description|Pre-?requisite).*$/i, "")
          .trim();
        if (code) res.courseMeta.code = code;
      }
      if (courseTitle) {
        const title = clean(courseTitle[1])
          .replace(/\s*Course\s+(?:Description|Pre-?requisite|Number).*$/i, "")
          .trim();
        if (title) res.courseMeta.title = title;
      }
      if (description) res.courseMeta.description = clean(description[1]);
      if (
        /^session\s+(?:no\.?|course\s+intended)/i.test(line) ||
        /^instructional\s+delivery\s+design/i.test(line) ||
        /^session\s+course\s+intended\s+content/i.test(line)
      )
        res.meta.sessionTable = index;
    });

    const scanLines = lines.concat(tableLines(tables));

    let cur = { week: null, header: null, lines: [] };
    let sessionMode = false;
    const blocks = [];
    const weekSeen = {};
    lines.forEach(function (l) {
      const w = weekOf(l);
      if (
        /^session\s+(?:no\.?|course\s+intended)/i.test(l) ||
        /^instructional\s+delivery\s+design/i.test(l) ||
        /^session\s+course\s+intended\s+content/i.test(l)
      )
        sessionMode = true;
      const session = sessionMode ? sessionOf(l) : null;
      if (w !== null || session !== null) {
        if (cur.header || cur.lines.length) blocks.push(cur);
        cur = { week: w !== null ? w : session, header: l, lines: [] };
        if (w !== null || session !== null)
          weekSeen[w !== null ? "w" + w : "s" + session] = true;
      } else if (cur.header) {
        cur.lines.push(l);
      } else {
        cur.lines.push(l);
      }
    });
    if (cur.header || cur.lines.length) blocks.push(cur);
    /* Weeks detected, not week *headings*: a syllabus that numbers sessions
       repeats its heading on every page, which reported 37 weeks for a
       16-week course. */
    res.meta.weeks = Object.keys(weekSeen).length;

    /**
     * The due date for an assessment the syllabus files under a week instead of
     * dating. Syllabi overwhelmingly say "Week 8", not "20 February", so this
     * is where their real deadlines come from.
     *
     * This *infers*, it does not invent. The week number is the document's; the
     * anchor is the student's own Settings -> term start, never a date found
     * elsewhere in the file. That is exactly what `term-syllabi.js` does with
     * its session maps ("no dates are stored... the same session map serves any
     * term"), and it is the only way one syllabus fits every term. With no term
     * start there is nothing to derive from, so the event stays undated rather
     * than gaining a plausible-looking fiction.
     */
    function dueForWeek(week) {
      if (!week) return null;
      const settings = (Store.db && Store.db.settings) || {};
      const termStart = fromIso(settings.termStart);
      if (!termStart) return null;
      return defaultDue(addDays(termStart, (week - 1) * 7));
    }
    blocks.forEach(function (b) {
      const isWeekBlock = b.week !== null && b.week > 0;
      let topic = null;
      if (b.header) {
        topic = clean(
          stripDates(
            b.header
              .replace(
                /^\s*(?:week|wk|session|module|unit|lecture|class|topic|part)\s*#?\s*\d{1,2}\s*[:\-–—.]?\s*/i,
                "",
              )
              .replace(/^\s*\d{1,2}\s+/, ""),
          ),
        );
        topic = topic.replace(/^[\s:\-–—.|]+/, "").trim();
      }
      if (topic && isJunkLine(topic)) topic = null;
      if (!topic || topic.length < 4) {
        for (let i = 0; i < b.lines.length; i++) {
          const candidate = clean(stripDates(b.lines[i]));
          if (
            candidate.length > 5 &&
            !isJunkLine(b.lines[i]) &&
            !typeOf(b.lines[i]) &&
            !parseDateSmart(b.lines[i])
          ) {
            topic = candidate;
            break;
          }
        }
      }
      let start = null;
      if (b.header) start = weekStartFrom(b.header);
      for (let j = 0; j < b.lines.length && !start; j++)
        start = weekStartFrom(b.lines[j]);
      let weekDerived = false;
      if (!start && isWeekBlock) {
        const settings = (Store.db && Store.db.settings) || {};
        const termStart = fromIso(settings.termStart);
        if (termStart) {
          start = addDays(termStart, (b.week - 1) * 7);
          weekDerived = true;
        }
      }
      if (start && !weekDerived) res.meta.dates++;
      if (isWeekBlock) {
        if (topic) {
          res.lessons.push({
            week: b.week,
            topic: topic,
            start: start ? dateOnly(start) : null,
            weekDerived: weekDerived,
            raw: b.header || topic,
          });
        }
      } else if (
        topic &&
        topic.length > 3 &&
        !typeOf(topic) &&
        !parseDateSmart(topic)
      ) {
        res.lessons.push({
          week: null,
          topic: topic,
          start: start ? dateOnly(start) : null,
          weekDerived: weekDerived,
          raw: topic,
        });
      }

      b.lines.forEach(function (line) {
        if (isJunkLine(line)) return;
        const t = typeOf(line);
        if (t === "reading") {
          const c = clean(stripDates(line));
          if (c.length > 3)
            res.readings.push({
              title: c,
              source: "",
              week: b.week || null,
              pages: "",
              optional: /\boptional\b/i.test(line),
            });
        }
        const d = parseDateSmart(line);
        if (!t || t === "reading") return;
        /* A dated line is a deadline. An undated assessment line inside a
           numbered week is a deadline the syllabus expressed as a week, which
           is the common case. Anything else is not a task. */
        if (!d && !(isWeekBlock && isSyllabusAssessmentLine(line))) return;
        const title = clean(stripDates(line));
        if (!title || title.length < 3) return;
        const w = weightOf(line);
        const due = d ? d : dueForWeek(b.week);
        const key = slug(title) + "|" + (d ? dateOnly(d) : "w" + b.week);
        if (eventKeys[key]) return;
        eventKeys[key] = 1;
        res.meta.weights += w ? 1 : 0;
        res.events.push({
          title: title,
          type: t,
          due: due ? iso(due) : null,
          dueFromWeek: !d && !!due,
          weight: w ? w.weight || null : null,
          points: w ? w.points || null : null,
          week: b.week || null,
          confidence: d ? 0.9 : 0.5,
        });
      });
    });

    // Fallback: line-by-line scan for events not inside week blocks
    if (!res.events.length && !res.lessons.length) {
      scanLines.forEach(function (line) {
        if (isJunkLine(line)) return;
        const t = typeOf(line);
        const d = parseDateSmart(line);
        if (t && d) {
          const title = clean(stripDates(line));
          if (!title || title.length < 3) return;
          const w = weightOf(line);
          const key = slug(title) + "|" + dateOnly(d);
          if (eventKeys[key]) return;
          eventKeys[key] = 1;
          res.events.push({
            title: title,
            type: t,
            due: iso(d),
            weight: w ? w.weight || null : null,
            points: w ? w.points || null : null,
            week: null,
            confidence: 0.7,
          });
        }
      });
    }

    // Syllabi frequently list assessments without dates. Keep those as
    // undated tasks so the planner, task list, and tutor can still use them.
    scanLines.forEach(function (line) {
      if (isJunkLine(line)) return;
      if (!isSyllabusAssessmentLine(line)) return;
      const t = typeOf(line);
      if (!t || t === "reading") return;
      const title = clean(stripDates(line));
      if (!title || title.length < 4) return;
      const w = weightOf(line);
      const week = weekOf(line);
      const due = dueForWeek(week);
      const key = slug(title) + "|" + (due ? dateOnly(due) : "undated");
      if (eventKeys[key]) return;
      eventKeys[key] = 1;
      res.meta.weights += w ? 1 : 0;
      res.events.push({
        title: title,
        type: t,
        due: due ? iso(due) : null,
        dueFromWeek: !!due,
        weight: w ? w.weight || null : null,
        points: w ? w.points || null : null,
        week: week,
        confidence: 0.65,
        source: "syllabus requirement",
      });
    });

    const eventTitles = {};
    res.events = res.events.filter(function (event) {
      const key = slug(event.title);
      if (!key || !eventTitles[key]) {
        eventTitles[key] = event;
        return true;
      }
      if (!eventTitles[key].due && event.due) eventTitles[key] = event;
      return false;
    });

    // Remove repeated references caused by multi-page PDF extraction while
    // preserving the first occurrence and its week assignment.
    const readingKeys = {};
    res.readings = res.readings.filter(function (reading) {
      const key = slug(reading.title);
      if (!key || readingKeys[key]) return false;
      readingKeys[key] = true;
      return true;
    });

    res.meta.blocked = false;
    res.pnu = extractPnuSections(text, lines, res);
    res.standard = analyseAgainstStandard(
      text,
      res,
      Store.db && Store.db.settings ? Store.db.settings.syllabusStandard : null,
    );
  } catch (_e) {
    res.meta.blocked = true;
    res.meta.error = true;
  }
  return res;
}
