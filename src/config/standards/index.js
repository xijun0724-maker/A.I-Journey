/**
 * Syllabus standards registry.
 * Built-ins: PNU CMI and generic higher-ed.
 */

import { pnuStandard } from "./pnu.js";
import { genericStandard } from "./generic.js";

/** All built-in standards, sorted by label. */
const ALL = [pnuStandard, genericStandard].sort(function (a, b) {
  return a.label.localeCompare(b.label);
});

export const Standards = {};

Standards.DEFAULT_ID = pnuStandard.id;

/** Look up a standard by id; falls back to the default when missing. */
Standards.get = function (id) {
  const key = String(id || "").trim();
  const found = ALL.find(function (standard) {
    return standard.id === key;
  });
  return found || pnuStandard;
};

Standards.list = function () {
  return ALL.slice();
};

/**
 * Resolve the standard id to use for an analysis.
 * Accepts an explicit id, else a settings-like object, else the default.
 */
Standards.resolve = function (idOrSettings) {
  if (typeof idOrSettings === "string" && idOrSettings.trim()) {
    return Standards.get(idOrSettings);
  }
  if (idOrSettings && typeof idOrSettings === "object") {
    const fromSettings = idOrSettings.syllabusStandard;
    if (typeof fromSettings === "string" && fromSettings.trim()) {
      return Standards.get(fromSettings);
    }
  }
  return Standards.get(Standards.DEFAULT_ID);
};

export { pnuStandard, genericStandard };
export default Standards;
