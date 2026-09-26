/**
 * Every module the app loads must be tracked by git.
 *
 * `index.html` loads three files as raw source (`src/styles/index.css`,
 * `src/theme-init.js`, `src/boot-fallback.js`) and the module graph enters
 * through `src/main.js`. GitHub Pages deploys the checked-out tree, and CI
 * only ever sees tracked files — so an untracked module is invisible to
 * `npm test`, to lint and to the build, yet 404s in production.
 *
 * This is the one guard that can see that failure class: it walks the real
 * load graph and fails when a file it reaches does not exist or is not in
 * `git ls-files`.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

const toPosix = (p) => p.replace(/\\/g, "/");

const TRACKED = new Set(
  execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .map(toPosix),
);

const ROOT = process.cwd();
const INDEX_HTML = joinRoot("index.html");

function joinRoot(p) {
  return resolve(ROOT, p);
}

/** Resolve a relative import specifier the way the bundler does. */
function resolveSpec(fromFile, spec) {
  return toPosix(relative(ROOT, resolve(dirname(fromFile), spec)));
}

const IMPORT_RE =
  /(?:from\s+|import\s*\(\s*|import\s+)(["'])(\.{1,2}\/[^"']+)\1/g;

/** Every `src/...` path reachable from an entry file. */
function reachable(entry) {
  const found = new Set();
  const missing = new Set();
  const queue = [entry];

  while (queue.length) {
    const rel = queue.pop();
    if (found.has(rel)) continue;
    found.add(rel);
    if (!existsSync(joinRoot(rel))) {
      missing.add(rel);
      continue;
    }
    if (!rel.endsWith(".js")) continue;
    const source = readFileSync(joinRoot(rel), "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      queue.push(resolveSpec(joinRoot(rel), match[2]));
    }
  }
  return { found, missing };
}

/** `<script src>` / `<link href>` targets referenced by index.html. */
function htmlAssets() {
  const html = readFileSync(INDEX_HTML, "utf8");
  const out = [];
  for (const match of html.matchAll(/(?:src|href)="(src\/[^"]+)"/g)) {
    out.push(match[1]);
  }
  return out;
}

describe("the load graph", () => {
  it("reaches more than a handful of modules", () => {
    const { found } = reachable("src/main.js");
    expect(found.size).toBeGreaterThan(40);
    expect(htmlAssets().length).toBeGreaterThan(2);
  });

  it("has no missing or untracked module", () => {
    const { found, missing } = reachable("src/main.js");
    const referenced = [...found, ...htmlAssets()];
    const absent = referenced.filter((rel) => !existsSync(joinRoot(rel)));
    const untracked = referenced.filter(
      (rel) => existsSync(joinRoot(rel)) && !TRACKED.has(rel),
    );

    expect([...missing].sort(), "imported but does not exist").toEqual([]);
    expect(absent.sort(), "referenced but does not exist").toEqual([]);
    expect(untracked.sort(), "imported but untracked").toEqual([]);
  });
});
