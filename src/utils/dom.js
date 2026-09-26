/**
 * DOM utility functions for Journey A.I
 * Query selectors, downloads, and DOM manipulation helpers.
 */

/**
 * Query selector shorthand
 * @param {string} sel - CSS selector
 * @param {Element} root - Root element (default: document)
 * @returns {Element|null} Found element
 */
export function q(sel, root) {
  const doc = root || (typeof document !== "undefined" ? document : null);
  return doc ? doc.querySelector(sel) : null;
}

/**
 * Query selector all shorthand (returns array)
 * @param {string} sel - CSS selector
 * @param {Element} root - Root element (default: document)
 * @returns {Element[]} Array of found elements
 */
export function qa(sel, root) {
  const doc = root || (typeof document !== "undefined" ? document : null);
  return doc ? Array.prototype.slice.call(doc.querySelectorAll(sel)) : [];
}

/**
 * Apply `data-style` declarations through the CSSOM.
 *
 * CSP `style-src` carries no 'unsafe-inline', so a rendered element may not
 * have a `style` attribute — an injected `<div style="…">` is refused, which
 * is the point. A handful of values cannot be a class (a course's chosen
 * colour, a computed bar width, a banner URL), and those travel as
 * `data-style="prop: value; …"` instead: `element.style.setProperty` is a
 * CSSOM write, which CSP does not govern, so the value is applied here once
 * the markup is in the document.
 *
 * The attribute is consumed as it is applied, so nothing is parsed twice and
 * an un-applied leftover is visible rather than silently inert.
 *
 * @param {Element|Document} [scope] - Root to scan (default: document)
 * @returns {number} How many elements were styled
 */
export function applyDataStyles(scope) {
  const root =
    scope || (typeof document !== "undefined" ? document : null);
  if (!root || !root.querySelectorAll) return 0;
  let n = 0;
  Array.prototype.forEach.call(root.querySelectorAll("[data-style]"), (el) => {
    const raw = el.getAttribute("data-style");
    el.removeAttribute("data-style");
    if (!raw) return;
    raw.split(";").forEach((decl) => {
      const i = decl.indexOf(":");
      if (i < 1) return;
      el.style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
    });
    n++;
  });
  return n;
}

/**
 * Read file as text
 * @param {File} file - File to read
 * @returns {Promise<string>} File content
 */
export function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () =>
      reject(new Error("The browser could not read this file."));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsText(file);
  });
}

/**
 * Get file extension from filename
 * @param {string} name - Filename
 * @returns {string} Extension (lowercase)
 */
export function ext(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
}

/**
 * Create a toast notification
 * @param {string} msg - Message
 * @param {string} kind - Type (info, ok, bad, warn)
 * @param {string} title - Optional title
 */
export function toast(msg, kind, title) {
  const host = q("#toasts");
  if (!host) return;
  const k = kind || "info";
  const el = document.createElement("div");
  el.className = "toast-item " + k;
  el.setAttribute("role", k === "bad" ? "alert" : "status");
  const content = document.createElement("div");
  content.className = "content";
  if (title) {
    const t = document.createElement("div");
    t.className = "title";
    t.textContent = String(title);
    content.appendChild(t);
  }
  const m = document.createElement("div");
  m.className = "message";
  m.textContent = String(msg);
  content.appendChild(m);
  el.appendChild(content);

  let timer = null;
  function dismiss() {
    if (timer) clearTimeout(timer);
    el.style.transition = "opacity .25s, transform .25s";
    el.style.opacity = "0";
    el.style.transform = "translateX(18px)";
    setTimeout(() => el.remove(), 260);
  }
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "close";
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", dismiss);
  el.appendChild(closeBtn);

  host.appendChild(el);
  const timeout = k === "bad" ? 6500 : 4200;
  timer = setTimeout(dismiss, timeout);
}

/**
 * Confirmation toast for a completed save action
 * @param {string} msg - Message (defaults to "Saved.")
 */
export function toastSaved(msg) {
  toast(msg || "Saved.", "ok");
}

// Export all functions as a namespace for backward compatibility
export const DOM = {
  q,
  qa,
  readAsText,
  ext,
  toast,
  toastSaved,
};

export default DOM;
