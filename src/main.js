/**
 * Journey A.I — Main Entry Point
 *
 * Two failure surfaces:
 *   - `boot-fallback.js` (a classic script, loaded before the module graph)
 *     covers a module-graph load failure, which happens before any code in
 *     this file runs.
 *   - `boot()` renders its own error card for anything that throws while
 *     starting the app, and marks the app loaded on success; a throw from
 *     `boot()` itself lands here, on the same card.
 */

import { boot, renderErrorCard } from "./app/bootstrap.js";

function failStart(e) {
  console.error("Journey A.I: startup failed:", e);
  renderErrorCard("The application failed to start.", e);
}

function run() {
  boot().catch(failStart);
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", run);
else run();
