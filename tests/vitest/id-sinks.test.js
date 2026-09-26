/**
 * Unescaped entity-id interpolations in HTML sinks.
 *
 * Converted from `tests/scan-id-sinks.cjs`, which nothing invoked: it was not
 * in `package.json`, not in the `verify` workflow, and the vitest include
 * pattern only covers the `tests/vitest` directory. A scanner that never runs
 * reads as coverage it does not have — so it now fails `npm test` instead of
 * printing "OK" to nobody.
 *
 * Heuristic, deliberately: it flags an `id="…' + expr` / `data-id="' + expr`
 * whose expression is not `esc(...)`, a whitelisted pre-sanitised local, or a
 * literal. The whitelist is the honest part — every entry names a place a
 * human already checked the value.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

/* Known-safe values: pre-sanitised local (`safe`) or module constants. */
const SAFE_VALS = new Set([
  "safe",
  "safe +",
  "safe + '",
  "PROPOSAL_CARD_ID",
  "PROPOSAL_CARD_ID +",
]);

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".js")) acc.push(p);
  }
  return acc;
}

function scan() {
  const issues = [];
  for (const file of walk(SRC)) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const next = lines[i + 1] || "";
      const next2 = lines[i + 2] || "";
      const where = `${file.replace(process.cwd() + "/", "")}:${i + 1}`;

      // same-line: data-id="' + something  (must be esc(...) or a literal)
      let re =
        /data-(?:id|course-id|task-id|doc-id|kebab-id|recall-card)="' \+ ([^;]+?)(?:'|;|$)/g;
      let m;
      while ((m = re.exec(line))) {
        const val = m[1].trim();
        if (val.startsWith("esc(")) continue;
        if (SAFE_VALS.has(val) || SAFE_VALS.has(val.replace(/[);]+$/, "")))
          continue;
        if (/^\d+$/.test(val)) continue;
        // value continues on the next lines — check if esc( appears soon
        const window = (line.slice(m.index) + "\n" + next + "\n" + next2)
          .replace(/\s+/g, " ");
        if (
          /data-(?:id|course-id|task-id|doc-id|kebab-id|recall-card)="' \+ esc\(/.test(
            window,
          )
        )
          continue;
        issues.push(`${where}: ${m[0].slice(0, 90)}`);
      }

      // multi-line form: attr ends with "' +" and the next token is a bare id
      if (/data-(?:id|course-id|task-id|doc-id|kebab-id)="' \+\s*$/.test(line)) {
        const v = next.trim();
        if (
          v &&
          !v.startsWith("esc(") &&
          !SAFE_VALS.has(v) &&
          !v.startsWith('"')
        ) {
          issues.push(`${where} (next line): ${v}`);
        }
      }

      // id="foo-' + x  (element id)
      re = /id="[^"]*' \+ ([A-Za-z_$][\w.$]*)/g;
      while ((m = re.exec(line))) {
        const val = m[1];
        if (val === "esc" || SAFE_VALS.has(val)) continue;
        if (line.slice(m.index, m.index + 80).includes("esc(")) continue;
        if (next.trim().startsWith("esc(")) continue;
        issues.push(`${where}: id sink ${m[0].slice(0, 90)}`);
      }
    }
  }
  return issues;
}

describe("XSS scanner: unescaped id sinks", () => {
  it("scans every source file, not a sample", () => {
    expect(walk(SRC).length).toBeGreaterThan(50);
  });

  it("has no unescaped id sink in an HTML string", () => {
    const issues = scan();
    expect(issues, "Unescaped ID sinks:\n" + issues.join("\n")).toEqual([]);
  });
});
