/**
 * Style-token contract tests.
 *
 * Two bug classes this guards against:
 *  1. A stylesheet reading a custom property that no stylesheet defines
 *     (e.g. `--rounded-full` read by .btn-icon but only declared in the
 *     root stylesheet nothing loaded, since deleted) — the declaration resolves to
 *     nothing and the component renders wrong.
 *  2. A theme-sensitive colour that is declared in `:root` but never
 *     overridden in `[data-theme="dark"]`, or an fg/bg pairing that does
 *     not meet WCAG AA (4.5:1) for normal text.
 *
 * Custom properties read with a fallback (`var(--progress, 0)`) are set
 * per-element from JS and are intentionally not required to be declared.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const STYLES_DIR = fileURLToPath(new URL("../../src/styles/", import.meta.url));
const TOKENS_FILE = join(STYLES_DIR, "tokens.css");

function walkCss(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walkCss(join(dir, entry.name))
        : [join(dir, entry.name)],
    )
    .filter((file) => file.endsWith(".css"));
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

const CSS_FILES = walkCss(STYLES_DIR).map((file) => ({
  name: relative(STYLES_DIR, file).replace(/\\/g, "/"),
  css: stripComments(readFileSync(file, "utf8")),
}));

/** Every custom property declared anywhere in src/styles. */
function declaredTokens() {
  const out = new Set();
  const re = /(--[a-z0-9-]+)\s*:/g;
  for (const file of CSS_FILES) {
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(file.css)) !== null) out.add(match[1]);
  }
  return out;
}

/**
 * Custom properties read as `var(--x)` with no fallback value.
 * `var(--x, 0)` is deliberately optional, so it is not included.
 */
function readWithoutFallback() {
  const found = new Map();
  const re = /var\(\s*(--[a-z0-9-]+)\s*([,)])/g;
  for (const file of CSS_FILES) {
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(file.css)) !== null) {
      if (match[2] === ",") continue;
      const token = match[1];
      if (!found.has(token)) found.set(token, new Set());
      found.get(token).add(file.name);
    }
  }
  return found;
}

/** Declarations inside the first block of the given selector. */
function declaredIn(css, selector) {
  const at = css.indexOf(selector);
  if (at === -1)
    throw new Error("selector not found in tokens.css: " + selector);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close);
  const out = new Map();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = re.exec(body)) !== null) out.set(match[1], match[2].trim());
  return out;
}

const RAW_TOKENS = readFileSync(TOKENS_FILE, "utf8");
const LIGHT = declaredIn(RAW_TOKENS, ":root");
const DARK = declaredIn(RAW_TOKENS, '[data-theme="dark"]');

function toRgb(value) {
  const hex = String(value).trim();
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(
      "contrast test needs a solid #rrggbb token, got: " +
        JSON.stringify(value),
    );
  }
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.1 relative luminance. */
function luminance(color) {
  const [r, g, b] = toRgb(color).map((channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

describe("style token declarations", () => {
  it("defines every custom property read without a fallback", () => {
    const declared = declaredTokens();
    const missing = [];
    for (const [token, files] of readWithoutFallback()) {
      if (declared.has(token)) continue;
      missing.push(token + " (read by " + [...files].join(", ") + ")");
    }
    expect(missing).toEqual([]);
  });

  it("declares the chat pill and icon-button surfaces", () => {
    for (const token of [
      "--rounded-full",
      "--mono",
      "--bg-pill",
      "--bg-pill-border",
    ]) {
      expect(LIGHT.has(token), token + " missing from :root").toBe(true);
    }
    expect(LIGHT.get("--mono")).toMatch(/monospace/);
  });
});

describe("theme coverage", () => {
  /* Colours that must be re-declared per theme: a shared value would leave
     one theme with text or a surface that fails contrast. */
  const THEME_COLOURS = [
    "--paper",
    "--paper-2",
    "--sheet",
    "--rule",
    "--ink",
    "--ink-2",
    "--ink-3",
    "--pen",
    "--primary",
    "--primary-focus",
    "--on-primary",
    "--bg-pill",
    "--bg-pill-border",
  ];

  it.each(THEME_COLOURS)("overrides %s in the dark theme", (token) => {
    expect(LIGHT.has(token), token + " missing from :root").toBe(true);
    expect(DARK.has(token), token + " missing from [data-theme=dark]").toBe(
      true,
    );
    expect(DARK.get(token)).not.toBe(LIGHT.get(token));
  });
});

describe("WCAG AA contrast", () => {
  const PAIRS = [
    { fg: "--ink", bg: "--paper", note: "body text on the page" },
    { fg: "--ink", bg: "--paper-2", note: "body text on a raised surface" },
    { fg: "--ink-2", bg: "--paper", note: "secondary text on the page" },
    { fg: "--ink-2", bg: "--paper-2", note: "secondary text on a surface" },
    { fg: "--ink-3", bg: "--paper", note: "11px hints on the page" },
    { fg: "--ink-3", bg: "--paper-2", note: "11px hints on a surface" },
    { fg: "--on-primary", bg: "--primary", note: ".btn.primary label" },
    {
      fg: "--on-primary",
      bg: "--primary-focus",
      note: ".btn.primary:hover / focus label",
    },
  ];
  const MIN_RATIO = 4.5;

  for (const theme of [
    { name: "light", tokens: LIGHT },
    { name: "dark", tokens: DARK },
  ]) {
    describe(theme.name + " theme", () => {
      it.each(PAIRS)("$fg on $bg meets $note", ({ fg, bg }) => {
        const ratio = contrastRatio(theme.tokens.get(fg), theme.tokens.get(bg));
        expect(
          Number(ratio.toFixed(2)),
          fg +
            " on " +
            bg +
            " is " +
            ratio.toFixed(2) +
            ":1, needs " +
            MIN_RATIO,
        ).toBeGreaterThanOrEqual(MIN_RATIO);
      });
    });
  }

  it("computes contrast the way WCAG specifies", () => {
    expect(Number(contrastRatio("#ffffff", "#000000").toFixed(2))).toBe(21);
    expect(Number(contrastRatio("#ffffff", "#ffffff").toFixed(2))).toBe(1);
  });
});

describe("collapsed rail brand", () => {
  const sidebar = CSS_FILES.find((f) => f.name === "sidebar.css").css;

  /** Text of the first rule whose selector list starts with `selector`. */
  function ruleBody(selector) {
    const at = sidebar.indexOf(selector);
    if (at === -1) throw new Error("selector not found: " + selector);
    const open = sidebar.indexOf("{", at);
    return sidebar.slice(open + 1, sidebar.indexOf("}", open));
  }

  /* The brand is the app's home button. In the icon rail it is the one tile
     that must not join the grey-on-grey nav icons — and must not be hidden,
     which is where it started. */
  it("stays visible in the rail", () => {
    const hideList = ruleBody("#app.sidebar-collapsed .sb-title");
    expect(hideList).toContain("display: none !important");
    expect(hideList).not.toContain(".sb-brand");
  });

  it("wears the accent tint, not the nav grey", () => {
    const base = ruleBody("#app.sidebar-collapsed .sb-brand {");
    expect(base).toContain("color: var(--pen)");
    expect(base).toContain("background: var(--pen-soft)");

    const hover = ruleBody("#app.sidebar-collapsed .sb-brand:hover");
    expect(hover).toContain("var(--blue-15)");
    expect(hover).not.toContain("rgba(24, 24, 27");
  });
});

describe("model picker popup", () => {
  /* layout.css ships `#app *{ position: relative; z-index: 1 }`, which outranks
     any bare class — so a panel styled as `.model-dropdown{ position: absolute }`
     was laid out in flow instead and lived *inside* the composer: it stretched
     the input pill to the height of the whole catalogue and parked the pill at
     the top of that column. The escape hatch is the `#app ` prefix, and the
     open state needs it too, or `display: flex` loses to the id-scoped
     `display: none` that keeps the panel collapsed. */
  const chat = CSS_FILES.find((f) => f.name === "chat.css").css.replace(
    /\r\n/g,
    "\n",
  );

  it("anchors the panel out of flow above the composer", () => {
    const rule = /([^{}]+)\{([^{}]*bottom:\s*100%[^{}]*)\}/.exec(chat);
    expect(rule, "no rule sits the panel above the pill").toBeTruthy();
    expect(rule[1]).toContain("#app");
    expect(rule[2]).toContain("position: absolute");
    // It opens upward from the bottom of the window, so it needs its own cap.
    expect(rule[2]).toContain("max-height");
  });

  it("opens with a selector that outranks the closed state", () => {
    const at = chat.indexOf(".model-dropdown.open");
    expect(at).toBeGreaterThan(-1);
    const selector = chat
      .slice(chat.lastIndexOf("}", at) + 1, chat.indexOf("{", at))
      .trim();
    expect(selector).toContain("#app");
    expect(selector).toContain(".model-dropdown.open");
  });
});

describe("canonical width breakpoints", () => {
  /* Scale documented in src/styles/index.css. 980/981 are the sidebar
     drawer pair and must stay (chrome.js DRAWER_QUERY depends on 980). */
  const ALLOWED = new Set([
    "480px",
    "640px",
    "768px",
    "960px",
    "980px",
    "981px",
    "1150px",
  ]);

  function widthMediaQueries() {
    const found = [];
    for (const file of CSS_FILES) {
      const re = /@media\s*\((min|max)-width:\s*([^)]+)\)/g;
      let m;
      while ((m = re.exec(file.css)) !== null) {
        found.push({
          file: file.name,
          kind: m[1],
          value: m[2].trim(),
          raw: m[0],
        });
      }
    }
    return found;
  }

  it("only uses the canonical scale for width media queries", () => {
    const offenders = widthMediaQueries().filter(
      (q) => !ALLOWED.has(q.value),
    );
    expect(
      offenders,
      offenders.map((q) => q.file + ": " + q.raw).join("\n"),
    ).toEqual([]);
  });

  it("finds width queries at all (sanity: scanner works)", () => {
    expect(widthMediaQueries().length).toBeGreaterThan(10);
  });
});
