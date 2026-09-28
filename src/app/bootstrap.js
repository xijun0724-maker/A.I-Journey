/**
 * Application bootstrap layer.
 * Thin orchestrator that imports focused modules and runs the startup sequence.
 * Wraps everything in error handling to prevent white-screen failures.
 */

import { Store } from "../core/store.js";
import { Router } from "../core/router.js";
import { registerAll as registerViews } from "../views/index.js";
import { RAG } from "../domain/rag.js";
import { hydrateKey } from "../utils/secure.js";
import "../utils/extract.js";

import { initScrollReveal } from "./scroll-reveal.js";
import { initActionDelegation } from "./actions-delegation.js";
import { initChrome } from "./chrome.js";
import { initFocusTrap } from "./focus-trap.js";
import { initLifecycle } from "./lifecycle.js";

/**
 * The one error card, shared by this file's own failure path and by
 * `main.js`, so a startup failure always paints the same surface in
 * `#viewRoot` with the same two ways out.
 */
export function renderErrorCard(message, errors) {
  const root = document.getElementById("viewRoot");
  if (!root) return;
  const errList =
    errors === null || errors === undefined
      ? []
      : Array.isArray(errors)
        ? errors
        : [errors];
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
        <h2 class="u-err-title">⚠ Application Error</h2>
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

async function boot() {
  try {
    // Sync localStorage first so a blank/corrupt mirror never blocks paint;
    // then adopt the IndexedDB snapshot if it is newer, before any view reads.
    Store.load();
    await Store.hydrateFromIDB();
    hydrateKey(Store.db.settings);

    registerViews(Router);

    const needsIndex =
      !(Store.db.chunks || []).length &&
      Store.db.documents.some((d) => (d.text || "").length > 200);
    if (needsIndex && !Store.isQuarantined()) RAG.reindexAll();
    if (!Store.isQuarantined()) Store.saveNow();

    initScrollReveal();
    initActionDelegation();
    initChrome();
    initFocusTrap();
    initLifecycle();
    Router.init();

    // Reactive seam: render automatically whenever Store mutations occur.
    // The policy — *what* each mutation repaints — lives in one place,
    // Router.onStoreChange: chat appends repaint Recents only (the
    // assistant paints its own transcript), everything else repaints the
    // view. Retrieval cache freshness is RAG's own concern — it subscribes
    // to this same change seam in domain/rag.js, so no caller has to
    // invalidate.
    Store.on("change", Router.onStoreChange);

    // Hide loader once app is ready
    const app = document.getElementById("app");
    if (app) {
      app.classList.add("loaded");
    }
  } catch (e) {
    // Prevent white screen on bootstrap failure
    console.error("Journey A.I: bootstrap failed:", e);
    renderErrorCard("The application failed to start.", e);
  }
}

export { boot };
