/**
 * App chrome wiring — theme toggle, sidebar collapse, profile dropdown.
 */

import { Store } from "../core/store.js";
import { Router } from "../core/router.js";
import { q } from "../utils/dom.js";
import { renderRecents } from "../utils/format.js";

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem("journeyai.theme");
  } catch (_e) {}
  if (!saved) {
    saved = "dark";
  }
  applyTheme(saved);

  [q("#btnThemeToggle"), q("#btnThemeToggleRail")]
    .filter(Boolean)
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        saved = saved === "dark" ? "light" : "dark";
        applyTheme(saved);
        try {
          localStorage.setItem("journeyai.theme", saved);
        } catch (_e) {}
      });
    });
  return saved;
}

/** Width at or below which the sidebar becomes an off-canvas drawer */
const DRAWER_QUERY = "(max-width: 980px)";

function isDrawerWidth() {
  return window.matchMedia ? window.matchMedia(DRAWER_QUERY).matches : false;
}

function initSidebar() {
  const app = q("#app");
  const sidebar = q(".sidebar");
  const toggle = q("#btnSidebarToggle");
  if (!app || !sidebar || !toggle) return;

  const scrim = q("#sbMobileScrim");

  let collapsed = false;
  try {
    collapsed = localStorage.getItem("journeyai.sidebarCollapsed") === "1";
  } catch (_e) {}

  const drawerOpen = () => sidebar.classList.contains("mobile-open");

  function apply() {
    app.classList.toggle("sidebar-collapsed", collapsed);
    /* The same button drives two different things: collapse the rail on
       desktop, open the drawer on narrow screens. */
    if (isDrawerWidth()) {
      const open = drawerOpen();
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      toggle.setAttribute("data-tooltip", open ? "Close menu" : "Open menu");
    } else {
      toggle.setAttribute("aria-expanded", String(!collapsed));
      const lbl = collapsed ? "Expand sidebar" : "Collapse sidebar";
      toggle.setAttribute("aria-label", lbl);
      toggle.setAttribute("data-tooltip", lbl);
    }
  }

  function setDrawer(open) {
    sidebar.classList.toggle("mobile-open", open);
    if (scrim) scrim.classList.toggle("open", open);
    apply();
  }

  apply();

  toggle.addEventListener("click", () => {
    if (isDrawerWidth()) {
      setDrawer(!drawerOpen());
      return;
    }
    collapsed = !collapsed;
    apply();
    try {
      localStorage.setItem("journeyai.sidebarCollapsed", collapsed ? "1" : "0");
    } catch (_e) {}
  });

  /* Tapping the scrim, picking a destination, or pressing Escape closes the drawer. */
  if (scrim) scrim.addEventListener("click", () => setDrawer(false));

  sidebar.addEventListener("click", (e) => {
    if (!drawerOpen()) return;
    const hit = e.target.closest ? e.target.closest("[data-act]") : null;
    if (hit) setDrawer(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawerOpen()) setDrawer(false);
  });

  /* Widening past the breakpoint must not leave a stray open drawer or scrim. */
  const mq = window.matchMedia ? window.matchMedia(DRAWER_QUERY) : null;
  if (mq) {
    const onChange = () => setDrawer(false);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}

function initProfileDropdown() {
  const btn = q("#btnProfile");
  const dropdown = q("#profileDropdown");
  if (!btn || !dropdown) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle("open");
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dropdown.classList.contains("open")) {
      dropdown.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
    }
  });

  dropdown.querySelectorAll("[data-act], a").forEach((item) => {
    item.addEventListener("click", () => {
      dropdown.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    });
  });
}

function renderProfile() {
  const nameEls = document.querySelectorAll(".sb-username");
  const avatarEls = document.querySelectorAll(".sb-avatar");
  const emailEl = document.querySelector(".sb-user-email");
  if (!nameEls.length && !avatarEls.length) return;

  const settings = (Store.db && Store.db.settings) || {};
  const rawName = settings.userName;
  const name = rawName && rawName.trim() ? rawName.trim() : "User";
  const email = settings.userEmail || "";

  nameEls.forEach((el) => {
    el.textContent = name;
  });

  if (emailEl) {
    emailEl.textContent = email;
  }

  const initials =
    name === "User"
      ? "U"
      : name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "U";

  avatarEls.forEach((el) => {
    el.textContent = initials;
  });
}

export function initChrome() {
  initTheme();
  initSidebar();
  initProfileDropdown();
  renderProfile();
  Store.on("load", renderProfile);
  Store.on("save", renderProfile);
}

/**
 * Toggle recent chats search box in the sidebar
 */
export function toggleSidebarChatSearch() {
  const recent = q("#sidebarRecent");
  if (!recent) return;
  let box = recent.querySelector(".sb-search-box");
  if (box) {
    box.remove();
    recent.classList.remove("sb-search-active");
    Router.scheduleRender();
    return;
  }
  box = document.createElement("div");
  box.className = "sb-search-box";
  box.innerHTML =
    '<input class="sb-search-input" type="text" placeholder="Search chats\u2026" aria-label="Search chats">';
  recent.prepend(box);
  recent.classList.add("sb-search-active");
  const input = box.querySelector("input");
  if (input) {
    input.focus();
    input.addEventListener("input", function () {
      const query = input.value.trim();
      if (!query) {
        Router.scheduleRender();
        return;
      }
      /* Filtered results are not "the current conversation", so no pill. */
      renderRecents(q("#recentChatList"), Store.chat.conversations(query), {
        limit: 0,
        emptyLabel: "No matches",
      });
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        input.value = "";
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
        box.remove();
        recent.classList.remove("sb-search-active");
        Router.scheduleRender();
      }
    });
  }
}
