/**
 * Pre-paint theme — classic script, no imports.
 *
 * Applied from <head> so data-theme is correct before first paint and a
 * light loader never flashes over the dark default (or vice versa).
 * Keep the default in sync with chrome.js initTheme() — both use "dark".
 * Loaded as an external script because CSP script-src has no 'unsafe-inline'.
 */
(function () {
  "use strict";
  let t = "dark";
  try {
    t = localStorage.getItem("journeyai.theme") || "dark";
  } catch (_e) {}
  document.documentElement.setAttribute("data-theme", t);

  /* Apply the preloaded Google Fonts sheet without blocking first paint.
     The link sits above this script, so the listener is attached before the
     response can land; the preload and the later stylesheet fetch share one
     cache entry, so nothing is downloaded twice. */
  const f = document.querySelector('link[rel="preload"][as="style"]');
  if (f) f.addEventListener("load", () => (f.rel = "stylesheet"));
})();
