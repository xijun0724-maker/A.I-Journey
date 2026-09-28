/**
 * Text helpers for syllabus NLP — pure functions with no store/date coupling
 * beyond the shared date-format regexes.
 */

import { MONTH_FIRST_G, DAY_FIRST_G } from "../../utils/date.js";

/** Assessment keyword -> task type. Order matters (specific before generic). */
export const TYPE_RULES = [
  {
    type: "project",
    re: /\b(project|capstone|final deliverable|implementation|prototype|toolkit|lemp|learning environment management plan)\b/i,
  },
  {
    type: "exam",
    // Plural forms matter: "Final Examinations - April 13-17, 2026" is how
    // the reference syllabi announce the one deadline they actually date.
    re: /\b(midterm|mid-?term exams?|final exams?|finals|examinations?|exams?)\b/i,
  },
  { type: "quiz", re: /\b(quiz|quizzes)\b/i },
  {
    type: "presentation",
    re: /\b(presentation|present(?:ation)?|defense|demo day|oral report|pitch)\b/i,
  },
  { type: "lab", re: /\b(lab|laboratory|experiment)\b/i },
  {
    type: "assignment",
    re: /\b(assignment|homework|hw\s?\d|problem set|pset|paper|essay|report|write-?up|response|reflection|journal|portfolio|draft|proposal|case study|literature review|exercise|worksheet|submission|deliverable)\b/i,
  },
  {
    type: "reading",
    re: /\b(reading|readings|read|chapter|ch\.|textbook|article|handout|reading packet|pp\.)\b/i,
  },
];

export const WEEK_RE =
  /\b(?:week|wk|session|module|unit|lecture|class|topic|part)\s*#?\s*(\d{1,2})\b/i;
export const SESSION_ROW_RE = /^\s*(\d{1,2})\s+(.*)$/;
export const NOISE_RE = /^[\d\s\-–—().:+]+$|@|\bhttps?:\/\/|\bwww\./i;

export function typeOf(line) {
  for (let i = 0; i < TYPE_RULES.length; i++) {
    if (TYPE_RULES[i].re.test(line)) return TYPE_RULES[i].type;
  }
  return null;
}

export function weekOf(line) {
  const m = WEEK_RE.exec(line);
  if (!m) return null;
  const idx = m.index;
  if (
    idx > 24 &&
    !/[:\-–—]/.test(line.slice(idx + m[0].length, idx + m[0].length + 2))
  )
    return null;
  const n = parseInt(m[1], 10);
  // A term-length syllabus has no week past 20. "Week 35" in a source
  // document is a typo or a misread, and a lesson filed under it would put
  // the roadmap months past the end of term. sessionOf() caps at 20 too.
  if (n < 1 || n > 20) return null;
  return n;
}

export function sessionOf(line) {
  const m = SESSION_ROW_RE.exec(String(line || ""));
  if (!m) return null;
  if (/^\s*\d{1,2}\s*[.)]/.test(String(line || ""))) return null;
  const number = parseInt(m[1], 10);
  if (number < 0 || number > 20 || !m[2].trim()) return null;
  return number;
}

/** PNU institutional header stamps repeated on every TEDPATH PDF page. */
const PNU_STAMP_RE =
  /^(?:Reference\s+No\.?\s+PNU|Issue\s+No\.?\s*\d|Rev(?:ision)?\.?\s+No\.?\s*\d|Taft\s+Ave\.|Trunkline:\s*\+|(?:CMI\s+TEACHER\s+EDUCATION\s+PATHWAYS|UCM\s+OBE\s+COURSE)\s+SYLLABUS|Page\s+\d+\s*\/|\(All\s+documents\s+without|DC\s+No\.\s+CC\d)/i;

export function isNoise(line) {
  const s = String(line || "").trim();
  if (!s || s.length < 3) return true;
  if (NOISE_RE.test(s)) return true;
  if (/^(page|pg)\.?\s*\d+/i.test(s)) return true;
  if (/^(table of contents|contents|syllabus|course syllabus)$/i.test(s))
    return true;
  if (PNU_STAMP_RE.test(s)) return true;
  return false;
}

export function clean(s) {
  return String(s == null ? "" : s)
    .replace(/^[\s•●▪○‣·*\-–—>|]+/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[:;,]+\s*$/, "")
    .trim();
}

export function stripDates(s) {
  let out = String(s || "");
  out = out.replace(
    /\b(?:due|deadline|submit(?:ted)?|submission|posted|by)\b\s*[:_-]?/gi,
    " ",
  );
  out = out.replace(
    /^\s*(?:week|wk|session|module|unit|lecture|class|part)\s*#?\s*\d{1,2}\s*[:\-\u2013\u2014.]?\s*/i,
    " ",
  );
  out = out.replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, " ");
  out = out.replace(/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, " ");
  out = out.replace(MONTH_FIRST_G, " ");
  out = out.replace(DAY_FIRST_G, " ");
  out = out.replace(
    /\b(?:mon|tues?|wed(?:nes)?|thur?s?|fri|sat(?:ur)?|sun)(?:day)?\.?\b/gi,
    " ",
  );
  out = out.replace(/\b(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, " ");
  out = out.replace(/\b\d{1,3}(?:\.\d+)?\s*%/g, " ");
  out = out.replace(/\b\d{1,4}\s*(?:points|pts|marks)\b/gi, " ");
  out = out.replace(/[\u2013\u2014]/g, "-");
  out = out.replace(/\s*[-–—|]+\s*$/g, "").replace(/^\s*[-–—|]+\s*/g, "");
  out = out.replace(/\s*\(\s*\)/g, " ").replace(/\s*\[\s*\]/g, " ");
  out = out.replace(/\s{2,}/g, " ");
  for (let guard = 0; guard < 3; guard++) {
    out = out.replace(
      /\s+\b(?:on|at|by|for|to|of|in|and|or|the|is|are|was|due|week|day|noon|midnight)\b\.?\s*$/i,
      "",
    );
  }
  return clean(out);
}

export function weightOf(line) {
  // PNU grade-point-scale rows look like "98 - 100   1.00   Excellent" —
  // these are not assessment weights; skip them.
  if (/\b\d{2,3}\s*[-–]\s*\d{2,3}(?:\.\d+)?\s+\d+\.\d{2}\b/.test(line)) return null;
  if (/\b(?:grade\s+in\s+percent|grade\s+point\s+scale|adjectival\s+description)\b/i.test(line)) return null;
  let m = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(line);
  if (m) return { weight: parseFloat(m[1]), unit: "%" };
  m = /\b(\d{1,4})\s*(?:points|pts|marks)\b/i.exec(line);
  if (m) return { points: parseInt(m[1], 10), unit: "points" };
  return null;
}

export function looksLikeReading(line) {
  return /\b(chapter|ch\.|read(?:ing|ings)?|pp\.|pages?|textbook|handout|article|packet|worksheet|skim|review the)\b/i.test(
    line,
  );
}

export function isSyllabusAssessmentLine(line) {
  const value = String(line || "");
  if (value.length < 4 || value.length > 220) return false;
  if (
    /^(?:assessment|course requirements|performance criteria|focus on|rubric)$/i.test(
      value,
    )
  )
    return false;
  return /\b(?:midterm|mid-?term|final exam(?:ination)?|exam(?:ination)?|quiz(?:zes)?|assignment|presentation|portfolio|worksheet|discussion question|lemp|learning environment management plan|submission|project|rubric|reflection|journal|report)\b/i.test(
    value,
  );
}

/**
 * Content that must never become a task or a topic.
 *
 * Three shapes, all of them present in the reference syllabi:
 *   - a bibliography entry. Every citation carries a parenthesised year, and
 *     nothing else in a syllabus parenthesises a bare year, so `(2012)` is a
 *     reliable marker; the initials form catches the rest.
 *   - a running header or cover stamp, repeated on every page.
 *   - a paragraph of prose, which describes the course rather than asking for
 *     anything.
 *
 * Applied only where tasks and topics are harvested, never to the document
 * text itself: the tutor still indexes and quotes every line.
 */
const CITATION_RE =
  /\(\d{4}[a-z]?\)|\bet\s+al\.,?|\b[A-Z][A-Za-z'\u2019.-]+,\s+(?:[A-Z]\.\s*){1,3}(?:,|&|\band\b)/;
const RUNNING_HEADER_RE =
  /^(?:teacher\s+education\s+pathways|obe\s+course|ucm\s+obe\s+course|pnu\s+philosophy|course\s+syllabus)\b/i;
const PROSE_LIMIT = 200;

export function isJunkLine(line) {
  // Test the cleaned form, not the raw line: a bullet or a stray space in
  // front of "Course syllabus" would otherwise slip past an anchored match,
  // while `clean()` — which is what the title is built from — strips it.
  const s = clean(line);
  if (!s) return true;
  if (CITATION_RE.test(s)) return true;
  if (RUNNING_HEADER_RE.test(s)) return true;
  if (s.length > PROSE_LIMIT) return true;
  return false;
}

export function uniqueCleanLines(lines, limit) {
  const seen = {};
  const out = [];
  (lines || []).forEach(function (line) {
    const value = clean(line);
    if (value.length < 3 || seen[value.toLowerCase()]) return;
    seen[value.toLowerCase()] = true;
    out.push(value);
  });
  return limit ? out.slice(0, limit) : out;
}

export function tableLines(tables) {
  const out = [];
  (tables || []).forEach(function (t) {
    if (t.header) out.push(t.header.join(" | "));
    (t.rows || []).forEach(function (r) {
      const joined = r
        .map(function (c) {
          return c || "";
        })
        .join(" | ");
      if (joined.replace(/[\s|]/g, "")) out.push(joined);
    });
  });
  return out;
}
