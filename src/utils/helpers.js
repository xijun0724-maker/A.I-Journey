/**
 * Core utility functions for Journey A.I
 * Pure functions with no external dependencies.
 */

export function uid(prefix = "id") {
  return (
    prefix +
    "_" +
    Math.random().toString(36).slice(2, 9) +
    Date.now().toString(36).slice(-3)
  );
}

export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Sanitize a URL destined for a CSS url(...) sink: data:image, http(s),
// same-origin paths and blob only, with url()-breaking characters stripped.
export function safeCssUrl(url) {
  const s = String(url == null ? "" : url).trim();
  if (!s) return "";
  const allowed =
    /^data:image\//i.test(s) ||
    /^https?:\/\//i.test(s) ||
    /^\/(?!\/)/.test(s) ||
    /^blob:/.test(s) ||
    /^\.\.?\//.test(s);
  if (!allowed) return "";
  return s.replace(/["'\\)<>\s]/g, "");
}

// Sanitize a color destined for an inline-style sink: hex, rgb/rgba, hsl/hsla,
// CSS variables and simple named colors only, else a neutral fallback.
export function safeColor(c) {
  const s = String(c == null ? "" : c).trim();
  if (!s) return "";
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if (
    /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/i.test(s)
  )
    return s;
  if (
    /^hsla?\(\s*[\d.]+(\w+)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*(,\s*[\d.]+\s*)?\)$/i.test(
      s,
    )
  )
    return s;
  if (/^var\(--[a-z0-9-]+\)$/i.test(s)) return s;
  if (/^[a-z]{3,20}$/i.test(s)) return s;
  return "";
}

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function sum(arr, f) {
  return (arr || []).reduce((t, x) => t + (f ? f(x) : x) || 0, 0);
}

export function uniq(arr) {
  return [...new Set(arr)];
}

export function groupBy(arr, f) {
  const o = {};
  (arr || []).forEach((x) => {
    const k = typeof f === "function" ? f(x) : x[f];
    (o[k] = o[k] || []).push(x);
  });
  return o;
}

export function sortBy(arr, f, dir) {
  return (arr || []).toSorted((a, b) => {
    const x = f(a),
      y = f(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    if (x < y) return dir === -1 ? 1 : -1;
    if (x > y) return dir === -1 ? -1 : 1;
    return 0;
  });
}

export function debounce(fn, ms) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms || 200);
  };
}

export function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function pct(n, d) {
  if (!d) return 0;
  return clamp(Math.round((n / d) * 100), 0, 100);
}

export function minutesToHM(m) {
  m = Math.max(0, Math.round(m || 0));
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60),
    r = m % 60;
  return r ? h + "h " + r + "m" : h + "h";
}

export function fmtBytes(b) {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + u[i];
}

export function csv(rows) {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c == null ? "" : c);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(","),
    )
    .join("\n");
}
