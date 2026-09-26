/**
 * Modal and confirmation dialog utilities for Journey A.I
 * Handles modal creation, confirmation dialogs, and focus management.
 */

import { q, qa, applyDataStyles } from "./dom.js";
import { esc } from "./helpers.js";

/**
 * Create and show a modal dialog
 * @param {Object} opts - Modal options
 * @param {string} opts.title - Modal title
 * @param {string} opts.body - Modal body HTML
 * @param {string} opts.footer - Modal footer HTML
 * @param {boolean} opts.wide - Use wide modal
 * @param {Function} opts.onMount - Callback when modal is mounted
 * @returns {Function} Close function
 */
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
    root.removeEventListener("keydown", trapFocus);
    if (previousFocus && document.contains(previousFocus))
      previousFocus.focus();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  /** Tab focus trap — keeps keyboard focus inside the modal dialog. */
  function trapFocus(e) {
    if (e.key !== "Tab") return;
    const focusable = modalEl.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  document.addEventListener("keydown", onKey);
  if (modalEl) modalEl.addEventListener("keydown", trapFocus);

  root.onclick = function (e) {
    if (e.target.dataset && e.target.dataset.close) close();
  };

  qa("[data-close]", root).forEach((b) => {
    b.addEventListener("click", close);
  });

  if (typeof opts.onMount === "function") {
    opts.onMount(q(".modal", root), close);
  }

  return close;
}

/**
 * Show a confirmation dialog
 * @param {string} message - Confirmation message
 * @param {Object} opts - Options
 * @param {string} opts.title - Dialog title
 * @param {string} opts.ok - OK button text
 * @param {boolean} opts.danger - Use danger styling
 * @returns {Promise<boolean>} True if confirmed
 */
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

    // Resolve(false) when dismissed via scrim / X / Escape
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

/**
 * Show a help modal with markdown content
 * @param {string} content - Markdown content
 */
export function helpModal(content) {
  modal({
    title: "How Journey A.I works",
    wide: true,
    body: content,
    footer: '<button class="btn primary" data-close="1">Got it</button>',
  });
}
