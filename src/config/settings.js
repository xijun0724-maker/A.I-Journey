/**
 * Default settings and schema for Journey A.I
 *
 * This module is the single source of truth for every setting: its default,
 * its storage type, its coercion from a form value and the form control it
 * binds to. `createBlankDB()` derives the blank settings object from the
 * schema, and `readSettingsForm()` maps the live DOM back to a typed patch
 * using the same list — so a new setting is one descriptor, not a three-file
 * edit (blank DB + markup + saver).
 */

import { CFG } from "./constants.js";
import { dateOnly } from "../utils/date.js";

/** Default term bounds: the first week of January to the third week of May. */
function termDefaults() {
  const now = new Date();
  return {
    termStart: dateOnly(new Date(now.getFullYear(), 0, 5)),
    termEnd: dateOnly(new Date(now.getFullYear(), 4, 20)),
  };
}

const TERM = termDefaults();

/**
 * key → { type, default?, form?, fallbackToCurrent? }
 *
 * - `type`   — "string" | "enum" | "boolean" | "number" | "int"
 * - `default`— the blank-DB value; omit to keep the key out of a blank DB
 * - `form`   — the selector `readSettingsForm()` reads this key from
 * - `fallbackToCurrent` — an empty form value keeps the existing setting
 *
 * Descriptors without a `default` stay absent from a blank DB until something
 * writes them (e.g. `tutorMode`, whose readers supply their own fallback).
 */
const FIELDS = {
  provider: { type: "enum", default: "gemini", form: "#setProvider" },
  model: { type: "string", default: CFG.gemini.model, form: "#setModel" },
  apiKey: { type: "string", default: "" },
  aiEnabled: { type: "boolean", default: true, form: "#setAiEnabled" },
  termStart: {
    type: "date",
    default: TERM.termStart,
    form: "#setTermStart",
    fallbackToCurrent: true,
  },
  termEnd: {
    type: "date",
    default: TERM.termEnd,
    form: "#setTermEnd",
    fallbackToCurrent: true,
  },
  academicYear: {
    type: "string",
    default: "2026–2027",
    form: "#setAcademicYear",
    fallbackToCurrent: true,
  },
  termName: {
    type: "string",
    default: "1st Term",
    form: "#setTermName",
    fallbackToCurrent: true,
  },
  studyWeekday: { type: "number", default: 2, form: "#setWeekday" },
  studyWeekend: { type: "number", default: 4, form: "#setWeekend" },
  plannerWeeks: { type: "int", default: 6, form: "#setWeeks" },
  userName: { type: "string", default: "" },
  hybridRAG: { type: "boolean", default: false, form: "#setHybridRAG" },
  tutorMode: { type: "enum", form: "#setTutorMode" },
  syllabusStandard: {
    type: "enum",
    default: "pnu-cmi-teacher-education-2025",
    form: "#setSyllabusStandard",
  },
  defaultView: { type: "string", form: "#setDefaultView" },
  calendarStartOfWeek: { type: "int", default: 1 },
  calendarMaxEvents: { type: "int", default: 4 },
  calendarTimeFormat: { type: "enum", default: "12h" },
  calendarShowMilestones: { type: "boolean", default: true },
  calendarShowExams: { type: "boolean", default: true },
  calendarShowAssignments: { type: "boolean", default: true },
  calendarShowOther: { type: "boolean", default: true },
};

export const SETTINGS_FIELDS = Object.freeze(FIELDS);

/** The blank settings object: every descriptor's default, in declaration order. */
export function defaultSettings() {
  const out = {};
  for (const key of Object.keys(FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(FIELDS[key], "default")) {
      out[key] = FIELDS[key].default;
    }
  }
  return out;
}

/**
 * Coerce a raw (usually string) form value into the setting's stored type.
 * Number/int fall back to the descriptor default, matching the form's historic
 * "blank or unparseable keeps the default" behaviour.
 * @param {string} key
 * @param {*} value
 * @returns {*}
 */
export function coerceSetting(key, value) {
  const field = FIELDS[key];
  if (!field) return value;
  switch (field.type) {
    case "boolean":
      return !!value;
    case "number": {
      const n = parseFloat(value);
      return Number.isFinite(n) && n ? n : field.default;
    }
    case "int": {
      const n = parseInt(value, 10);
      return Number.isFinite(n) && n ? n : field.default;
    }
    default:
      return value;
  }
}

/**
 * Read the settings form into a typed patch.
 *
 * Only fields whose control is actually present are included, so a save fired
 * from a screen without the settings inputs is a no-op rather than a throw.
 * @param {ParentNode} [root] - Root to query (defaults to `document`)
 * @param {Object} [current] - Current settings, for `fallbackToCurrent` fields
 * @returns {Object<string, *>} The patch
 */
export function readSettingsForm(root, current) {
  const scope = root || (typeof document !== "undefined" ? document : null);
  if (!scope || typeof scope.querySelector !== "function") return {};
  const patch = {};
  const now = current || {};
  for (const key of Object.keys(FIELDS)) {
    const field = FIELDS[key];
    if (!field.form) continue;
    const el = scope.querySelector(field.form);
    if (!el) continue;
    const raw = field.type === "boolean" ? el.checked : el.value;
    let value = coerceSetting(key, raw);
    if (field.fallbackToCurrent && (value === undefined || value === "")) {
      value = now[key];
    }
    patch[key] = value;
  }
  return patch;
}

/**
 * Create a blank database schema
 */
export function createBlankDB() {
  return {
    version: CFG.schemaVersion,
    // Defaults live in the settings schema so the blank DB, the Settings form
    // and every writer agree on one list of keys.
    settings: defaultSettings(),
    courses: [],
    academicCalendars: [],
    documents: [],
    events: [],
    lessons: [],
    readings: [],
    chunks: [],
    chat: [],
    activity: [],
    plan: [],
    planMeta: null,
  };
}

/**
 * Schema migrations, applied in order from the stored version up to
 * CFG.schemaVersion. Each step receives the parsed object and returns it.
 */
export const MIGRATIONS = {
  4: function (d) {
    (d.chunks || []).forEach(function (c) {
      if (typeof c.text !== "string" || c.len) return;
      const doc = (d.documents || []).find((x) => x.id === c.docId);
      const at =
        doc && typeof doc.text === "string" ? doc.text.indexOf(c.text) : -1;
      if (at === -1) return;
      c.start = at;
      c.len = c.text.length;
      delete c.text;
    });
    return d;
  },
};

/**
 * Apply schema migrations.
 * Returns null when the data must NOT be used: a newer-than-supported
 * schema, or a migration that threw (half-migrated data is not safe to
 * mark current). Callers must quarantine the stored bytes rather than
 * overwrite them.
 */
export function migrateSchema(d) {
  const from = parseInt(d.version, 10) || 1;
  if (from > CFG.schemaVersion) return null;

  for (let v = from + 1; v <= CFG.schemaVersion; v++) {
    if (typeof MIGRATIONS[v] === "function") {
      try {
        d = MIGRATIONS[v](d) || d;
      } catch (e) {
        if (typeof console !== "undefined" && console.warn)
          console.warn("Migration to v" + v + " failed - data quarantined", e);
        return null;
      }
    }
  }
  d.version = CFG.schemaVersion;
  return d;
}
