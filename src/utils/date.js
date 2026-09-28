/**
 * Date utility functions for Journey A.I
 * Handles date parsing, formatting, and calculations.
 */

// Constants
export const DAY = 86400000; // milliseconds in a day

// Month name mappings
const MONTHS = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

// Month name patterns for regex matching
const MONTH_ALT =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MONTH_FIRST_RE = new RegExp(
  "\\b(" +
    MONTH_ALT +
    ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b",
  "i",
);
const DAY_FIRST_RE = new RegExp(
  "\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(" +
    MONTH_ALT +
    ")\\.?(?:,?\\s*(\\d{4}))?\\b",
  "i",
);
export const MONTH_FIRST_G = new RegExp(MONTH_FIRST_RE.source, "ig");
export const DAY_FIRST_G = new RegExp(DAY_FIRST_RE.source, "ig");

export function iso(d) {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  return (
    x.getFullYear() +
    "-" +
    p(x.getMonth() + 1) +
    "-" +
    p(x.getDate()) +
    "T" +
    p(x.getHours()) +
    ":" +
    p(x.getMinutes())
  );
}

export function dateOnly(d) {
  const i = iso(d);
  return i ? i.slice(0, 10) : null;
}

export function fromIso(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function daysUntil(isoStr) {
  if (!isoStr) return null;
  const d = fromIso(isoStr);
  if (!d) return null;
  return Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
}

export function fmtDate(isoStr, withTime = false) {
  const d = fromIso(isoStr);
  if (!d) return "No date";
  const s = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  if (withTime && (d.getHours() || d.getMinutes())) {
    return (
      s +
      ", " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    );
  }
  return s;
}

// timeFormat is "12h" ("11:59 PM") or "24h" ("23:59"); "" when there is no time.
export function fmtTime(isoStr, timeFormat = "12h") {
  if (!isoStr || typeof isoStr !== "string") return "";
  const tIdx = isoStr.indexOf("T");
  if (tIdx === -1 || isoStr.length < tIdx + 6) return "";
  const rawTime = isoStr.slice(tIdx + 1, tIdx + 6);
  if (!rawTime.includes(":")) return "";
  if (timeFormat === "24h") return rawTime;
  const parts = rawTime.split(":");
  const hour = parseInt(parts[0], 10);
  const min = parts[1];
  if (isNaN(hour)) return rawTime;
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

export function fmtDay(isoStr) {
  const d = fromIso(isoStr);
  return d
    ? d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : "Unscheduled";
}

export function rel(isoStr) {
  const n = daysUntil(isoStr);
  if (n === null) return "no date";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n < 0) return Math.abs(n) + " days ago";
  return "in " + n + " days";
}

export function mondayOf(d) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
  return addDays(x, -dow);
}

export function parseTime(s) {
  if (!s) return null;
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i.exec(String(s));
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = m[2] ? parseInt(m[2], 10) : 0;
  const ap = (m[3] || "").toLowerCase().replace(/\./g, "");
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return { h, m: mi };
}

// Lenient natural-language date parser: "Jan 15", "15 January 2026",
// "01/15/2026", "2026-01-15", "Week of Feb 3", "Jan 15 - Jan 20" (the first
// date). A day of month is required; a bare month name is not a date.
export function parseDate(text, yearHint) {
  if (!text) return null;
  const s = String(text)
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  let m, mo, da, yr;
  const cur = new Date();

  // ISO: 2026-01-15
  m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  // Numeric: 01/15/2026 or 1/15/26 or 15/01/2026
  m = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/.exec(s);
  if (m) {
    const a = +m[1],
      b = +m[2];
    let y = +m[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    if (a > 12 && b <= 12) return new Date(y, b - 1, a); // day-first
    return new Date(y, a - 1, b); // month-first
  }

  // "January 15[, 2026]" / "Jan 15 2026"
  m = MONTH_FIRST_RE.exec(s);
  if (m) {
    mo = MONTHS[m[1].toLowerCase()];
    da = +m[2];
    yr = m[3] ? +m[3] : null;
    if (mo !== undefined) return resolve(mo, da, yr, yearHint, cur);
  }

  // "15 January 2026"
  m = DAY_FIRST_RE.exec(s);
  if (m) {
    mo = MONTHS[m[2].toLowerCase()];
    da = +m[1];
    yr = m[3] ? +m[3] : null;
    if (mo !== undefined) return resolve(mo, da, yr, yearHint, cur);
  }

  // A date needs an explicit day of month. A bare month name is not a date:
  // "Summary" contains "mar", "decisions" contains "dec" and "maybe"
  // contains "may", so scanning for a month name turns ordinary prose into a
  // confident deadline on the 1st of that month.
  return null;

  function resolve(mo2, da2, yr2, hint, now) {
    if (da2 < 1 || da2 > 31) return null;
    const y = yr2 || hint || now.getFullYear();
    const d = new Date(y, mo2, da2);
    if (d.getMonth() !== mo2) return null; // e.g. Feb 31
    // When no explicit year and only a hint-free guess was made, roll forward if long past
    if (!yr2 && !hint && now - d > 300 * DAY) {
      return new Date(y + 1, mo2, da2);
    }
    return d;
  }
}
