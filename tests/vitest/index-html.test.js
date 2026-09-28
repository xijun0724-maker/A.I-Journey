/**
 * Guards the SPA shell.
 *
 * GitHub Pages serves this repository as-is — `.github/workflows/static.yml`
 * uploads the working tree with no build step — so `index.html` (and the
 * external boot script it ships) is production code, not a dev convenience.
 * On 2026-09-24 an unterminated multi-line single-quoted string in the old
 * inline script made the whole block unparseable: the service-worker
 * registration and the "App failed to load" fallback silently never ran, so a
 * boot failure showed a permanent spinner instead of the diagnostic it was
 * written to show. That logic now lives in src/boot-fallback.js so
 * script-src can omit 'unsafe-inline'.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
const bootFallback = readFileSync(
  join(process.cwd(), "src", "boot-fallback.js"),
  "utf8",
);
const themeInit = readFileSync(
  join(process.cwd(), "src", "theme-init.js"),
  "utf8",
);

/** Collect the contents of every inline `<script>` (i.e. one without src). */
function inlineScripts(source) {
  const scripts = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(source))) scripts.push(match[1]);
  return scripts;
}

describe("index.html shell", () => {
  it("ships no inline scripts (CSP script-src has no unsafe-inline)", () => {
    expect(inlineScripts(html).length).toBe(0);
    expect(html).toContain("script-src 'self'");
    expect(html).not.toContain("script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'");
    expect(html).not.toContain("'unsafe-inline'; style-src");
  });

  it("loads main.js as an ES module from source", () => {
    expect(html).toContain('type="module" src="src/main.js"');
  });

  it("loads the external boot fallback (SW + loader diagnostic)", () => {
    expect(html).toContain('src="src/boot-fallback.js"');
    expect(bootFallback).toContain('register("sw.js")');
    expect(bootFallback).toContain("app-loader");
    // No ES-module import statements — must run as a classic script.
    expect(/^\s*import\s/m.test(bootFallback)).toBe(false);
  });

  it("defaults to dark and applies theme before first paint", () => {
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('src="src/theme-init.js"');
    // Pre-paint script must be classic (no imports) and default to dark.
    expect(/^\s*import\s/m.test(themeInit)).toBe(false);
    expect(themeInit).toContain('"dark"');
    expect(themeInit).toContain("journeyai.theme");
  });

  it("boot fallback parses as JavaScript", () => {
    expect(() => new Function(bootFallback)).not.toThrow();
    expect(() => new Function(themeInit)).not.toThrow();
  });

  it("wires the sidebar brand to the assistant landing page", () => {
    // The brand is the app's home affordance: clicking it starts a fresh
    // conversation, so the assistant shows its landing page. A brand that is
    // not a control is a dead affordance users click anyway.
    expect(html).toMatch(/<button[^>]*class="sb-brand"[^>]*data-act="chat-new"/);
  });

  it("registers the service worker with a relative path", () => {
    // An absolute "/sw.js" 404s on a project Pages site served from /<repo>/,
    // which silently disables the offline shell the README advertises.
    expect(bootFallback).not.toContain('register("/sw.js")');
    expect(bootFallback).toContain('register("sw.js")');
  });
});
