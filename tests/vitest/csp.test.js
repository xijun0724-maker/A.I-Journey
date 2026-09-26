/**
 * The CSP escape hatch is closed, and stays closed.
 *
 * `style-src` used to carry 'unsafe-inline' because ~120 rendered elements
 * carried `style="…"` attributes (2026-09-25 audit, Step 7). Those became
 * classes in `src/styles/utilities.css`, and the handful of values a class
 * cannot express (a course's chosen colour, a computed width, a banner URL)
 * became `data-style`, applied through the CSSOM — which CSP does not govern,
 * because it is not markup.
 *
 * These checks are the point of that refactor: the policy, the absence of the
 * thing that forced it, and markup that uses the replacements correctly.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const INDEX_HTML = join(ROOT, "index.html");
const UTILITIES = join(ROOT, "src/styles/utilities.css");

function walk(dir, pred, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, acc);
    else if (pred(e.name)) acc.push(p);
  }
  return acc;
}

const SOURCES = [
  ...walk(join(ROOT, "src"), (n) => n.endsWith(".js")),
  INDEX_HTML,
];

/** Lines that are inside a comment — documentation may quote the forbidden. */
function codeLines(text) {
  const out = [];
  let inBlock = false;
  for (const line of text.split("\n")) {
    let s = line;
    if (inBlock) {
      const end = s.indexOf("*/");
      if (end < 0) {
        out.push("");
        continue;
      }
      s = s.slice(end + 2);
      inBlock = false;
    }
    const start = s.indexOf("/*");
    if (start >= 0) {
      const end = s.indexOf("*/", start + 2);
      if (end < 0) {
        inBlock = true;
        s = s.slice(0, start);
      } else {
        s = s.slice(0, start) + s.slice(end + 2);
      }
    }
    const line2 = s.indexOf("//");
    if (line2 >= 0) s = s.slice(0, line2);
    out.push(s);
  }
  return out;
}

const POLICY =
  (
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(
      readFileSync(INDEX_HTML, "utf8").replace(/\s+/g, " "),
    ) || []
  )[1] || "";

describe("Content-Security-Policy", () => {
  it("parses a policy out of index.html at all", () => {
    expect(POLICY).toContain("default-src");
    expect(POLICY).toContain("script-src");
  });

  it("style-src has no 'unsafe-inline'", () => {
    const styleSrc = /style-src([^;]*)/.exec(POLICY);
    expect(styleSrc, "style-src must be declared").toBeTruthy();
    expect(styleSrc[1]).not.toContain("unsafe-inline");
    expect(styleSrc[1]).toContain("'self'");
  });

  it("script-src has no 'unsafe-inline'", () => {
    const scriptSrc = /script-src([^;]*)/.exec(POLICY);
    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc[1]).not.toContain("unsafe-inline");
  });
});

describe("no rendered element carries a style attribute", () => {
  it("is true of every module under src/ and of index.html", () => {
    const offenders = [];
    for (const file of SOURCES) {
      const lines = codeLines(readFileSync(file, "utf8"));
      lines.forEach((line, i) => {
        /* `style="…"` / `style='…'` only — a bare `style =` is a JS
           variable in one of these modules, not a rendered attribute. */
        if (/(?<![\w-])style\s*=\s*["'`]/.test(line)) {
          offenders.push(`${relative(ROOT, file)}:${i + 1}`);
        }
      });
    }
    expect(offenders, "style attributes are refused by style-src").toEqual([]);
  });
});

describe("the dev server still styles itself", () => {
  it("vite serve re-allows inline styles; the file on disk does not", async () => {
    const { devStyleCspRelaxation } = await import("../../vite.config.js");
    const html = readFileSync(INDEX_HTML, "utf8");
    const served = devStyleCspRelaxation().transformIndexHtml(html);

    /* Vite injects <style> elements for HMR, so dev needs the hatch… */
    expect(served).toContain(
      "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
    );
    /* …and the policy dist/index.html is built from must never carry it.
       (The comment in index.html that explains this mentions the literal
       string, so scope the check to the parsed directive, not the file.) */
    expect(POLICY).not.toContain("unsafe-inline");
  });
});

describe("the classes that replaced them", () => {
  const css = readFileSync(UTILITIES, "utf8");
  const defined = new Set(
    [...css.matchAll(/^\.(u-[\w-]+)\s*\{/gm)].map((m) => m[1]),
  );

  it("declares a workable number of rules", () => {
    expect(defined.size).toBeGreaterThan(80);
  });

  it("are all defined — every static class= in markup resolves", () => {
    const missing = new Set();
    for (const file of SOURCES) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/class="([^"]*)"/g)) {
        const inner = m[1];
        /* Concatenated class attributes are assembled at runtime; skip them
           rather than guessing what the pieces were meant to be. */
        if (inner.includes("'") || inner.includes("+")) continue;
        const line = text.slice(0, m.index).split("\n").length;
        for (const token of inner.split(/\s+/).filter(Boolean)) {
          if (token.startsWith("u-") && !defined.has(token)) {
            missing.add(`${relative(ROOT, file)}:${line} .${token}`);
          }
        }
      }
    }
    expect([...missing]).toEqual([]);
  });
});
