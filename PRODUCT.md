# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Full-time university undergraduates carrying a heavy course load — four to six courses in a term, each with its own assignments, exams, readings and deadlines. The user is time-poor and context-switching between subjects, and needs one place that tells them what is due, what to study next, and where their materials are.

The primary context is **teacher-education students working to the PNU CMI syllabus template**. The shipped default parsing standard is `pnu-cmi-teacher-education-2025` ("PNU CMI Teacher Education Pathways"), and the term documents the pipeline was built against are real PNU Teacher Education Pathways syllabi from Term 2 AY 2025-2026 (`TGED 04 Ethics`, `TPROFED05 Managing Learning Environment`, both on the CMIMO syllabus template Rev. 01-06-2025). Generic higher-ed syllabi remain supported through the generic standard, but they are the secondary case rather than the frame.

## Product Purpose

Journey A.I is an academic planning and study assistant that a student uses as their actual term-management tool — the thing they open every day instead of a spreadsheet or a calendar.

Success means it genuinely beats a spreadsheet and a calendar at managing coursework: deadlines are never missed because they were buried, the next study block is always obvious, and imported syllabi turn into a real plan without manual re-entry.

It is a real tool to use and ship, not a demonstration piece.

## Positioning

Everything runs in the browser with zero server dependencies — there is no backend, no account, and no data leaves the device. Coursework, documents and study history stay in the student's own browser, and AI providers are optional rather than required.

The meaningfully different mechanism: the full pipeline — syllabus parsing, deadline extraction, task decomposition, BM25 retrieval over the student's own materials, workload analysis and schedule generation — is built in and works with no API key. A connected provider only adds conversational tutoring on top; it is never the load-bearing part.

Parsing itself is standard-driven: a registry of syllabus standards decides what the extractor looks for, ships with the institution's template as the default and a generic higher-ed fallback, and accepts custom standards at runtime. The tool follows the template the school actually uses instead of guessing at a generic PDF.

A neighboring product could not truthfully copy this claim while also running a server-side AI backend: keeping a hosted model in the loop is what forces data off the device.

## Operating Context

- A term/semester rhythm: a syllabus arrives at the start, deadlines cluster around midterms and finals, and the plan is regenerated as things shift.
- Syllabi arrive as PDF, DOCX, TXT or CSV files on the PNU CMI teacher-education template and are parsed on-device against a registered standard.
- A term carries academic-year and term anchors, with milestones generated from them, so the calendar reads against the school's term rather than a blank month grid.
- Lecture notes, textbooks and references are uploaded to a Library and chunked for retrieval. Practising that material is a retrieval rhythm, not a quiz game: indexed passages become quick recall questions and the verdicts are logged per document.
- Persistence is entirely client-side — `localStorage` plus an IndexedDB mirror. There is no server to sync with and no login.
- The AI provider, when connected, is OpenRouter free models, called directly from the browser. Keys live in `sessionStorage` only and are stripped before any state is persisted.
- A CSP `connect-src` allowlist in `index.html` permits `openrouter.ai` as the only remote API host; adding a provider means editing both the client and that policy.
- Development is Vite with Vitest; the production build deploys to GitHub Pages, served from a project subpath rather than a domain root.
- The service worker caches CDN libraries and fonts for repeat and offline loads.

## Capabilities and Constraints

Confirmed functionality:

- **Syllabus import** — PDF/DOCX/text/CSV in, with lessons, deadlines, readings and assessment weights extracted.
- **Syllabus standards** — extraction is driven by a registry of standards: PNU CMI teacher-education as the shipped default, a generic higher-ed standard, and custom standards registerable at runtime (`src/config/standards/`).
- **Task management** — assignments, exams, projects, quizzes, with automatic effort estimation and priority scoring.
- **Study planner** — weekly schedule generated from available hours, deadlines and priorities; exportable to CSV.
- **AI study tutor** — questions, summaries and personalised guidance over the student's own courses and documents; fully optional provider.
- **Practice & recall drills** — the tutor turns indexed passages from the student's own documents into quick recall questions, and "got it / not yet" verdicts are logged per document and roll into study activity.
- **Library & RAG** — BM25 retrieval over uploaded material, running in the browser, no API key required.
- **Dashboard** — weekly workload, completion rates, grades, study trends.
- **Academic term calendar** — term and academic-year anchors with automatically generated milestones on the in-app calendar, plus `.ics` export for Google, Outlook and Apple Calendar.
- **Course covers** — vector covers generated per course, replaceable with an uploaded image.

Technical constraints:

- Client-only architecture: no backend, no server-side rendering, no authentication.
- API keys are held in `sessionStorage`, never `localStorage`, and never written to disk.
- Documents stay local unless the student asks the tutor a question with a provider connected.

Deliberately not confirmed as binding (recorded, not invented): the repository currently ships zero runtime dependencies (vanilla JS plus CDN UMD libraries), but this was not confirmed in init as a constraint future work must preserve. Treat it as an open decision rather than a commitment.

Open decisions recorded rather than invented: whether accounts or cloud sync are ever in scope; whether more AI providers beyond OpenRouter are wanted.

## Brand Commitments

- **Name:** Journey A.I (package name `journey-ai`, repository `A.I-Project`).
- **Voice:** the product speaks plainly and supportively about workload and study — no motivational hype, no shaming for falling behind.
- No logo or brand image assets exist in the repository; the identity is currently typographic and token-driven.

## Evidence on Hand

- 928 Vitest tests across 61 suites (snapshot, 2026-09-27), running without a browser, API keys or network access.
- A demo dataset seeded on first visit, so the product can be demonstrated without a real term's data.
- Real term documents behind the term session maps (`src/config/term-syllabi.js`): PNU Teacher Education Pathways syllabi for Term 2 AY 2025-2026, normalised from sessions to one per week.
- Token-driven styling with a light base and a Deep Navy theme override in `src/styles/tokens.css`.
- Two internal audits: `docs/audit-2026-09-23.md` and `docs/audit-2026-09-25.md`, the latter carrying the refactoring-roadmap execution log (§8, 2026-09-27).
- Domain and architectural context in `CONTEXT.md` and `ARCHITECTURE.md`.

Absences future work must not fabricate: there are no testimonials, named users, published case studies, press, benchmark numbers or usage statistics, and no customer, partnership, endorsement, pricing or deployment claims. The PNU CMI name comes from the shipped syllabus standard and the source term documents, not from a customer or partner relationship.

## Product Principles

1. **The student's data belongs to the student.** Nothing leaves the device unless the student explicitly asks a connected AI a question. No backend means no quiet exfiltration path.
2. **The product must be useful before any AI is connected.** Parsing, retrieval, planning and the dashboard are built in; a provider adds conversation, never core capability.
3. **One missed deadline is a product failure.** Clustering, weighting and workload pressure are surfaced before they become a surprise, not reported after the fact.
4. **The plan must survive reality.** Schedules are regenerated as deadlines move; a plan that is wrong by Wednesday is worse than no plan.
5. **Local-first implies durable and offline-tolerant.** State persists in the browser and the app keeps working when the network does not.

## Accessibility & Inclusion

**Confirmed as a binding floor: later work must not regress it.**

The shipped practice is the commitment: keyboard navigation, screen-reader support, `aria-live` regions, reduced-motion handling, print-optimised styles and WCAG AA-contrast tokens, with contrast and accessibility test suites enforcing the last two. Formal conformance to a named standard is not claimed — the floor is the behaviour and the tests that already exist.
