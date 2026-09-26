/**
 * The guidance level must fade with demonstrated competence, not stay a
 * permanent preference.
 *
 * Before this wiring, the level came from `settings.tutorMode || "explain"`
 * for every learner forever, while the recall drill recorded hit-or-miss
 * data that nothing read back. These cases pin the policy: an explicit
 * choice always wins, and "Automatic" is the only mode the evidence moves.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { Coach } from "../../src/domain/coach.js";
import { resolveGuidanceLevel } from "../../src/ai/index.js";

/** Seed recall history as if the learner had practised on earlier days. */
function seedRecall(hits, misses, days = 1) {
  Store.db.activity = [];
  const perDay = Math.max(1, Math.ceil((hits + misses) / days));
  let leftH = hits;
  let leftM = misses;
  for (let d = 0; d < days; d++) {
    const h = Math.min(leftH, perDay);
    const m = Math.min(leftM, perDay);
    leftH -= h;
    leftM -= m;
    Store.db.activity.push({
      date: "2026-09-0" + ((d % 9) + 1),
      minutes: 10,
      completed: 1,
      recall: { hits: h, misses: m },
    });
  }
}

beforeEach(() => {
  Store.resetAll();
});

describe("resolveGuidanceLevel", () => {
  it("lets an explicit caller override everything", () => {
    seedRecall(30, 0);
    Store.db.settings.tutorMode = "explain";
    expect(resolveGuidanceLevel({ guidanceLevel: "hint" })).toBe("hint");
  });

  it("honours a level pinned in Settings instead of fading past it", () => {
    seedRecall(30, 0);
    Store.db.settings.tutorMode = "explain";
    expect(resolveGuidanceLevel({})).toBe("explain");
    Store.db.settings.tutorMode = "hint";
    expect(resolveGuidanceLevel({})).toBe("hint");
  });

  it("defaults to full answers while there is no practice evidence", () => {
    Store.db.settings.tutorMode = "auto";
    expect(resolveGuidanceLevel({})).toBe("explain");
    expect(Coach.recallStats().attempts).toBe(0);
  });

  it("treats an unset tutor mode as Automatic, so a fresh learner is not frozen at explain", () => {
    delete Store.db.settings.tutorMode;
    seedRecall(14, 4);
    expect(resolveGuidanceLevel({})).toBe("socratic");
  });

  it("fades to guiding questions after eight attempts", () => {
    Store.db.settings.tutorMode = "auto";
    seedRecall(5, 3);
    expect(resolveGuidanceLevel({})).toBe("socratic");
  });

  it("fades to a single nudge once twenty attempts are mostly hits", () => {
    Store.db.settings.tutorMode = "auto";
    seedRecall(17, 3);
    expect(resolveGuidanceLevel({})).toBe("hint");
    expect(Coach.recallStats().rate).toBeCloseTo(0.85, 5);
  });

  it("steps back to full answers when twenty attempts are mostly misses", () => {
    Store.db.settings.tutorMode = "auto";
    seedRecall(4, 16);
    expect(resolveGuidanceLevel({})).toBe("explain");
  });

  it("does not fade on a small sample with a good rate", () => {
    Store.db.settings.tutorMode = "auto";
    seedRecall(6, 0);
    expect(resolveGuidanceLevel({})).toBe("explain");
  });

  it("keeps full answers when a large sample is mostly misses", () => {
    Store.db.settings.tutorMode = "auto";
    seedRecall(10, 20);
    expect(resolveGuidanceLevel({})).toBe("explain");
  });
});

describe("Coach.recallStats", () => {
  it("reports no attempts, not a perfect rate, on an empty log", () => {
    expect(Coach.recallStats()).toEqual({
      attempts: 0,
      hits: 0,
      misses: 0,
      rate: 0,
    });
  });

  it("aggregates hits and misses across days", () => {
    Store.db.activity = [
      { date: "2026-09-01", minutes: 5, completed: 1, recall: { hits: 3, misses: 1 } },
      { date: "2026-09-02", minutes: 5, completed: 1, recall: { hits: 2, misses: 4 } },
      { date: "2026-09-03", minutes: 5, completed: 1 },
    ];
    expect(Coach.recallStats()).toEqual({
      attempts: 10,
      hits: 5,
      misses: 5,
      rate: 0.5,
    });
  });

  it("counts today's verdicts as soon as they are logged", () => {
    Store.db.activity = [];
    Coach.logRecall(true);
    Coach.logRecall(false);
    const r = Coach.recallStats();
    expect(r.attempts).toBe(2);
    expect(r.hits).toBe(1);
    expect(r.misses).toBe(1);
    expect(r.rate).toBe(0.5);
  });
});
