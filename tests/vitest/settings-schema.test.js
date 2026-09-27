// @vitest-environment happy-dom
/**
 * The settings schema seam (config/settings.js).
 *
 * The schema is the single source of truth for a setting's default, its
 * coercion and its form binding, so these tests assert the module's exported
 * interface — `defaultSettings`, `coerceSetting`, `readSettingsForm` — never
 * the FIELDS table's internals.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  defaultSettings,
  coerceSetting,
  readSettingsForm,
} from "../../src/config/settings.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("defaultSettings", () => {
  it("carries the documented defaults", () => {
    const s = defaultSettings();
    expect(s.provider).toBe("gemini");
    expect(s.aiEnabled).toBe(true);
    expect(s.studyWeekday).toBe(2);
    expect(s.studyWeekend).toBe(4);
    expect(s.plannerWeeks).toBe(6);
    expect(s.hybridRAG).toBe(false);
    expect(s.calendarStartOfWeek).toBe(1);
  });

  it("keeps keys without a default out of a blank DB", () => {
    const s = defaultSettings();
    expect("tutorMode" in s).toBe(false);
    expect("defaultView" in s).toBe(false);
  });
});

describe("coerceSetting", () => {
  it("parses a float from a form string", () => {
    expect(coerceSetting("studyWeekday", "3.5")).toBe(3.5);
  });

  it("parses an int from a form string", () => {
    expect(coerceSetting("plannerWeeks", "8")).toBe(8);
  });

  it("keeps the default for a blank or unparseable number", () => {
    expect(coerceSetting("plannerWeeks", "")).toBe(6);
    expect(coerceSetting("studyWeekday", "abc")).toBe(2);
    // The form treats "0" as unset (a falsy parse keeps the default), matching
    // its historic behaviour.
    expect(coerceSetting("studyWeekday", "0")).toBe(2);
  });

  it("reads a boolean from truthiness", () => {
    expect(coerceSetting("aiEnabled", true)).toBe(true);
    expect(coerceSetting("aiEnabled", "")).toBe(false);
    expect(coerceSetting("hybridRAG", false)).toBe(false);
  });
});

describe("readSettingsForm", () => {
  it("is empty when no settings controls are on screen", () => {
    document.body.innerHTML = "<p>not the settings screen</p>";
    expect(readSettingsForm()).toEqual({});
  });

  it("reads only the controls that are present", () => {
    document.body.innerHTML = '<input id="setWeekday" value="3">';
    const patch = readSettingsForm();
    expect(patch.studyWeekday).toBe(3);
    expect("studyWeekend" in patch).toBe(false);
    expect("plannerWeeks" in patch).toBe(false);
  });

  it("reads a checkbox's checked state, not its value", () => {
    document.body.innerHTML =
      '<input type="checkbox" id="setAiEnabled" checked>' +
      '<input type="checkbox" id="setHybridRAG">';
    const patch = readSettingsForm();
    expect(patch.aiEnabled).toBe(true);
    expect(patch.hybridRAG).toBe(false);
  });

  it("keeps the current value when a fallbackToCurrent field is blank", () => {
    document.body.innerHTML =
      '<input id="setTermStart" value="">' +
      '<input id="setTermName" value="2nd Term">';
    const patch = readSettingsForm(null, {
      termStart: "2026-01-05",
      termName: "1st Term",
    });
    // blank -> keep the current term start
    expect(patch.termStart).toBe("2026-01-05");
    // a real value wins over the current one
    expect(patch.termName).toBe("2nd Term");
  });
});
