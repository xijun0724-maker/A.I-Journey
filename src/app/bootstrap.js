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

    // Reactive seam: render automatically whenever Store mutations occur,
    // and invalidate RAG index when library documents or courses change.
    Store.on("change", ({ entity }) => {
      Router.scheduleRender();
      if (entity === "documents" || entity === "courses" || entity === "all") {
        RAG.invalidate();
      }
    });

    // Hide loader once app is ready
    const app = document.getElementById("app");
    if (app) {
      app.classList.add("loaded");
    }
  } catch (e) {
    // Prevent white screen on bootstrap failure
    console.error("Journey A.I: bootstrap failed:", e);
    const root = document.getElementById("viewRoot");
    if (root) {
      const errText =
        (e && e.message ? String(e.message) : "Unknown error").replace(
          /[<>&"']/g,
          "",
        ) || "Unknown error";
      root.innerHTML = `
        <div  class="card u-panel-480">
          <h2>Something went wrong</h2>
          <p  class="small mono u-my-12">${errText}</p>
          <p  class="small muted u-mb-16">
            The app could not start. Try reloading the page.
          </p>
          <button class="btn primary" id="bootReloadBtn">Reload page</button>
          <button  class="btn u-ml-8" id="bootResetBtn">
            Reset data and reload
          </button>
        </div>
      `;
      const reloadBtn = document.getElementById("bootReloadBtn");
      const resetBtn = document.getElementById("bootResetBtn");
      if (reloadBtn)
        reloadBtn.addEventListener("click", function () {
          location.reload();
        });
      if (resetBtn)
        resetBtn.addEventListener("click", function () {
          try {
            localStorage.clear();
          } catch (_e) {}
          location.reload();
        });
    }
  }
}

export { boot };
export default { boot };
