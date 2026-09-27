import { describe, it, expect } from "vitest";
import {
  createBlankDB,
  migrateSchema,
  MIGRATIONS,
} from "../../src/config/settings.js";
import { CFG } from "../../src/config/constants.js";

describe("createBlankDB", () => {
  it("returns an object with expected top-level keys", () => {
    const db = createBlankDB();
    expect(db).toHaveProperty("settings");
    expect(db).toHaveProperty("courses");
    expect(db).toHaveProperty("lessons");
    expect(db).toHaveProperty("events");
    expect(db).toHaveProperty("readings");
    expect(db).toHaveProperty("documents");
    expect(db).toHaveProperty("plan");
  });

  it("initializes settings with defaults", () => {
    const db = createBlankDB();
    expect(db.settings).toHaveProperty("apiKey", CFG.openrouter.defaultKey);
    expect(db.version).toBe(CFG.schemaVersion);
    expect(db.settings).toHaveProperty("aiEnabled");
    expect(db.settings).toHaveProperty("termStart");
    expect(db.settings.hybridRAG).toBe(false);
    expect(db.settings.syllabusStandard).toBe("pnu-cmi-teacher-education-2025");
  });

  it("initializes arrays as empty", () => {
    const db = createBlankDB();
    expect(db.courses).toEqual([]);
    expect(db.lessons).toEqual([]);
    expect(db.events).toEqual([]);
    expect(db.readings).toEqual([]);
    expect(db.documents).toEqual([]);
  });
});

describe("migrateSchema", () => {
  it("returns the db unchanged if schema matches current", () => {
    const db = createBlankDB();
    const result = migrateSchema(db);
    expect(result).toBe(db);
    expect(result.version).toBe(CFG.schemaVersion);
  });

  it("returns null for a newer schema version", () => {
    const db = createBlankDB();
    db.version = CFG.schemaVersion + 1;
    const result = migrateSchema(db);
    expect(result).toBeNull();
  });

  it("returns null when a migration step throws (quarantine half-migrated data)", () => {
    const db = createBlankDB();
    db.version = 3;
    const before = MIGRATIONS[4];
    MIGRATIONS[4] = function () {
      throw new Error("boom");
    };
    try {
      expect(migrateSchema(db)).toBeNull();
    } finally {
      if (before) MIGRATIONS[4] = before;
      else delete MIGRATIONS[4];
    }
  });

  it("migrates an older schema by running migration steps", () => {
    const db = createBlankDB();
    db.version = 1;
    const result = migrateSchema(db);
    expect(result).not.toBeNull();
    expect(result.version).toBe(CFG.schemaVersion);
  });
});
