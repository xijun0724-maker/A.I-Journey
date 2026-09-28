// @vitest-environment happy-dom
/**
 * Tests for src/utils/feedback.js — modal, confirm
 * Covers: creation, ARIA, focus management, escape, scrim click
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { initFocusTrap } from "../../src/app/focus-trap.js";

/* Minimal DOM mock for Node environment */
function setupDOM() {
  const root = document.createElement("div");
  root.id = "modalRoot";
  document.body.appendChild(root);
  return root;
}

describe("Feedback", () => {
  let feedback;

  beforeEach(async () => {
    document.body.innerHTML = "";
    setupDOM();
    vi.resetModules();
    feedback = await import("../../src/utils/feedback.js");
  });

  describe("modal()", () => {
    it("creates a modal dialog with the given title", () => {
      feedback.modal({ title: "Test Modal" });
      const root = document.getElementById("modalRoot");
      expect(root.classList.contains("open")).toBe(true);
      expect(root.innerHTML).toContain("Test Modal");
      expect(root.innerHTML).toContain('role="dialog"');
    });

    it("includes aria-modal and aria-labelledby", () => {
      feedback.modal({ title: "Accessible Modal" });
      const modal = document.querySelector(".modal");
      expect(modal).toBeTruthy();
      expect(modal.getAttribute("aria-modal")).toBe("true");
      expect(modal.hasAttribute("aria-labelledby")).toBe(true);
    });

    it("renders body HTML when provided", () => {
      feedback.modal({ title: "T", body: "<p>Hello</p>" });
      expect(document.querySelector(".m-body").innerHTML).toContain("Hello");
    });

    it("renders a default close button when footer is omitted", () => {
      feedback.modal({ title: "T" });
      const foot = document.querySelector(".m-foot");
      expect(foot).toBeTruthy();
      expect(foot.innerHTML).toContain("Close");
    });

    it("hides footer when footer is explicitly null", () => {
      feedback.modal({ title: "T", footer: null });
      expect(document.querySelector(".m-foot")).toBeNull();
    });

    it("returns a close function that removes the modal", () => {
      const close = feedback.modal({ title: "T" });
      expect(typeof close).toBe("function");
      close();
      const root = document.getElementById("modalRoot");
      expect(root.classList.contains("open")).toBe(false);
      expect(root.innerHTML).toBe("");
    });

    it("adds wide class when opts.wide is true", () => {
      feedback.modal({ title: "T", wide: true });
      expect(document.querySelector(".modal.wide")).toBeTruthy();
    });

    it("calls onMount callback with the modal element and close function", () => {
      const cb = vi.fn();
      feedback.modal({ title: "T", onMount: cb });
      expect(cb).toHaveBeenCalledTimes(1);
      const [el, closeFn] = cb.mock.calls[0];
      expect(el.classList.contains("modal")).toBe(true);
      expect(typeof closeFn).toBe("function");
    });

    it("restores focus to the previously focused element on close", () => {
      const btn = document.createElement("button");
      document.body.appendChild(btn);
      btn.focus();
      const close = feedback.modal({ title: "T" });
      close();
      expect(document.activeElement).toBe(btn);
    });

    it("closes on Escape key press", () => {
      const close = feedback.modal({ title: "T" });
      const escEvent = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(escEvent);
      const root = document.getElementById("modalRoot");
      expect(root.classList.contains("open")).toBe(false);
    });

    it("closes on scrim click", () => {
      feedback.modal({ title: "T" });
      const scrim = document.querySelector(".scrim");
      expect(scrim).toBeTruthy();
      scrim.click();
      const root = document.getElementById("modalRoot");
      expect(root.classList.contains("open")).toBe(false);
    });

    it("traps Tab focus inside the modal", () => {
      /* The trap moved out of feedback.js to app/focus-trap.js (document-level,
         active only while #modalRoot is open). Install it here so the guarantee
         is asserted instead of assumed. */
      initFocusTrap();

      feedback.modal({
        title: "T",
        body: '<button id="first">First</button><button id="last">Last</button>',
      });
      const root = document.getElementById("modalRoot");
      expect(root.classList.contains("open")).toBe(true);

      /* Mirror the trap's own focusable query, so the assertions below run
         against the same element set the handler acts on. */
      const focusable = Array.from(
        root.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      expect(focusable.length).toBeGreaterThan(1);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      last.focus();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
      expect(document.activeElement).toBe(first);

      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
        }),
      );
      expect(document.activeElement).toBe(last);
    });

    it("does not trap Tab when only one focusable element exists", () => {
      feedback.modal({
        title: "T",
        body: '<button id="only">Only</button>',
      });
      const only = document.getElementById("only");
      only.focus();
      const tabEvent = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
      });
      document.querySelector(".modal").dispatchEvent(tabEvent);
      /* Should stay on the same element since there's only one */
      expect(document.activeElement).toBe(only);
    });
  });

  describe("confirm()", () => {
    it("returns a promise", () => {
      const result = feedback.confirm("Are you sure?");
      expect(result).toBeInstanceOf(Promise);
      feedback.modal({ title: "cleanup" }); // clean up
      document.getElementById("modalRoot").classList.remove("open");
    });

    it("shows the message in the modal body", () => {
      feedback.confirm("Delete this item?");
      expect(document.querySelector(".m-body").innerHTML).toContain(
        "Delete this item?",
      );
    });

    it("shows a custom title when provided", () => {
      feedback.confirm("Msg", { title: "Custom Title" });
      const titleEl = document.querySelector(".m-head h2");
      expect(titleEl.textContent).toBe("Custom Title");
    });

    it("has OK and Cancel buttons", () => {
      feedback.confirm("Msg");
      expect(document.querySelector("[data-ok]")).toBeTruthy();
      expect(document.querySelector("[data-cancel]")).toBeTruthy();
    });

    it("applies danger class when opts.danger is true", () => {
      feedback.confirm("Msg", { danger: true });
      expect(document.querySelector("[data-ok].danger")).toBeTruthy();
    });

    it("resolves true when OK is clicked", async () => {
      const p = feedback.confirm("Msg");
      document.querySelector("[data-ok]").click();
      expect(await p).toBe(true);
    });

    it("resolves false when Cancel is clicked", async () => {
      const p = feedback.confirm("Msg");
      document.querySelector("[data-cancel]").click();
      expect(await p).toBe(false);
    });

    it("resolves false when scrim is clicked", async () => {
      const p = feedback.confirm("Msg");
      document.querySelector(".scrim").click();
      expect(await p).toBe(false);
    });
  });
});
