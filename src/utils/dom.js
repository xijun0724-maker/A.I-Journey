/**
 * DOM utility functions for Journey A.I
 * Query selectors, downloads, and DOM manipulation helpers.
 */

export function q(sel, root) {
  const doc = root || (typeof document !== "undefined" ? document : null);
  return doc ? doc.querySelector(sel) : null;
}

export function qa(sel, root) {
  const doc = root || (typeof document !== "undefined" ? document : null);
  return doc ? Array.prototype.slice.call(doc.querySelectorAll(sel)) : [];
}

// Apply `data-style` declarations through the CSSOM: CSP style-src carries no
// 'unsafe-inline', so a rendered element may not have a `style` attribute —
// the CSSOM write is what applies a colour, a computed width or a banner URL.
export function applyDataStyles(scope) {
  const root = scope || (typeof document !== "undefined" ? document : null);
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

export function ext(name) {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
}

// Toast notification; kind is info | ok | bad | warn.
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

export function toastSaved(msg) {
  toast(msg || "Saved.", "ok");
}
