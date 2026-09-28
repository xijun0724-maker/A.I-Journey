---
target: src/views/assistant.js
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:C:\\Users\\W\\Desktop\\Code\\A.I Journey\\src\\views\\assistant.js"
target_fingerprint: "sha256:80ac665025e44044e1f06a387498f8bd11abce74c9f17623f2e7c9aa0919aefb"
target_path: "C:\\Users\\W\\Desktop\\Code\\A.I Journey\\src\\views\\assistant.js"
timestamp: 2026-09-27T14-37-25Z
slug: src-views-assistant-js
closed: true
---
Method: dual-agent (A: ses_f1cc4df50ffeS2XslN7hrRrmAw · B: ses_f1cc4df4cffewSW0LgPlORsxIt)

# Critique: `src/views/assistant.js` — the Assistant view

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Sending from the landing renders nothing — no bubble, no dots, no answer; no provider/offline status anywhere in the view |
| 2 | Match System / Real World | 3 | Calm plain copy, but Elicit-era residue: magnifier icon on a static label, raw model slugs and `e.message` strings shown to students |
| 3 | User Control and Freedom | 3 | Stop survives the stream honestly; but Recents `×` deletes permanently — no confirm, no undo |
| 4 | Consistency and Standards | 2 | The only view with no `.page-head`; two New-chat controls; two send buttons at 36px and 48px |
| 5 | Error Prevention | 2 | Duplicate-send guard exists, but empty send is a silent no-op behind an always-cyan button; Enter lacks `e.isComposing` guard |
| 6 | Recognition Rather Than Recall | 2 | No conversation title in the pane; model pill truncated to read literally "Free"; `chatSources` scope invisible |
| 7 | Flexibility and Efficiency | 3 | Enter/Shift+Enter, mic, resume, drills are good; no copy, regenerate, jump-to-latest, shortcuts, rename/pin |
| 8 | Aesthetic and Minimalist Design | 3 | Composer is restrained; landing stacks four equal-weight plates and repeats an information-free "Suggested" badge |
| 9 | Error Recovery | 2 | Offline-retrieval fallback is excellent; diagnosis is "Something went wrong… Failed to fetch" persisted into the transcript, no retry |
| 10 | Help and Documentation | 1 | No in-view hints, no tooltips on icon-only controls, no "connect a key" nudge; a help modal is registered but nothing opens it |
| **Total** | | **23/40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

**LLM assessment:** The chat surface is the least product-specific composition in the app — and the source admits it: the landing is named `renderElicitLanding` / `.elicit-*`, an "Elicit-style search card" transplanted from a research tool, and the transcript is the stock two-bubble idiom that would drop into any LLM wrapper unchanged. Category-interchangeable: the search-card landing with pill-badged grid; "Ask anything…" beside icon-only mic/send circles; the 8-slug vendor dropdown; a transcript with no course, no deadline, no date, no ruled margin — so the lab notebook never actually rules the page. The design system's grammar (hairline rule per turn, tabular timestamp in the margin, course eyebrow, `card-head` spacer) is applied to the card header and nowhere near the messages. The tutor already reads the ranked task list, yet the answer never says "your ORG-201 reading is due Thursday." The two elements that could only exist here — the provenance line and the recall drill — are appended after the answer instead of shaping the composition.

**Deterministic scan:** The detector found nothing in `assistant.js` itself (exit 0, clean) and 10 advisory findings on the surface, all in `src/styles/chat.css`: 9 × `design-system-font-size` off the DESIGN.md ramp (12/14/16/20px at chat.css:95, 337, 359, 378, 447…) and 1 × `design-system-color` — `rgba(34, 197, 94, 0.15)` at chat.css:441. Agreement: the LLM review independently flagged that exact badge color as a hard-coded light-register literal breaking the Two-Register Rule — the detector confirmed it. Detector-only catch: the type-ramp drift. Likely false positive: the green rgba is probably `--ok` composed as raw rgba rather than real drift — worth a token, not a fix. Zero errors; the repo's 12 warnings (`side-tab` slop) are all in other views, none here.

**Visual overlays:** none available — no browser automation tool is exposed in this session, so no server was started and no injection was attempted.

## Overall Impression

There's a real, earned product underneath a generic chat chassis. The provenance line, the honest Stop/cancel behavior, and the accept-the-plan card are as good as anything in this codebase — then the frame around them (no header, no title, no status, non-semantic landing cards, a model pill that reads "Free") forgets the student entirely. The single biggest opportunity: stop decorating a chat app and start ruling the notebook — put the conversation's identity, scope, and status on a `page-head` like every other view, and make the transcript legible as a record.

## What's Working

1. **The provenance line.** "4 passages from 2 documents · composed by DeepSeek" instead of a fake confidence percentage — capped at "supported" unless a citation validated. It earns trust at exactly the moment a student decides whether to believe an answer before an exam, and no generic chat ships it.
2. **Stop that survives the transition.** The button carries from the typing indicator into the live bubble, and the cancel toast names the consequence, not the mechanism: "Stopped. Nothing was added to the transcript."
3. **The plan proposal card.** Three unambiguous actions, flags as counts ("3 could not be scheduled"), untick-to-replan, and "Nothing is saved until you accept" — calm pressure reporting, exactly the voice PRODUCT.md and DESIGN.md demand.

## Priority Issues

**[P0] Sending from the landing page produces zero visible feedback, and the answer never appears.**
Why it matters: the product's primary action looks dead. `sendChat` → `Store.chat.append` → `Router.onStoreChange` repaints Recents only (router.js:287-290), while `appendMsg`/`showTyping`/`showLive` all early-return because the landing branch has no `#chatLog` (assistant.js:116, 167-172, 197-199). The textarea clears, the request runs, the reply lands in storage invisibly.
Fix: after `Store.chat.append(...)`, if `q("#chatLog")` is absent, call `Router.render()` before the first `appendMsg` — or render the transcript branch synchronously in `sendChat`. Add a test that drives `sendChat` from the landing markup and asserts a user bubble + `#typingIndicator` appear.
Suggested command: `shape`

**[P0] The landing cards (Resume + 2 Suggested) are `<div data-act>` — no `role`, no `tabindex`, no focus style.**
Why it matters: keyboard and screen-reader users cannot resume a conversation or fire a suggestion; the front door is mouse-only. The delegation layer only activates `[role="button"]` on keydown (actions-delegation.js:49-58), and `renderElicitCards` sets neither role (assistant.js:650-655).
Fix: emit real `<button type="button">` elements with `aria-label="Resume: <full title>"` on the resume card; keep badges as inner content.
Suggested command: `harden`

**[P1] Nothing in the transcript is announced to assistive tech.**
Why it matters: `#chatLog` has no `role="log"`/`aria-live`; `showLive` rewrites the answer every 90ms with no live region; `#srStatus` gets only the view title. Pressing Send is silence until the provenance fragment inserts.
Fix: `role="log" aria-live="polite" aria-relevant="additions"` on `#chatLog`, `aria-hidden="true"` on the throttled live bubble, one settled summary pushed to `#srStatus`.
Suggested command: `harden`

**[P1] The main pane has no header: no title, no provider status, no document-scope chip.**
Why it matters: the only view without `pageHead`. A student with six courses can't tell which conversation is open without reading 28-char sidebar rows — and Library → "Ask this document" sets `UIState.chatSources = [id]`, silently restricting every subsequent retrieval with no indicator and no way to clear it (`chatSourcesOpen` is declared and never read).
Fix: a compact ruled header — conversation title (ellipsis), a badge mirroring Settings' `connected / offline mode`, and a dismissible scope chip whenever `chatSources.length`.
Suggested command: `layout`

**[P2] The model pill is a decision nobody should have to make, badly labelled.**
Why it matters: `label.split(" ")[0]` renders the default auto-router as literally "Free"; `aria-label="Select model"` hides the current value and carries no `aria-expanded`; the dropdown lists 8 models with no Escape and no arrow keys; picking one calls `Router.render()` and destroys a half-typed draft.
Fix: full friendly names, `aria-haspopup="listbox"` + `aria-expanded` with the current model in the accessible name, Escape/arrows, and collapse to 3 choices (Auto / fastest / longest context) with the rest behind "More models".
Suggested command: `distill`

## Persona Red Flags

**Sam (a11y / keyboard / screen reader)** — Tab order on the landing goes textarea → send, then jumps straight past three cards that look clickable but aren't. Enter sends a message no live region announces. The model pill announces only "Select model". Recents rows announce as "Remove" (format.js:305) with no conversation name.

**Priya (time-poor undergrad, 4-6 courses)** — Arrives at "What are you studying today?" with no course context, no due-task signal; the Resume card and two Suggested cards compete at identical weight while her top-ranked open task is just card #1 of a uniform row; Recents titles truncate at 28 chars so ORG-201 and CHEM-210 questions read alike; if she entered via "Ask this document", she'll never know her next five questions were scoped to one file.

**Casey (distracted mobile)** — Recents and New live behind the 980px drawer (two taps + scrim to resume); the `×` is 24×24 and permanent; the composer is `rows="1"`, `resize:none`, no auto-grow, so a Shift+Enter draft scrolls invisibly; the grid orphans a third card at 640px; the log force-scrolls every 90ms with no jump-to-latest, so scrolling back to read a citation fights the stream.

**Alex (power user)** — No copy, no regenerate, no shortcuts, no rename/pin; Recents capped at 5 with no "view all"; opening the model dropdown rebuilds the DOM and destroys a half-typed draft.

## Minor Observations

- `timeAgo` pluralization: "1 hours ago" (assistant.js:827-831)
- Empty send is a silent no-op — button stays full cyan; `.has-text` only glows the pill
- No `e.isComposing` guard on Enter (assistant.js:934) — IME composition gets interrupted
- `.pill-model .model-dot` has no matching markup — the "current model" dot never renders
- Suggestion labels truncate mid-word with no ellipsis (`.slice(0,38)` / `.slice(0,30)`)
- Raw `e.message` errors are persisted into the transcript forever as assistant messages, no Retry
- `CFG.maxChatMessages` (100) trims the *global* `db.chat` — chatting silently deletes other conversations' oldest messages; Recents evaporate without warning
- Empty Recents renders nothing under a permanent "Recents" heading
- The composer `+` sits where attachment conventionally lives but means "New chat" — duplicate of the sidebar New
- Two send buttons with different geometry (36px/48px); no local `:focus-visible` on `.elicit-send`
- Hardcoded badge borders `rgba(34,197,94,.15)` / `rgba(91,141,239,.15)` leak light-register literals into dark mode (detector agrees on the first)
- Mic listening state is CSS-only — no `aria-pressed`, raw error codes in the toast
- `ul/ol/pre` inside `.msg-ai-body` outgrow the 68ch measure that `p` respects
- Detector: 9 font-size values in `chat.css` sit off the DESIGN.md ramp

## Questions to Consider

1. Every other view earns a `page-head` — is the assistant's header-less, title-less frame a deliberate statement that conversation is a different kind of surface, or just the one view where the router's frame was never applied?
2. If PRODUCT.md's principle is "useful before any AI is connected", where does this screen prove it? The model pill and "composed by <model>" meta point at a provider that may not exist, while the honest offline answer deserves the chrome.
3. Should provider choice live in the composer at all — or should the pill become a two-state readout that makes the student's real decision, *which course am I asking about*, visible instead?
