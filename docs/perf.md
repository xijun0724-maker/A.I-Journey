# Performance ledger

Synthetic measurements, `lighthouse@12 --only-categories=performance` against
`vite preview`, headless Chrome, same command each run. Numbers are what the
run returned; the point of the table is that a dead idea stays dead and a
revert stays recorded.

## Budgets

| Gate | Budget | Now |
| --- | --- | --- |
| Lighthouse performance score | ≥ 90 | 0.97–0.99 |
| LCP | ≤ 2.5s | 1.8s (one run at 2.4s) |
| CLS | ≤ 0.1 | 0.007 |
| Total blocking time | ≤ 200ms | 0ms |
| Initial JS (gzip) | < 200KB | 112KB |
| Initial CSS (gzip) | < 50KB | 24KB |

## Attempts

| Idea | Baseline → Result | Verdict | Why |
| --- | --- | --- | --- |
| Measure twice before touching anything | LCP 2.4s / 2.3s, score 0.95 both runs | kept | Noise band is ±0.1s on LCP, ±0 on score and on the 1,140ms render-blocking figure. Anything smaller than that is not a result. |
| Serve the Google Fonts sheet as a preload instead of a render-blocking stylesheet | render-blocking 1,140ms → 450ms; FCP 2.4s → 1.7s; SI 2.9s → 1.7s; score 0.95 → 0.99 | kept | Beats noise on FCP, SI and score on every run. Font bytes unchanged (28,659 → 28,659), so the preload is reused by the later stylesheet fetch rather than downloaded twice. |
| …first attempt, measured before the `dist/` 404 was found | score 0.95 → 0.99, but **zero `.woff2` requests** | discarded | Not an optimization — the page had stopped loading webfonts entirely. The "win" was the work disappearing. Kept only as the reason the 404 below got fixed first. |
| Emit `theme-init.js` and `boot-fallback.js` into `dist/` | 404 → 200 | kept | Pre-existing production bug, found while verifying the above: Vite refuses to bundle classic scripts, copies nothing, and `npm run dev` reads from disk so it always looked fine. Cost +3kB transfer — bytes that should always have shipped. |
| Preconnect to `fonts.googleapis.com` / `fonts.gstatic.com` | — | not attempted | Already present in `index.html`; the audit's biggest line item was the stylesheet's *blocking*, not its connection setup. |
| Non-critical app CSS (`src/styles/index.css`) | — | not attempted | Only remaining render-blocking item at 459ms. Making it async trades a guaranteed FOUC for a number; it is the app's own stylesheet. |
| Make `theme-init.js` / `boot-fallback.js` non-blocking | — | not attempted | Deliberate: one must run before first paint, the other must survive a failed module graph. Both documented in `index.html`. |

## Guards

- `tests/vitest/tracked-modules.test.js` → *"emits every classic script
  index.html loads"*. The pre-existing guard walks the **source** tree only,
  which is why it stayed green while `dist/` 404'd. This one pins the build
  output contract instead.
- `index.html` keeps the font sheet as `rel="preload" as="style"` with the
  `rel` flip in `theme-init.js`; reverting the link to `rel="stylesheet"`
  returns render-blocking to 1,140ms and is visible on the next run.
