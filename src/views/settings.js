import { Store } from "../core/store.js";
import { CFG } from "../config/constants.js";
import { status } from "../ai/index.js";
import { Hybrid } from "../domain/rag-embeddings.js";
import { Standards } from "../config/standards/index.js";
import { esc, fmtBytes } from "../utils/helpers.js";
import { isLoaded } from "../utils/cdn.js";
import { keyStatus } from "../utils/secure.js";
import { statBox, pageHead, bar } from "./shared.js";

export function settings() {
  const s = Store.db.settings;
  const st = status();
  const usage = Store.usage();
  const libs = {
    pdf: isLoaded("pdf"),
    mammoth: isLoaded("mammoth"),
  };
  const usedPct = Math.round((usage.bytes / usage.cap) * 100);

  let h = pageHead(
    "Settings",
    "Connect an AI provider (Google Gemini or OpenRouter free models), set your available study hours, and manage your data.",
  );

  h += '<div class="grid g-2-1"><div class="grid gap-md">';

  /* AI provider */
  const provider = s.provider || "gemini";
  const provCfg = CFG.providers[provider] || CFG.providers.gemini;

  h +=
    '<div class="card"><div class="card-head"><h2>AI provider</h2><span class="spacer"></span>' +
    '<span class="badge ' +
    (st.on ? "ok" : "mute") +
    '">' +
    esc(st.on ? "connected: " + st.label : "offline mode") +
    "</span></div>";
  h +=
    '<div class="notice info mb"><div>Journey A.I works without an API key - the syllabus analyser, deadline extraction, task decomposition, retrieval and planner are all built in. Adding a key adds conversational explanations, tutoring modes and a written study plan. Syllabi are always parsed on-device.</div></div>';

  h += '<label class="fld"><span>Provider</span><select id="setProvider">';
  h +=
    '<option value="gemini"' +
    (provider === "gemini" ? " selected" : "") +
    ">Google Gemini</option>";
  h +=
    '<option value="openrouter"' +
    (provider === "openrouter" ? " selected" : "") +
    ">OpenRouter (free models)</option>";
  h += "</select></label>";

  if (provider === "openrouter") {
    h +=
      '<label class="fld"><span>OpenRouter model</span><select id="setModel">';
    CFG.openrouter.freeModels.forEach(function (m) {
      h +=
        '<option value="' +
        m.id +
        '"' +
        ((s.model || CFG.openrouter.model) === m.id ? " selected" : "") +
        ">" +
        esc(m.label) +
        "</option>";
    });
    h += "</select></label>";
  }

  const ks = keyStatus(provider);
  if (ks && ks.expired) {
    h +=
      '<div class="notice warn mb"><div>Your saved key expired after 30 days without use — paste it again to keep AI answers on.</div></div>';
  }

  const keyBadge = s.apiKey
    ? ' <span class="badge ok">stored in this browser</span>'
    : ks && ks.expired
      ? ' <span class="badge warn">expired</span>'
      : "";

  h +=
    '<label class="fld"><span>' +
    provCfg.label +
    " API key" +
    keyBadge +
    "</span>" +
    '<input id="setKey" type="password" value="" autocomplete="off" spellcheck="false" placeholder="' +
    (s.apiKey
      ? "••••••••  - leave blank to keep the stored key"
      : provCfg.keyHint) +
    '"></label>' +
    '<p class="hint">Get a free key at <a href="' +
    provCfg.keyUrl +
    '" target="_blank" rel="noopener">' +
    provCfg.keyUrl.replace("https://", "") +
    "</a>.</p>";
  if (s.apiKey)
    h +=
      '<button class="btn sm ghost mb" data-act="ai-key-clear">Clear the stored key</button>';
  h +=
    '<label  class="row small u-gap-8"><input type="checkbox" id="setAiEnabled"' +
    (s.aiEnabled ? " checked" : "") +
    "> Use the AI provider when a key is present</label>";
  h +=
    '<div class="row mt"><button class="btn primary" data-act="settings-save">Save</button>' +
    '<button class="btn" data-act="ai-test">Test connection</button>' +
    '<span id="aiTestMsg" class="small"></span></div>';
  h +=
    '<p class="hint">The key is kept in this browser session and sent directly from your browser to the provider. It never passes through any server of ours.</p>';

  /* Tutor mode */
  const tutorMode = s.tutorMode || "auto";
  h +=
    '<div class="card"><div class="card-head"><h2>Tutor mode</h2></div>' +
    '<div class="notice info mb"><div>Choose how the AI tutor responds: <strong>Explain</strong> gives full step-by-step answers. <strong>Socratic</strong> asks guiding questions so you discover the answer. <strong>Hint</strong> gives a single keyword or nudge. <strong>Automatic</strong> starts with full answers and fades toward questions, then nudges, as your recall practice improves &mdash; you can pin any level at any time.</div></div>' +
    '<label class="fld"><span>Guidance level</span><select id="setTutorMode">' +
    '<option value="auto"' +
    (tutorMode === "auto" ? " selected" : "") +
    ">Automatic (fades as I improve)</option>" +
    '<option value="explain"' +
    (tutorMode === "explain" ? " selected" : "") +
    ">Explain (full answers)</option>" +
    '<option value="socratic"' +
    (tutorMode === "socratic" ? " selected" : "") +
    ">Socratic (guiding questions)</option>" +
    '<option value="hint"' +
    (tutorMode === "hint" ? " selected" : "") +
    ">Hint (single nudge)</option>" +
    "</select></div>";

  /* Syllabus standard */
  const standardsList = Standards.list();
  const currentStandard = s.syllabusStandard || Standards.DEFAULT_ID;
  h +=
    '<div class="card"><div class="card-head"><h2>Syllabus standard</h2></div>' +
    '<div class="notice info mb"><div>Used when reviewing imported syllabi for required sections, grading totals and session coverage. Switch between the PNU CMI template and a generic higher-education checklist.</div></div>' +
    '<label class="fld"><span>Standard</span><select id="setSyllabusStandard">';
  standardsList.forEach(function (std) {
    h +=
      '<option value="' +
      esc(std.id) +
      (currentStandard === std.id ? '" selected>' : '">') +
      esc(std.label) +
      (std.builtin ? "" : " (custom)") +
      "</option>";
  });
  h +=
    "</select></label>" +
    '<p class="hint">Custom standards can be registered from code via <code>Standards.register()</code>.</p></div>';

  /* study preferences */
  h +=
    '<div class="card"><div class="card-head"><h2>Study preferences</h2></div>' +
    '<div class="grid g2">' +
    '<label class="fld"><span>Study hours on a weekday</span><input id="setWeekday" type="number" min="0" max="16" step="0.5" value="' +
    s.studyWeekday +
    '"></label>' +
    '<label class="fld"><span>Study hours on a weekend day</span><input id="setWeekend" type="number" min="0" max="16" step="0.5" value="' +
    s.studyWeekend +
    '"></label>' +
    "</div>" +
    '<div class="grid g3">' +
    '<label class="fld"><span>Default view</span><select id="setDefaultView">' +
    '<option value="dashboard"' +
    (s.defaultView === "dashboard" || s.defaultView === "student"
      ? " selected"
      : "") +
    ">Dashboard</option>" +
    "</select></label>" +
    '<label class="fld"><span>Planner horizon (weeks)</span><input id="setWeeks" type="number" min="1" max="20" value="' +
    s.plannerWeeks +
    '"></label>' +
    "</div>" +
    '<div class="grid g4">' +
    '<label class="fld"><span>Academic Year</span><input id="setAcademicYear" placeholder="2026–2027" value="' +
    esc(s.academicYear || "2026–2027") +
    '"></label>' +
    '<label class="fld"><span>Term / Semester</span><input id="setTermName" placeholder="1st Term" value="' +
    esc(s.termName || "1st Term") +
    '"></label>' +
    '<label class="fld"><span>Term starts</span><input id="setTermStart" type="date" value="' +
    esc(s.termStart || "") +
    '"></label>' +
    '<label class="fld"><span>Term ends</span><input id="setTermEnd" type="date" value="' +
    esc(s.termEnd || "") +
    '"></label>' +
    "</div>" +
    '<p class="hint">Term dates anchor week numbers, calculate academic progress, and resolve syllabus dates.</p>' +
    '<div  class="mt u-row-wrap-8">' +
    '<button class="btn primary" data-act="settings-save">Save preferences</button>' +
    '<button type="button" class="btn" data-act="academic-calendar-modal">Configure Academic Calendar</button>' +
    '</div></div>';

  /* data */
  h +=
    '<div class="card"><div class="card-head"><h2>Your data</h2></div>' +
    '<div class="grid g4 mb">' +
    statBox(Store.db.courses.length, "Courses") +
    statBox(Store.db.events.length, "Tasks") +
    statBox(Store.db.documents.length, "Documents") +
    statBox(Store.db.lessons.length, "Topics") +
    "</div>" +
    '<div class="row mb-s tiny muted"><span>Browser storage</span><span class="spacer"></span><span>' +
    usage.pretty +
    " of ~" +
    fmtBytes(usage.cap) +
    " (" +
    usedPct +
    "%)</span></div>" +
    bar(usedPct, usedPct > 80 ? "bad" : usedPct > 60 ? "warn" : "ok") +
    '<div class="row mt">' +
    '<button class="btn" data-act="data-export">Export everything (JSON)</button>' +
    '<button class="btn" data-act="data-import">Import a backup</button>' +
    '<button class="btn" data-act="demo-load">Import course file</button>' +
    '<button class="btn" data-act="term-load">Load Term 2 syllabi (12 weeks)</button>' +
    '<button class="btn danger" data-act="data-reset">Reset all data</button>' +
    "</div>" +
    '<p class="hint">Everything lives in this browser. Export a JSON backup before clearing site data or switching devices.</p></div>';

  h += "</div>";

  /* right column */
  h += '<div class="grid gap-md">';
  h +=
    '<div class="card"><div class="card-head"><h3>Capability check</h3></div>' +
    '<div class="kv"><span class="k">PDF parsing (pdf.js)</span><span class="v">' +
    (libs.pdf
      ? '<span class="badge ok">ready</span>'
      : '<span class="badge info">on-demand</span>') +
    "</span></div>" +
    '<div class="kv"><span class="k">Word parsing (mammoth)</span><span class="v">' +
    (libs.mammoth
      ? '<span class="badge ok">ready</span>'
      : '<span class="badge info">on-demand</span>') +
    "</span></div>" +
    '<div class="kv"><span class="k">Retrieval index</span><span class="v">' +
    (Store.db.chunks || []).length +
    " passages</span></div>" +
    '<div class="kv"><span class="k">Hybrid retrieval</span><span class="v">' +
    (s.hybridRAG
      ? '<span class="badge ok">on</span>'
      : '<span class="badge mute">off (BM25)</span>') +
    "</span></div>" +
    '<label  class="row small u-gap-8-mt-6"><input type="checkbox" id="setHybridRAG"' +
    (s.hybridRAG ? " checked" : "") +
    "> Enable hybrid retrieval (BM25 + embeddings)</label>" +
    '<p class="hint">Off by default. When on, loads a small ONNX embedding model from a CDN on first use and blends it with BM25. Falls back to pure BM25 if the model is unavailable.</p>' +
    '<div class="kv"><span class="k">Offline capability</span><span class="v"><span class="badge ok">full</span></span></div>' +
    '<button class="btn block sm mt" data-act="reindex">Rebuild retrieval index</button></div>';

  h +=
    '<div class="card"><div class="card-head"><h3>Privacy</h3></div>' +
    '<p class="small muted">Documents are parsed in your browser and stored in this browser. They are only sent anywhere when you ask the assistant a question with an AI provider connected - then the retrieved passages (not the whole library) plus your question go to that provider. Without a key, nothing leaves the device at all.</p></div>';

  h +=
    '<div class="card"><div class="card-head"><h3>Danger zone</h3></div>' +
    '<p class="small muted">Resetting removes every course, task, document and chat message from this browser. Export a backup first if you want to keep it.</p>' +
    '<button class="btn danger block sm" data-act="data-reset">Reset everything</button></div>';
  h += "</div></div>";
  return '<div class="view-padded">' + h + "</div>";
}

export function afterSettings(root) {
  const sel = root.querySelector("#setTutorMode");
  if (sel) {
    sel.addEventListener("change", function () {
      Store.db.settings.tutorMode = sel.value;
      Store.saveNow();
    });
  }
  const std = root.querySelector("#setSyllabusStandard");
  if (std) {
    std.addEventListener("change", function () {
      Store.db.settings.syllabusStandard = std.value;
      Store.saveNow();
    });
  }
  const hybrid = root.querySelector("#setHybridRAG");
  if (hybrid) {
    hybrid.addEventListener("change", function () {
      Store.db.settings.hybridRAG = hybrid.checked;
      if (!hybrid.checked) Hybrid.reset();
      Store.saveNow();
    });
  }
}

export const settingsView = {
  title: "Settings",
  fn: settings,
  after: afterSettings,
};
