/**
 * Journey A.I - Main Entry Point
 * Keeps the root bootstrap separated from the app shell so the structure is
 * cleaner and easier to extend.
 *
 * Three failure surfaces, each covering a gap the others cannot:
 *   - `index.html`'s inline fallback catches a module-graph load failure, which
 *     happens before any code in this file runs.
 *   - `boot()` renders its own error card for anything that throws while
 *     starting the app, and marks the app loaded on success.
 *   - this file catches an unsupported browser, and defensively a throw from
 *     `boot()` itself.
 */

import { boot } from "./app/bootstrap.js";
import { act } from "./core/actions/index.js";
import { Store } from "./core/store.js";
import { UIState, Views, UI } from "./core/state.js";
import { Router } from "./core/router.js";

function showDiagnostic(message, errors) {
  const root = document.getElementById("viewRoot");
  if (!root) return;
  const errList = Array.isArray(errors) ? errors : [errors];
  const errHtml = errList
    .map(
      (e) =>
        `<div class="u-err-key">
      ${String((e && e.message) || e).replace(/[<>&"']/g, "")}
    </div>`,
    )
    .join("");

  root.innerHTML = `
    <div class="u-panel-560">
      <div class="u-err-card">
        <h2 class="u-err-title">\u26a0 Application Error</h2>
        <p class="u-err-lead">${String(message).replace(/[<>&"']/g, "")}</p>
        <div class="u-mb-16">
          <strong class="u-eyebrow">Error details:</strong>
          ${errHtml}
        </div>
        <div class="u-err-box">
          <p class="u-err-label">
            <strong>Troubleshooting steps:</strong>
          </p>
          <ol class="u-err-list">
            <li>Open browser Developer Tools (F12) and check the <strong>Console</strong> tab</li>
            <li>Check the <strong>Network</strong> tab for failed resource loads</li>
            <li>Try disabling browser extensions temporarily</li>
            <li>Try an incognito/private window to rule out extension interference</li>
            <li>Clear browser cache and service workers</li>
          </ol>
        </div>
        <div class="u-flex-8">
          <button class="btn primary" id="diagReloadBtn">Reload page</button>
          <button class="btn" id="diagClearBtn">
            Clear all data &amp; reload
          </button>
        </div>
      </div>
    </div>
  `;
  const reloadBtn = document.getElementById("diagReloadBtn");
  const clearBtn = document.getElementById("diagClearBtn");
  if (reloadBtn)
    reloadBtn.addEventListener("click", function () {
      location.reload();
    });
  if (clearBtn)
    clearBtn.addEventListener("click", function () {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (_e) {}
      location.reload();
    });
}

/** Check the browser APIs the app cannot run without. */
function checkBrowserSupport() {
  const issues = [];
  if (typeof localStorage === "undefined" || localStorage === null) {
    issues.push(
      new Error(
        "localStorage is not available (may be disabled or in private browsing mode)",
      ),
    );
  }
  if (typeof sessionStorage === "undefined" || sessionStorage === null) {
    issues.push(new Error("sessionStorage is not available"));
  }
  if (typeof fetch === "undefined") {
    issues.push(new Error("fetch API is not available"));
  }
  if (typeof document === "undefined") {
    issues.push(
      new Error("document is not available - running in wrong environment"),
    );
  }
  return issues;
}

function failStart(e) {
  console.error("Journey A.I: startup failed:", e);
  showDiagnostic("The application failed to start.", e);
}

async function startApp() {
  const supportIssues = checkBrowserSupport();
  if (supportIssues.length > 0) {
    showDiagnostic(
      "Your browser does not support all required features.",
      supportIssues,
    );
    return;
  }

  // boot() handles its own startup failures and marks the app loaded; this
  // guard covers a throw (or rejection) from boot() itself.
  try {
    await boot();
  } catch (e) {
    failStart(e);
  }
}

function run() {
  const result = startApp();
  if (result && typeof result.catch === "function") result.catch(failStart);
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", run);
else run();

export { boot, act, Store, UIState, Views, UI, Router };
