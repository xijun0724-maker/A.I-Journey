# Journey A.I — Architecture

Journey A.I is a single-page web app written in **vanilla JavaScript (ES modules)**. There is **no backend**: no FastAPI, no PostgreSQL, no React, no LangChain, no vector database. Persistence is `localStorage`; retrieval is BM25 in the browser; AI calls go directly from the page to OpenRouter over `fetch()`.

> Note: `docs/architecture.md` is the short module-layer tour; this root document is the source of truth for the stack, the invariants and the refactor baseline.

## Stack

| Concern | Actual implementation |
| --- | --- |
| UI | Vanilla JS string-rendered views into `#viewRoot`; hash router (`src/core/router.js`) |
| State / persistence | `localStorage` key `journeyai.db.v1` (sync bootstrap) + IndexedDB mirror `journeyai/kv` (async, larger capacity), schemaVersion 4 (`src/core/store.js`, `src/core/idb.js`, `src/config/settings.js`) |
| API keys | `sessionStorage` only (`src/utils/secure.js`): per-provider record, last-used stamp, TTL; not encrypted (a browser cannot hide a secret from same-origin script), stripped before persist |
| RAG | Lexical BM25 index over chunked documents (`src/domain/rag.js`); optional hybrid BM25 + ONNX re-rank (`src/domain/rag-embeddings.js`, off by default via `settings.hybridRAG`) |
| AI provider | OpenRouter via browser `fetch()` (`src/ai/client.js`) |
| Offline fallback | Rule-based extractive answers (`src/ai/offline.js`) |
| Styling | CSS custom properties in `src/styles/` (tokens, layout, components); every token read without a fallback must be declared there (`tests/vitest/styles.test.js`); width breakpoints limited to the canonical scale in `src/styles/index.css` (same test file) |
| Build / test | Vite 5 + Vitest 2 (`vite.config.js`); zero runtime npm dependencies |
| Lint / format | ESLint 9 flat config (`eslint.config.js`); Prettier 3; Stylelint 17 (`lint:css`) |
| CI | GitHub Actions (`.github/workflows/static.yml`): a `verify` job runs install, lint (`--max-warnings 0`), tests and build; the Pages `deploy` job declares `needs: verify` |

## Module layers

```
index.html (SPA shell, CSP meta, inline load-failure fallback)
  → src/main.js (entry: browser-support check, then boot)
    → src/app/ (bootstrap, chrome, focus-trap, lifecycle, actions-delegation, scroll-reveal)
      → src/core/ (router, state/scope, store, actions/)
      → src/views/ (screen renderers incl. calendar + modals/)
      → src/domain/ (tasks, nlp, rag, rag-embeddings, planner, academic-calendar, coach, dashboard, pipeline)
      → src/ai/ (client, prompts, offline, snapshot, agent, index)
      → src/utils/ (date, dom, helpers, format, feedback, markdown, secure, extract, cdn)
      → src/config/ (constants CFG, settings schema/migrations, templates, standards/)
      → localStorage (sync bootstrap) + sessionStorage (API keys)
      → IndexedDB (async mirror, restored when localStorage is missing/older)
```

## Data model (`Store.db`)

- `courses[]`, `lessons[]`, `events[]` (subtasks), `readings[]`
- `documents[]` (full text, max `CFG.maxDocChars`), `chunks[]` (BM25 ranges)
- `chat[]` (tutor history, sliced to `CFG.maxChatMessages`)
- `activity[]`, `plan[]`, `planMeta`, `settings`

## Design constraints (keep these invariants)

1. **Zero runtime dependencies** — business logic stays vanilla ESM; the only CDN UMD libs are pdf.js and mammoth for PDF/DOCX extraction (`src/utils/cdn.js`). There is no charting library.
2. **Offline-first** — NLP and RAG are deterministic; AI paths degrade to `offlineAnswer` / `offlineStudyPlan`.
3. **Keys never persist** — `stripKey()` before every `localStorage` / IndexedDB write; keys live only in `sessionStorage`.
4. **Action dispatch** — UI events use `data-act` attributes routed through `src/core/actions/` and `src/app/actions-delegation.js`.
5. **Sync load, async mirror** — `Store.load()` stays synchronous (localStorage); boot then `await Store.hydrateFromIDB()` so a newer IndexedDB snapshot wins before any view reads. When `indexedDB` is missing (tests / happy-dom) the app is localStorage-only.

## Deepening pass (2026-09-27)

Five shallow seams were turned into deep modules, each verified against the
full suite (889 passed, lint clean, build green):

- **Settings schema** — `config/settings.js` owns every setting's default, type
  and form coercion (`defaultSettings` / `readSettingsForm`). The Settings view,
  calendar and academic-calendar writers all go through `Store.settings.update`;
  no module assigns `db.settings.*` directly.
- **One registry per direct action** — the old `DIRECT_ACTIONS` name list and its
  parallel if-ladder in `act()` became `DIRECT_HANDLERS`, one `{ name: handler }`
  table, so an action's name and behaviour cannot drift apart.
- **RAG owns its cache** — `RAG.observe()` subscribes to the Store change seam,
  so documents/courses writes invalidate the index without any call site
  remembering to (`deleteDocument` no longer calls `RAG.invalidate()`).
- **Store entity factory** — `makeEntity` generates `courses`, `events`,
  `lessons`, `readings` and `documents` from a descriptor.
- **Layout seam** — `Router.render` composes `view-padded` + scope chip; views
  return their body only and no longer string-match their own wrapper. A view
  that fills the viewport opts out with `padded: false` (the chat assistant).

## Baseline (re-verified 2026-09-27)

| Gate | Result |
| --- | --- |
| `npm run test` | **889 passed** (55 files) |
| `npm run build` | OK — `index.html` 11.46 kB (gzip 3.18), CSS 135.60 kB (gzip 23.87), JS code-split into **two** chunks: 340.63 kB entry + 13.27 kB lazy chunk (gzip 110.22 + 4.30); prints three dynamic-import warnings (the three views imported both statically via `views/index.js` and dynamically via `core/actions/index.js` never actually split) |
| `npm run lint` | **Passes clean** — 0 errors, 0 warnings |
| `npm run format:check` | Not enforced in CI; run `npm run format` before committing |
| Coverage thresholds | statements 60 / branches 50 / functions 60 / lines 60 (`vite.config.js`) |

Every gate above is now enforced on push. `.github/workflows/static.yml` runs `npm ci`,
`npm run lint -- --max-warnings 0`, `npm test` and `npm run build` in a `verify` job, and the
Pages `deploy` job declares `needs: verify`. The install deliberately stays out of the deploy
job: that job uploads the working tree as-is (`path: '.'`), so installing dependencies there
would ship `node_modules` inside the Pages artifact.

The pre-refactor baseline (412 tests, lint failing with 33 errors) is recorded in
`docs/audit-2026-09-23.md`, which also tracks every fix since. The stale copy in
`docs/architecture.md` was rewritten rather than trusted.

### Why the build gate exists (2026-09-24)

Pages serves this repository as **raw source** — `index.html` loads `src/main.js` as an ES module —
so a dangling named import is fatal in the browser, not merely a build error. A rename
(`exportCSV` → `exportRoadmap`) orphaned one import in `src/core/actions/index.js`; native ESM
enforces that link, so `main.js` never executed and the site rendered nothing. Neither existing
guard could see it: Vitest resolves the missing binding to `undefined`, so the suite stayed green,
and `KNOWN_ACTIONS` derived action *names* from the dispatch table's keys without checking the
values were callable. Only Rollup caught it, and no workflow ran Rollup.

Fixed, and hardened around: the derived guard now asserts every dispatch handler is a function,
a test parses the `index.html` inline scripts (the load-failure fallback was itself a syntax
error, so the outage showed a permanent spinner instead of its own diagnostic), `export-csv` was
consolidated into `export-roadmap`, and the `verify` job above was added.

## Refactor roadmap (approved)

Status against the original roadmap (details and verification in `docs/audit-2026-09-23.md`):

0. This document + baseline — **done**; baseline re-verified (767 tests, lint clean, lint:css clean, build green).
1. Token budget, structured-output validation, citation checks (`src/ai/client.js`, `prompts.js`, `index.js`) — **done**.
2. Optional hybrid BM25 + ONNX semantic RAG (`rag-embeddings.js`, off by default) — **done**.
3. Answer confidence widget + Socratic tutor scaffolding — **done** (tutor modes pre-existing); the confidence widget itself was later replaced by `answerProvenance`/`renderProvenance`, which measure provenance and never claim to measure truth, and the guidance ladder now fades on real recall verdicts.
4. `StudyPlanAgent` tool loop (`src/ai/agent.js`) — **done**, and hardened: idempotent tool calls, wall-clock ceiling, aggregated usage, and a user-facing Stop control.
5. NLP standards registry (PNU / generic / custom) — **done** (`src/config/standards/`).
6. Planner interleaving and spacing — **done**; the AI plan is a proposal the student accepts, edits or rejects (`studyPlanProposal` + plan-preview flow), and import can no longer overwrite a plan silently.
7. Accessibility: contrast, focus, reduced motion — **done** for contrast (WCAG-AA token table in `tests/vitest/styles.test.js`) and focus handling; reduced motion ships in `styles/`.
8. AI contract tests (`tests/vitest/ai-contract.test.js`) — **done**.
9. Retrieval honesty — **done**: relevance floor, honest source labelling, numeric tokenisation, separate context budget, and pair-safe truncation with untrusted-content fencing.
10. Dead surface removed — the unused AI syllabus-parser prompts and validator were deleted (parsing is deterministic `NLP.analyse` on-device); Settings/README copy states what a key actually adds.

Known remaining limitations are tracked in the audit documents. Everything the roadmap in
`docs/audit-2026-09-25.md` §4 asked for has shipped — §8 records the commit that proves each — and
the findings this file used to repeat as open have closed with it:

- the agent's wall-clock ceiling holds: `chatWithRetry` takes one absolute deadline, clamps every
  attempt to the time left, and refuses to start a retry the deadline cannot cover (`f5857f3`);
- the token budget is enforced rather than reported, by dropping whole tool-safe units and refusing
  the request outright when even that cannot fit (`f5857f3`);
- the API key slides on use with a 90-day absolute cap, and `keyStatus()` says so in Settings and in
  `status()` instead of the key dying mid-semester with no explanation (`f5857f3`);
- the guidance level fades on the recall verdicts the drill already records (`resolveGuidanceLevel`,
  "auto" by default, `5e0282c`);
- `style-src` no longer carries 'unsafe-inline' — every rendered style attribute became a class in
  `styles/utilities.css`, except the handful of values a class cannot express, which became
  `data-style` and are applied through the CSSOM (`tests/vitest/csp.test.js`, `ca4b9db`);
- answers stream — `chat()` takes an `onToken`, so the request asks OpenRouter for `stream: true`
  and the assistant paints each
  delta into a provisional bubble that the settled, citation-checked message then replaces
  (`tests/vitest/streaming.test.js`, `aedc724`). The agent loop deliberately does not stream: it
  builds its own request options, so no tool turn can paint halfway through a plan;
- `"Review:"` blocks carry the document they re-test and, among themselves, are ordered by how much
  of it is being missed, with due-date proximity only as the tiebreak (`ad80e9e`).

Still open from the audit's own findings: the rendering model (the `innerHTML` assignment sites the
router still owns, P2-1) and the three surfaces that can disagree about which model is running
(P1-5). The confidence widget stays closed — `answerProvenance` + `renderProvenance` measure
provenance and never claim to measure truth. See `docs/audit-2026-09-25.md` §8 for the current
status and §6 for what each finding was verified against on 2026-09-25.
