/**
 * Modal and confirmation dialog utilities for Journey A.I
 * Handles modal creation, confirmation dialogs, and focus management.
 */

import { q, applyDataStyles } from "./dom.js";
import { esc } from "./helpers.js";

// Create and show a modal dialog; opts: { title, body, footer, wide, onMount }.
// Returns the close function.
export function modal(opts) {
  const root = q("#modalRoot");
  const body = typeof opts.body === "string" ? opts.body : "";
  const previousFocus = document.activeElement;
  const titleId = "modal-title-" + Date.now();

  root.innerHTML =
    '<div class="scrim" data-close="1"></div>' +
    '<div class="modal' +
    (opts.wide ? " wide" : "") +
    '" role="dialog" aria-modal="true" aria-labelledby="' +
    titleId +
    '" tabindex="-1">' +
    '<div class="m-head"><h2 id="' +
    titleId +
    '" class="u-m-0">' +
    esc(opts.title || "") +
    '</h2><span class="spacer"></span>' +
    '<button class="x" data-close="1" aria-label="Close">×</button></div>' +
    '<div class="m-body">' +
    body +
    "</div>" +
    (opts.footer === null
      ? ""
      : '<div class="m-foot">' +
        (opts.footer || '<button class="btn" data-close="1">Close</button>') +
        "</div>") +
    "</div>";

  root.classList.add("open");
  /* Modal bodies carry data-style too (course banners, bullet colours). */
  applyDataStyles(root);
  const modalEl = q(".modal", root);
  if (modalEl) modalEl.focus();

  function close() {
    root.classList.remove("open");
    root.innerHTML = "";
    document.removeEventListener("keydown", onKey);
    if (previousFocus && document.contains(previousFocus))
      previousFocus.focus();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  document.addEventListener("keydown", onKey);

  root.onclick = function (e) {
    if (e.target.dataset && e.target.dataset.close) close();
  };

  if (typeof opts.onMount === "function") {
    opts.onMount(q(".modal", root), close);
  }

  return close;
}

// Show a confirmation dialog; opts: { title, ok, danger }. Resolves false when
// dismissed via scrim / X / Escape.
export function confirm(message, opts = {}) {
  return new Promise((resolve) => {
    let done = false;
    const close = modal({
      title: opts.title || "Please confirm",
      body: "<p>" + esc(message) + "</p>",
      footer:
        '<button class="btn" data-cancel="1">Cancel</button>' +
        '<button class="btn ' +
        (opts.danger ? "danger" : "primary") +
        '" data-ok="1">' +
        esc(opts.ok || "Confirm") +
        "</button>",
      onMount: (m) => {
        q("[data-ok]", m).addEventListener("click", () => {
          done = true;
          close();
          resolve(true);
        });
        q("[data-cancel]", m).addEventListener("click", () => {
          done = true;
          close();
          resolve(false);
        });
      },
    });

    const obs = new MutationObserver(() => {
      if (!q("#modalRoot").classList.contains("open")) {
        obs.disconnect();
        if (!done) resolve(false);
      }
    });
    obs.observe(q("#modalRoot"), {
      attributes: true,
      attributeFilter: ["class"],
    });
  });
}
