# Journey A.I — Architecture (layer summary)

> The root `ARCHITECTURE.md` is the source of truth for the stack and the
> refactor baseline. This page is the short module-layer tour; the audit in
> `docs/audit-2026-09-23.md` records how each claim here was verified and what
> has been fixed since.

## Overview

Journey A.I is a single-page web app in vanilla JavaScript (ES modules) with
**zero runtime npm dependencies** and **no backend**. AI calls go directly
from the page to **OpenRouter** over `fetch()` — there is no
SDK and no proxy. Every AI path has a deterministic
offline fallback, so the app is fully usable with no key and no network.

Persistence is dual-layer: `localStorage` is the synchronous bootstrap path,
mirrored to IndexedDB for capacity and recovery. API keys live in
`sessionStorage` only.

## Module Layers

```
┌─────────────────────────────────────────────┐
│  index.html (SPA shell, CSP, service worker)│
├─────────────────────────────────────────────┤
│  src/main.js (entry point)                  │
├─────────────────────────────────────────────┤
│  src/app/ (bootstrap, chrome, lifecycle,    │
│            actions-delegation, focus-trap)  │
├─────────────────────────────────────────────┤
│  src/core/ (router, state/scope, store,     │
│             idb, actions/ — dispatch)       │
├─────────────────────────────────────────────┤
│  src/views/ (screen renderers + modals/)    │
├─────────────────────────────────────────────┤
│  src/domain/ (business logic)               │
│  ├── NLP (deterministic syllabus parsing)   │
│  ├── RAG (BM25 retrieval, rag-embeddings    │
│  │        adds optional ONNX hybrid re-rank)│
│  ├── Tasks (decomposition, priority)        │
│  ├── Planner (scheduling; preview/commit)   │
│  ├── Coach (recommendations, activity)      │
│  ├── Dashboard (KPIs, charts)               │
│  └── Pipeline (document import)             │
├─────────────────────────────────────────────┤
│  src/ai/ (client: OpenRouter fetch;        │
│  agent: bounded tool loop; prompts; offline)│
├─────────────────────────────────────────────┤
│  src/utils/ (date, dom, helpers, format,    │
│              secure, markdown, extract, cdn)│
├─────────────────────────────────────────────┤
│  src/config/ (constants CFG, settings       │
│               schema/migrations, standards/)│
├─────────────────────────────────────────────┤
│  localStorage (sync bootstrap)              │
│  sessionStorage (API keys only)             │
│  IndexedDB (async mirror + hydrate)         │
└─────────────────────────────────────────────┘
```

## Key Modules

### `src/core/router.js`

Hash-based SPA router. Maps view IDs to render functions, renders the active
view into `#viewRoot`, and coalesces re-renders through `requestAnimationFrame`.

### `src/core/store.js`

Persistence layer (`journeyai.db.v1`, schemaVersion 4). `load()` reads
localStorage synchronously; every `persist()` also mirrors to IndexedDB via
`src/core/idb.js` and stamps a sidecar timestamp. Boot then
`await Store.hydrateFromIDB()` so a newer mirror wins when localStorage is
missing, corrupt, or older. Manages `Store.db`, debounced saves, forward schema
migrations, dedupe-on-load and data lookups. API keys are stripped before every
persist.

### `src/core/actions/` + `src/app/actions-delegation.js`

Action dispatch. `data-act` attributes route through a dispatch table built in
`src/core/actions/index.js`; the delegation layer reports synchronous throws and
rejected handler promises as toasts instead of swallowing them. The guard set
`KNOWN_ACTIONS` is derived from the dispatch table and asserted against the
markup in tests, so handler names and emitted actions cannot drift apart.

### `src/domain/rag.js`

BM25 retrieval. Documents are chunked at paragraph boundaries (with
`CFG.chunkOverlap` shared between consecutive chunks), tokenised (stemmed,
stop-worded, numbers kept only after a word), and indexed. `RAG.search` applies
a relative relevance floor so an unmatched query returns *nothing* rather than
arbitrary passages dressed up as sources — except for explicitly scoped queries
(the student chose the document), which read the chosen material with
`score: 0`. Index entries resolve chunk text lazily from the document store
instead of keeping a second copy in memory.

### `src/ai/`

- `client.js` — OpenRouter `fetch()` with retries, timeout, abort
  support, token-budget truncation that never splits a tool call from its
  result, and usage recording.
- `agent.js` — bounded `StudyPlanAgent` tool loop: memoised tool calls, a
  wall-clock ceiling, aggregated usage, abort-as-cancel, and tool results
  fenced as untrusted data.
- `prompts.js` — tutor/Socratic prompts with untrusted-content fencing and
  citation rules.
- `offline.js` — extractive offline answers and recall-question generation.
- `index.js` — public AI surface, including `studyPlanProposal`, which attaches
  a schedulable draft from the deterministic planner to the agent's narrative;
  the student accepts, edits or rejects it before anything is written.

Syllabus parsing is **always on-device** (`NLP.analyse`); no AI parser exists in
the pipeline.

## Data Model

All data lives under the key `journeyai.db.v1` in `localStorage`, mirrored to
the IndexedDB database `journeyai` (store `kv`):

- `courses[]` — academic courses
- `lessons[]` — weekly lesson topics
- `events[]` — assignments, exams, quizzes, projects (with subtasks)
- `readings[]` — required/optional readings
- `documents[]` — uploaded reference materials (full text stored)
- `chunks[]` — BM25 chunk coordinates (`{docId, start, len}`, no text copies)
- `chat[]` — AI tutor conversation history
- `activity[]` — daily study activity log
- `plan[]` — committed study plan items
- `planMeta` — plan provenance (mode, model, tools, calls, exclusions)
- `settings` — provider config, term dates, study hours, guidance modes

## Design Decisions

1. **Zero runtime dependencies** — business logic is vanilla JS; CDN UMD
   libraries handle PDF, DOCX and charts.
2. **Offline-first fallback** — deterministic NLP, BM25 retrieval, extractive
   offline answers and greedy scheduling work with no key and no network.
3. **Security** — API keys live in `sessionStorage` (per-provider, TTL),
   stripped before every `localStorage` / IndexedDB write, never logged. Retrieved document
   text and tool results are fenced as untrusted data in every model prompt.
4. **Action dispatch** — user interactions use `data-act` attributes routed
   through a derived dispatch table; handler failures surface as toasts.
5. **The AI proposes; the student decides** — study plans land as a preview or
   a proposal card and are only written on an explicit accept/edit; import
   cannot overwrite an existing plan silently.
6. **Sync load, async mirror** — `Store.load()` is always synchronous
   (localStorage only in tests/happy-dom); IndexedDB is an optional boot-time
   hydrate and overflow path, never a required API.
