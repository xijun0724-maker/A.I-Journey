# Journey A.I

**AI-powered academic planning and study assistance system.**

Journey A.I helps students manage coursework, deadlines, and study schedules with intelligent syllabus analysis, task decomposition, and an AI study tutor — all running in your browser with zero server dependencies.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![HTML](https://img.shields.io/badge/html-5-orange.svg)
![CSS](https://img.shields.io/badge/css-3-blue.svg)
![JavaScript](https://img.shields.io/badge/javascript-ES2022-yellow.svg)

## Features

- **Syllabus Import** — Upload PDF, DOCX, or text syllabi. Journey parses deadlines, lessons, readings, and assessment weights automatically.
- **Task Management** — Track assignments, exams, projects, and quizzes with automatic effort estimation and priority scoring.
- **Study Planner** — Generates a weekly study schedule based on your available hours, deadlines, and priorities.
- **AI Study Tutor** — Ask questions about your courses, get summaries, and receive personalised study guidance (optionally connected to Google Gemini or OpenRouter free models).
- **Library & RAG** — Upload lecture notes, textbooks, and references. Built-in BM25 retrieval surfaces relevant passages for the AI tutor — no API key required.
- **Dashboard** — Visualise workload by week, track completion rates, view grades, and monitor study trends.
- **Calendar Export** — Export deadlines to Google Calendar, Outlook, or Apple Calendar as `.ics` files.
- **Accessible Design** — Keyboard navigation, screen reader support, reduced motion, and print-optimised styles.

## Quick Start

1. **Clone the repository:**

   ```bash
   git clone https://github.com/xijun0724-maker/A.I-Project.git
   cd A.I-Project
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Start the dev server:**

   ```bash
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

A demo dataset is seeded automatically on first visit.

## Usage

### Importing a Syllabus

1. Click **Import syllabus** in the sidebar or top bar.
2. Drag-and-drop or select a PDF, DOCX, TXT, or CSV file.
3. Review the extracted lessons, deadlines, and readings.
4. Confirm to add them to your courses.

### Using the AI Tutor

1. Navigate to **AI tutor** in the sidebar.
2. Optionally connect Google Gemini or OpenRouter in **Settings** — Journey works without a provider.
3. Ask questions about your uploaded documents and courses.

### Building a Study Plan

1. Go to **Planner** and set your available study hours.
2. Click **Generate plan** to create a weekly schedule.
3. Export to CSV or follow the plan directly in the app.

## Architecture

Journey A.I is a single-page web application with:

- **Zero runtime dependencies** — runs on vanilla JavaScript and browser APIs.
- **UMD libraries** loaded via CDN for PDF parsing (`pdf.js`) and DOCX extraction (`mammoth`).
- **localStorage** for all persistence — no backend required.
- **BM25 retrieval** for document search — runs entirely in the browser.
- **Two AI providers** — Google Gemini and OpenRouter free models, called directly from the browser with no SDK and no proxy.
- **Service Worker** caches CDN libraries and Google Fonts for faster repeat loads.

### Security

- API keys are stored in `sessionStorage` (not `localStorage`) and are never written to disk.
- Keys are stripped before any data is persisted to `localStorage`.
- Documents never leave your browser unless you ask the AI tutor a question with a connected provider.

### Project Structure

```
A.I-Project/
├── index.html              # Entry HTML (loads the ES module bundle)
├── sw.js                   # Service Worker (caches CDN libs + fonts)
├── vite.config.js          # Vite dev server + test config
├── src/                    # Application source
│   ├── main.js             # ES module entry point — wires views, router, actions, boot
│   ├── config/             # Constants, provider definitions, syllabus standards
│   ├── core/               # Router, state, localStorage store, IndexedDB mirror
│   │   ├── actions/        # Action dispatch + domain modules (courses, tasks, exports, settings, import, planner, term)
│   │   └── ...
│   ├── utils/              # Helpers, dates, DOM, markdown, secure storage
│   ├── domain/             # Business logic — tasks, NLP, RAG, planner, coach, dashboard, pipeline
│   ├── ai/                 # LLM provider layer (Gemini + OpenRouter, no SDK)
│   └── views/              # Screen renderers
│       ├── modals/         # Entity modals (course, event, lesson, doc, reading, help)
│       └── ...
├── tests/                  # Vitest unit + integration tests
│   └── vitest/             # Unit and integration tests
├── docs/                   # Documentation assets
├── .github/workflows/      # CI: lint, test, build, deploy to GitHub Pages
├── LICENSE                 # MIT License
└── CONTRIBUTING.md         # Contribution guide
```

The entry point is `src/main.js`, loaded as an ES module in `index.html`.

## Development

| Command                | Description                           |
| ---------------------- | ------------------------------------- |
| `npm run dev`          | Start Vite dev server with hot reload |
| `npm run build`        | Production build to `dist/`           |
| `npm run preview`      | Preview the production build          |
| `npm run lint`         | Run ESLint on `src/`                  |
| `npm run lint:fix`     | Auto-fix lint issues                  |
| `npm run test`         | Run Vitest unit tests                 |
| `npm run test:watch`   | Run tests in watch mode               |
| `npm run format`       | Format code with Prettier             |
| `npm run format:check` | Check formatting without writing      |

## Testing

The project uses [Vitest](https://vitest.dev/) for unit and integration testing.

```bash
npm run test          # Run all tests once
npm run test:watch    # Run tests in watch mode
```

Test coverage spans:

| Test suite                 | Tests |
| --------------------------- | ----- |
| Academic calendar          | 6     |
| Action dispatch            | 61    |
| Click delegation           | 11    |
| Study plan agent           | 34    |
| AI contract                | 37    |
| Assistant stop control     | 9     |
| Assistant view             | 14    |
| App chrome                 | 3     |
| AI client                  | 26    |
| Calendar config            | 10    |
| Coach                      | 13    |
| Courses view               | 14    |
| Dashboard                  | 21    |
| Date utilities             | 40    |
| DOM utilities              | 15    |
| Event modal                | 5     |
| Feedback                   | 21    |
| Formatting                 | 25    |
| Helper utilities           | 34    |
| SPA shell                  | 6     |
| IndexedDB mirror           | 5     |
| Import accessibility       | 2     |
| Library view               | 7     |
| App lifecycle              | 9     |
| Markdown rendering         | 15    |
| Moodle dashboard & calendar | 5     |
| NLP / text extraction      | 33    |
| Planner view               | 13    |
| Planner scheduling         | 21    |
| RAG retrieval              | 43    |
| Hybrid RAG embeddings      | 15    |
| Retrieval practice         | 12    |
| Recent chats               | 15    |
| Router & navigation        | 19    |
| UIState scope              | 18    |
| Secure storage             | 26    |
| Settings & schema          | 7     |
| NLP standards registry     | 15    |
| Store & persistence        | 25    |
| Store IndexedDB mirroring  | 8     |
| Style tokens & contrast    | 34    |
| Tasks                      | 15    |
| Task extensions            | 17    |
| Task progress              | 6     |
| To-do view                 | 7     |
| Term syllabi               | 22    |
| Untracked-module guard     | 2     |
| UI namespace               | 8     |
| XSS id-sink scan           | 2     |
| Removed workload views     | 3     |
| **Total**                  | **834** |

Suite names map one-to-one to files in `tests/vitest/` — "Planner scheduling" is
`tests/vitest/planner.test.js`, and so on. The counts are a snapshot, not a gate: the
enforced numbers are the coverage thresholds in `vite.config.js`. Re-read them from
`npm test` whenever suites are added.

All tests run without a browser, API keys, or network access — they exercise pure functions and in-memory stores.

## AI Provider Setup

Journey A.I works without any AI provider — the syllabus analyser, deadline extraction, task decomposition, retrieval, and planner are all built in. Connecting a provider adds conversational explanations, tutoring modes, and a written study plan. Syllabi are always parsed on-device.

Keys are entered in the in-app **Settings** panel and live only in `sessionStorage`. A `.env`
file is never read — the app is client-only — so [`.env.example`](.env.example) is documentation
only, not a setup step.

**Supported providers:**

| Provider                 | Key Required | Default Model      |
| ------------------------ | ------------ | ------------------ |
| Google Gemini            | Yes          | `gemini-2.5-flash` |
| OpenRouter (free models) | Yes          | `openrouter/free`  |

Gemini keys come from [Google AI Studio](https://aistudio.google.com/apikey) and OpenRouter keys
from [OpenRouter](https://openrouter.ai/keys). OpenRouter defaults to its free auto-router and
offers a fixed list of free models (DeepSeek, Gemma, Qwen, Nemotron) in the model dropdown.

Those two hosts are the only endpoints the app may reach: `index.html` sets a CSP `connect-src`
allowlisting exactly `generativelanguage.googleapis.com` and `openrouter.ai`. Adding a provider
means updating both `src/ai/client.js` and that policy.

## Service Worker

The service worker (`sw.js`) caches CDN libraries (pdf.js, mammoth) and Google Fonts using a cache-first strategy. This provides:

- Faster repeat page loads
- Offline access to cached assets
- Automatic cache invalidation when `CACHE_NAME` in `sw.js` is bumped

The service worker is registered by the inline script in `index.html` when the page is served over HTTPS or localhost. It uses a **relative** path (`sw.js`) so its scope resolves correctly when the site is served from a GitHub Pages project subpath rather than a domain root.

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge). For best results use a local server — `npm run dev` starts one with hot reload.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, code style guidelines, and the pull request workflow.

## License

[MIT](LICENSE) — © 2024–2026 Journey A.I Contributors
