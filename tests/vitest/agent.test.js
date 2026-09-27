import { describe, it, expect, beforeEach } from "vitest";
import { Store } from "../../src/core/store.js";
import { clearApiKey } from "../../src/utils/secure.js";
import { RAG } from "../../src/domain/rag.js";
import {
  StudyPlanAgent,
  AGENT_TOOLS,
  runTool,
  parseAgentAction,
  agentSystemPrompt,
} from "../../src/ai/agent.js";
import { CFG } from "../../src/config/constants.js";
import { isToolRequest, isToolResult } from "../../src/ai/client.js";

/** Arm the client's key checks so the agent loop runs instead of falling back. */
async function useRealKey() {
  const { setApiKey } = await import("../../src/utils/secure.js");
  Store.db.settings.aiEnabled = true;
  setApiKey("test-key-0123456789abcdef");
}

beforeEach(() => {
  Store.resetAll();
  clearApiKey();
  RAG.invalidate();
});

function seedBasic() {
  Store.db.courses.push({ id: "c1", code: "CS101", title: "Intro CS" });
  Store.db.events.push({
    id: "e1",
    courseId: "c1",
    title: "Midterm",
    type: "exam",
    due: new Date(Date.now() + 3 * 86400000).toISOString(),
    weight: 30,
    status: "todo",
    subtasks: [],
  });
}

describe("AGENT_TOOLS / agentSystemPrompt", () => {
  it("lists every tool name in the system prompt", () => {
    const prompt = agentSystemPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt).toContain("StudyPlanAgent");
    for (const t of AGENT_TOOLS) {
      expect(prompt).toContain(t.name);
    }
    expect(prompt).toContain('"final"');
  });

  it("exposes a non-empty tool catalogue", () => {
    expect(Array.isArray(AGENT_TOOLS)).toBe(true);
    expect(AGENT_TOOLS.length).toBeGreaterThanOrEqual(4);
    for (const t of AGENT_TOOLS) {
      expect(typeof t.name).toBe("string");
      expect(typeof t.description).toBe("string");
    }
  });
});

describe("parseAgentAction", () => {
  it("parses a tool call", () => {
    const a = parseAgentAction('{"tool":"list_deadlines","args":{"limit":3}}');
    expect(a.type).toBe("tool");
    expect(a.tool).toBe("list_deadlines");
    expect(a.args.limit).toBe(3);
  });

  it("parses a tool call without args", () => {
    const a = parseAgentAction('{"tool":"get_snapshot"}');
    expect(a.type).toBe("tool");
    expect(a.tool).toBe("get_snapshot");
    expect(a.args).toEqual({});
  });

  it("parses a final answer", () => {
    const a = parseAgentAction('{"final":"## This week\\n- do the thing"}');
    expect(a.type).toBe("final");
    expect(a.answer).toContain("This week");
  });

  it("falls back to answer key", () => {
    const a = parseAgentAction('{"answer":"plain plan"}');
    expect(a.type).toBe("final");
    expect(a.answer).toBe("plain plan");
  });

  it("returns text for non-JSON", () => {
    const a = parseAgentAction("Sure! Here is a plan...");
    expect(a.type).toBe("text");
    expect(a.text).toContain("Sure");
  });

  it("returns text for empty or invalid shapes", () => {
    expect(parseAgentAction("").type).toBe("text");
    expect(parseAgentAction(null).type).toBe("text");
    expect(parseAgentAction("[1,2]").type).toBe("text");
    expect(parseAgentAction('{"tool":""}').type).toBe("text");
  });
});

describe("runTool", () => {
  it("returns a snapshot object", () => {
    seedBasic();
    const snap = runTool("get_snapshot", {});
    expect(snap).toHaveProperty("courses");
    expect(snap).toHaveProperty("upcomingDeadlines");
    expect(snap.courses.length).toBeGreaterThanOrEqual(0);
  });

  it("lists deadlines with limit", () => {
    seedBasic();
    const list = runTool("list_deadlines", { limit: 5 });
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeLessThanOrEqual(5);
    if (list.length) {
      expect(list[0]).toHaveProperty("title");
      expect(list[0]).toHaveProperty("due");
    }
  });

  it("lists open tasks", () => {
    seedBasic();
    const list = runTool("list_open_tasks", { limit: 5 });
    expect(Array.isArray(list)).toBe(true);
    if (list.length) expect(list[0]).toHaveProperty("reason");
  });

  it("searches the library", () => {
    Store.db.documents.push({
      id: "doc1",
      courseId: null,
      name: "Bio notes",
      text: "The mitochondria is the powerhouse of the cell. It produces ATP through cellular respiration pathways.",
    });
    RAG.reindexAll();
    const hits = runTool("search_library", { query: "mitochondria ATP" });
    expect(Array.isArray(hits)).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].docName).toBe("Bio notes");
  });

  it("rejects empty search query", () => {
    const r = runTool("search_library", {});
    expect(r.error).toMatch(/query/i);
  });

  it("returns recommendations array", () => {
    const recs = runTool("get_recommendations", {});
    expect(Array.isArray(recs)).toBe(true);
  });

  it("returns week plan array", () => {
    const plan = runTool("get_week_plan", {});
    expect(Array.isArray(plan)).toBe(true);
  });

  it("returns error for unknown tool", () => {
    const r = runTool("nope_tool", {});
    expect(r.error).toMatch(/Unknown tool/);
  });
});

describe("StudyPlanAgent", () => {
  it("falls back to offline mode without an API key", async () => {
    const res = await StudyPlanAgent("plan my week", {
      chat: async () => {
        throw new Error("chat should not be called");
      },
    });
    expect(res.mode).toBe("offline");
    expect(res.text).toContain("## This week");
    expect(res.steps).toEqual([]);
    expect(res.toolsUsed).toEqual([]);
  });

  it("runs a tool call then a final answer with injected chat", async () => {
    // Force usable() true by mocking is hard without a key; inject allowOffline
    // and bypass usable by using the offline path? No — we need usable true.
    // Instead: spy on usable via a fake chat while settings force offline...
    // StudyPlanAgent checks usable() first. Without a key it returns offline.
    // So for this test we set a long enough fake key path.
    // secure.getApiKey reads sessionStorage; set one via setApiKey.
    const { setApiKey } = await import("../../src/utils/secure.js");
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");

    const replies = [
      '{"tool":"list_deadlines","args":{"limit":3}}',
      '{"tool":"get_snapshot","args":{}}',
      '{"final":"## This week\\n- Review CS101\\n\\n## Start now\\n- Midterm prep"}',
    ];
    let i = 0;
    const chatFn = async () => ({
      ok: true,
      text: replies[i++],
      model: "test-model",
      usage: { promptChars: 10, completionChars: 20 },
    });

    const res = await StudyPlanAgent("plan my week", {
      chat: chatFn,
      maxIters: 5,
    });

    expect(res.mode).toBe("ai");
    expect(res.model).toBe("test-model");
    expect(res.text).toContain("This week");
    expect(res.toolsUsed).toEqual(["list_deadlines", "get_snapshot"]);
    expect(res.steps).toHaveLength(2);
    expect(res.steps[0].ok).toBe(true);
    expect(res.steps[1].tool).toBe("get_snapshot");
    expect(res.usage).toBeDefined();
    clearApiKey();
  });

  it("handles tool execution errors without crashing", async () => {
    const { setApiKey } = await import("../../src/utils/secure.js");
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");

    const replies = [
      '{"tool":"search_library","args":{}}',
      '{"final":"Plan based on partial data."}',
    ];
    let i = 0;
    const res = await StudyPlanAgent("plan", {
      chat: async () => ({ ok: true, text: replies[i++], model: "m" }),
    });
    expect(res.mode).toBe("ai");
    expect(res.steps[0].ok).toBe(false);
    expect(res.steps[0].error).toMatch(/query/i);
    expect(res.toolsUsed).toEqual([]);
    expect(res.text).toContain("partial data");
    clearApiKey();
  });

  it("treats non-JSON replies as the final text", async () => {
    const { setApiKey } = await import("../../src/utils/secure.js");
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");

    const res = await StudyPlanAgent("plan", {
      chat: async () => ({
        ok: true,
        text: "Here is your plan in plain prose.",
        model: "m",
      }),
    });
    expect(res.mode).toBe("ai");
    expect(res.text).toContain("plain prose");
    clearApiKey();
  });

  it("falls back offline when chat fails", async () => {
    const { setApiKey } = await import("../../src/utils/secure.js");
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");

    const res = await StudyPlanAgent("plan", {
      chat: async () => ({ ok: false, error: "rate limited" }),
    });
    expect(res.mode).toBe("offline");
    expect(res.aiError).toBe("rate limited");
    expect(res.text).toContain("## This week");
    clearApiKey();
  });

  it("stops at the iteration limit and requests a final", async () => {
    const { setApiKey } = await import("../../src/utils/secure.js");
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");

    let calls = 0;
    const res = await StudyPlanAgent("plan", {
      maxIters: 2,
      chat: async () => {
        calls += 1;
        if (calls <= 2) {
          return {
            ok: true,
            text: '{"tool":"get_snapshot","args":{}}',
            model: "m",
          };
        }
        return {
          ok: true,
          text: '{"final":"## This week\\n- after limit"}',
          model: "m",
        };
      },
    });
    expect(calls).toBe(3);
    expect(res.text).toContain("after limit");
    expect(res.steps.length).toBe(2);
    clearApiKey();
  });

  it("returns a cancelled result without calling the model when already aborted", async () => {
    await useRealKey();
    const ctrl = new AbortController();
    ctrl.abort();
    let called = 0;
    const res = await StudyPlanAgent("go", {
      signal: ctrl.signal,
      chat: async () => {
        called += 1;
        return { ok: true, text: '{"final":"x"}' };
      },
    });
    expect(called).toBe(0);
    expect(res.mode).toBe("cancelled");
    expect(res.cancelled).toBe(true);
    expect(res.text).toBe("");
    expect(res.steps).toEqual([]);
    expect(res.toolsUsed).toEqual([]);
    expect(res.aiError).toBeNull();
  });

  it("stops mid-run when the caller aborts, and never falls back offline", async () => {
    await useRealKey();
    const ctrl = new AbortController();
    let calls = 0;
    const res = await StudyPlanAgent("go", {
      signal: ctrl.signal,
      chat: async () => {
        calls += 1;
        /* The stop lands while the model turn is in flight. */
        ctrl.abort();
        return {
          ok: true,
          text: '{"tool":"get_snapshot","args":{}}',
          model: "m",
          usage: { promptChars: 80, completionChars: 8 },
        };
      },
    });
    expect(calls).toBe(1);
    expect(res.mode).toBe("cancelled");
    expect(res.cancelled).toBe(true);
    expect(res.text).not.toContain("## This week");
    /* A stopped run is still accounted for. */
    expect(res.usage.calls).toBe(1);
    expect(res.usage.promptChars).toBe(80);
  });

  it("treats a chat-level cancel as a cancel, not a failure", async () => {
    await useRealKey();
    const res = await StudyPlanAgent("go", {
      chat: async () => ({ ok: false, error: "Cancelled.", cancelled: true }),
    });
    expect(res.mode).toBe("cancelled");
    expect(res.cancelled).toBe(true);
    expect(res.text).toBe("");
  });

  it("stops at the wall-clock ceiling and degrades to the offline plan", async () => {
    await useRealKey();
    let calls = 0;
    const res = await StudyPlanAgent("go", {
      wallClockMs: 2,
      chat: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 5));
        return {
          ok: true,
          text: '{"tool":"get_snapshot","args":{}}',
          model: "m",
          usage: { promptChars: 50, completionChars: 5 },
        };
      },
    });
    /* The second turn is never requested: the ceiling is checked first. */
    expect(calls).toBe(1);
    expect(res.mode).toBe("offline");
    expect(res.aiError).toMatch(/time budget/i);
    expect(res.text).toContain("## This week");
    expect(res.steps).toHaveLength(1);
    expect(res.usage.calls).toBe(1);
  });

  it("clamps each request timeout to the run budget and forwards the signal", async () => {
    await useRealKey();
    const ctrl = new AbortController();
    const seen = [];
    await StudyPlanAgent("go", {
      wallClockMs: 200,
      signal: ctrl.signal,
      timeout: CFG.timeouts.apiRefine,
      chat: async (_messages, opts) => {
        seen.push(opts);
        return { ok: true, text: '{"final":"ok"}' };
      },
    });
    expect(seen[0].signal).toBe(ctrl.signal);
    expect(seen[0].timeout).toBeLessThan(CFG.timeouts.apiRefine);
    expect(seen[0].timeout).toBeGreaterThanOrEqual(1000);
  });

  it("fences tool results and keeps each exchange paired", async () => {
    await useRealKey();
    const sent = [];
    const replies = ['{"tool":"get_snapshot","args":{}}', '{"final":"done"}'];
    let i = 0;
    await StudyPlanAgent("go", {
      chat: async (messages) => {
        sent.push(messages.slice());
        return { ok: true, text: replies[i++], model: "m" };
      },
    });

    const second = sent[1];
    const request = second[second.length - 2];
    const result = second[second.length - 1];

    expect(isToolRequest(request)).toBe(true);
    expect(isToolResult(result)).toBe(true);
    expect(result.content).toContain("<tool-result>");
    expect(result.content).toContain("</tool-result>");
    /* Raw JSON went in; data came out - no stray instruction surface. */
    expect(result.content.indexOf("TOOL_RESULT ")).toBe(0);
  });

  it("tells the model that tool results are data, not instructions", () => {
    expect(agentSystemPrompt()).toContain("<tool-result>");
    expect(agentSystemPrompt()).toMatch(/never instructions/i);
  });

  it("memoises identical tool calls instead of re-running them", async () => {
    await useRealKey();
    const replies = [
      '{"tool":"list_deadlines","args":{"limit":5,"only":true}}',
      /* Same call, reordered keys — still the same call. */
      '{"tool":"list_deadlines","args":{"only":true,"limit":5}}',
      '{"final":"done"}',
    ];
    let i = 0;
    const ran = [];
    const res = await StudyPlanAgent("go", {
      maxIters: 5,
      maxRepeats: 5,
      chat: async () => ({ ok: true, text: replies[i++], model: "m" }),
      tools: (name, args) => {
        ran.push(name);
        return { seen: args };
      },
    });
    expect(ran).toEqual(["list_deadlines"]);
    expect(res.steps).toHaveLength(2);
    expect(res.steps[0].cached).toBe(false);
    expect(res.steps[1].cached).toBe(true);
    expect(res.toolsUsed).toEqual(["list_deadlines"]);
  });

  it("breaks a degenerate identical-tool loop and asks once for a final", async () => {
    await useRealKey();
    const sent = [];
    let calls = 0;
    const res = await StudyPlanAgent("go", {
      chat: async (messages) => {
        calls += 1;
        sent.push(messages);
        if (calls <= 2)
          return {
            ok: true,
            text: '{"tool":"get_snapshot","args":{}}',
            model: "m",
          };
        return {
          ok: true,
          text: '{"final":"## This week\\n- recovered"}',
          model: "m",
        };
      },
    });
    expect(calls).toBe(3);
    expect(res.steps).toHaveLength(2);
    expect(res.mode).toBe("ai");
    expect(res.text).toContain("recovered");
    const nudge = sent[2].map((m) => m.content).join("\n");
    expect(nudge).toMatch(/repeated the same tool call/i);
  });

  it("aggregates usage across every model call, not just the last", async () => {
    await useRealKey();
    const replies = [
      {
        ok: true,
        text: '{"tool":"get_snapshot","args":{}}',
        usage: { promptChars: 100, completionChars: 10, droppedMessages: 0 },
      },
      {
        ok: true,
        text: '{"tool":"get_recommendations","args":{}}',
        usage: {
          promptChars: 200,
          completionChars: 20,
          truncated: true,
          droppedMessages: 3,
        },
      },
      {
        ok: true,
        text: '{"final":"plan"}',
        usage: { promptChars: 300, completionChars: 30, droppedMessages: 1 },
      },
    ];
    let i = 0;
    const res = await StudyPlanAgent("go", {
      chat: async () => replies[i++],
      maxIters: 5,
    });
    expect(res.usage.calls).toBe(3);
    expect(res.usage.promptChars).toBe(600);
    expect(res.usage.completionChars).toBe(60);
    expect(res.usage.truncated).toBe(true);
    expect(res.usage.droppedMessages).toBe(4);
  });

  it("reports no usage when no model call was billed", async () => {
    await useRealKey();
    const res = await StudyPlanAgent("go", {
      chat: async () => ({ ok: true, text: '{"final":"plain"}' }),
    });
    expect(res.usage).toBeNull();
  });

  it("accepts an injected tool runner", async () => {
    const { setApiKey } = await import("../../src/utils/secure.js");
    Store.db.settings.aiEnabled = true;
    setApiKey("test-key-0123456789abcdef");

    const replies = [
      '{"tool":"custom_tool","args":{"x":1}}',
      '{"final":"done"}',
    ];
    let i = 0;
    const seen = [];
    const res = await StudyPlanAgent("go", {
      chat: async () => ({ ok: true, text: replies[i++], model: "m" }),
      tools: (name, args) => {
        seen.push({ name, args });
        return { ok: true };
      },
    });
    expect(seen).toEqual([{ name: "custom_tool", args: { x: 1 } }]);
    expect(res.toolsUsed).toEqual(["custom_tool"]);
    expect(res.text).toBe("done");
    clearApiKey();
  });
});
