import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { idbAvailable, idbGet, idbSet } from "../../src/core/idb.js";
import { installFakeIDB } from "./helpers/fake-idb.js";

describe("idb availability", () => {
  it("is false when indexedDB is missing (happy-dom default)", async () => {
    const restore = installFakeIDB();
    try {
      delete globalThis.indexedDB;
      expect(idbAvailable()).toBe(false);
      expect(await idbGet("k")).toBeNull();
      expect(await idbSet("k", { a: 1 })).toBe(false);
    } finally {
      restore();
    }
  });
});

describe("idb read/write", () => {
  let restore;

  beforeEach(() => {
    restore = installFakeIDB();
  });

  afterEach(() => {
    restore();
  });

  it("round-trips a structured value", async () => {
    expect(idbAvailable()).toBe(true);
    const value = { json: '{"version":4}', savedAt: 123 };
    expect(await idbSet("journeyai.db.v1", value)).toBe(true);
    expect(await idbGet("journeyai.db.v1")).toEqual(value);
  });

  it("returns null for a missing key", async () => {
    expect(await idbGet("nope")).toBeNull();
  });

  it("overwrites an existing key", async () => {
    await idbSet("k", { n: 1 });
    await idbSet("k", { n: 2 });
    expect(await idbGet("k")).toEqual({ n: 2 });
  });
});
