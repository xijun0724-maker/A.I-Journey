// @vitest-environment happy-dom
/**
 * Tests for the shared sidebar Recents renderer in src/utils/format.js.
 * Both the router and the chat search render through these helpers.
 * Rows are conversations (one chat in the transcript = one row in the
 * list), not individual prompts — see Store.chat.conversations().
 */

import { describe, it, expect, beforeEach } from "vitest";
import { recentsHTML, renderRecents } from "../../src/utils/format.js";

const convos = [
  { cid: "c3", title: "Prompt" },
  { cid: "c2", title: "TM" },
  { cid: "c1", title: "Announcement" },
];

describe("recentsHTML()", () => {
  it("marks exactly the open conversation as active", () => {
    const html = recentsHTML(convos, { activeCid: "c2" });
    expect(html.match(/class="recent-chat-link active"/g)).toHaveLength(1);
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('data-cid="c2"');
    const active = html.slice(html.indexOf("active") - 60);
    expect(active).toContain("c2");
  });

  it("renders no active pill when nothing is open (landing page)", () => {
    const html = recentsHTML(convos);
    expect(html).not.toContain(" active");
    expect(html).not.toContain("aria-current");
  });

  it("makes every row open its own conversation", () => {
    const html = recentsHTML(convos);
    expect(html.match(/data-act="chat-open"/g)).toHaveLength(3);
    expect(html.match(/data-act="chat-remove-recent"/g)).toHaveLength(3);
    convos.forEach((c) => {
      expect(html).toContain('data-cid="' + c.cid + '"');
    });
  });

  it("truncates long titles in the label but keeps the full cid", () => {
    const html = recentsHTML([
      { cid: 'c"1', title: "x".repeat(80) },
    ]);
    expect(html).toContain("x".repeat(28) + "\u2026");
    expect(html).toContain('data-cid="c&quot;1"');
  });

  it("escapes markup in the label", () => {
    const html = recentsHTML([{ cid: "c1", title: "<b> & more" }]);
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt; &amp; more");
  });
});

describe("renderRecents()", () => {
  let list;

  beforeEach(() => {
    document.body.innerHTML = '<div id="recentChatList"></div>';
    list = document.getElementById("recentChatList");
  });

  it("writes one row per conversation and reports the count", () => {
    expect(renderRecents(list, convos)).toBe(3);
    expect(list.querySelectorAll(".recent-chat-link")).toHaveLength(3);
  });

  it("caps at five rows by default and honours limit 0 as unlimited", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      cid: "c" + i,
      title: "chat " + i,
    }));
    expect(renderRecents(list, many)).toBe(5);
    expect(renderRecents(list, many, { limit: 0 })).toBe(8);
  });

  it("clears the list when there is nothing to show", () => {
    list.innerHTML = "stale";
    expect(renderRecents(list, [])).toBe(0);
    expect(list.innerHTML).toBe("");
  });

  it("renders an empty label when a search has no hits", () => {
    const rows = renderRecents(list, [], {
      limit: 0,
      emptyLabel: "No matches",
    });
    expect(rows).toBe(0);
    expect(list.textContent.trim()).toBe("No matches");
  });

  it("round-trips a conversation id containing quotes through data-cid", () => {
    renderRecents(list, [{ cid: 'c "1"', title: "hi" }]);
    expect(list.querySelector(".recent-chat-link").dataset.cid).toBe(
      'c "1"',
    );
  });

  it("does not throw when the container is missing", () => {
    expect(() => renderRecents(null, convos)).not.toThrow();
    expect(renderRecents(null, convos)).toBe(0);
  });
});
