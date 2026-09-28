---
name: Journey A.I
description: AI academic planning and study assistant — a ruled lab notebook rendered on a deep navy console.
colors:
  primary: "#38bdf8"
  primary-deep: "#0ea5e9"
  canvas: "#0a0f1c"
  surface: "#111827"
  card: "#151c28"
  sidebar: "#070b14"
  ink: "#f8fafc"
  ink-2: "#94a3b8"
  ink-3: "#7d8399"
  ok: "#34d399"
  error: "#f87171"
  warn: "#fbbf24"
  rule: "rgba(30, 41, 59, 0.65)"
  light-canvas: "#f8f9fa"
  light-ink: "#18181b"
  light-pen: "#5b8def"
  light-primary: "#18181b"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.04em"
  mono:
    fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  pill: "9999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.pill}"
    padding: "9px 18px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.pill}"
    padding: "9px 18px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "9px 18px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "9px 18px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "22px 24px"
  badge:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Journey A.I

## Overview

**Creative North Star: "The Lab Notebook"**

Journey A.I is a well-kept lab notebook rendered on a dark console. It is structured, evidential and tabular: everything is ruled, aligned and legible, and the interface earns trust by looking like a record rather than a dashboard trying to impress. The personality is warm and supportive — this tool is on the student's side about a heavy term, so it reports pressure calmly and never lectures, shouts, or celebrates at them. Density is high because the user is an expert at their own coursework and time-poor; whitespace is spent on alignment and rhythm rather than on making screens look empty.

The aesthetic philosophy is precision with a pulse. Structure does the work — ruled lines, tabular figures, consistent plate geometry — and the glowing sky-cyan accent supplies the life, appearing as instrument light rather than brand wash. Dark is the default experience and carries that glow; light mode is a deliberately plain paper register for people who need it, not a second personality.

**Key Characteristics:**

- Ruled and tabular: hairline rules, aligned numerals, structured card headers
- Warm and supportive in voice — calm reporting, no motivational framing
- Flat at rest; depth and glow are earned by state, not applied permanently
- Pill controls against rectangular plates — approachable geometry, precise execution
- Instrument-glow accent used as signal, so its rarity keeps it meaningful
- High information density with disciplined 8px-grid rhythm

## Colors

The palette is a deep navy console lit by a single glowing sky-cyan accent, with semantic colours reserved strictly for status.

### Primary

- **Instrument Cyan** (`#38bdf8`): The one accent. Focus rings, active navigation, primary button fill, card hover borders, and the glow under anything interactive. In dark mode it is the only hue allowed to draw the eye.
- **Deep Sky** (`#0ea5e9`): The pressed/darker step of the accent — primary button hover and input focus border. Always paired with Instrument Cyan, never used alone.

### Semantic

- **Verified Green** (`#34d399`): Completed work, passing status, `.badge.ok`, `.btn.ok`. Cool-toned so it sits inside the navy world rather than fighting it.
- **Flagged Red** (`#f87171`): Errors, critical priority, destructive actions. Never used decoratively.
- **Marginalia Amber** (`#fbbf24`): High priority, warnings, approaching deadlines. The "note in the margin" colour.

### Neutral

- **Deep Navy Canvas** (`#0a0f1c`): The page substrate. Carries a three-orb radial mesh gradient so the background has atmosphere instead of being flat black.
- **Console Slate** (`#111827`): The secondary surface — input backgrounds and elevated panels.
- **Bento Plate** (`#151c28`): Card and sheet surface. Deliberately one step above the canvas so panels read as objects placed on it.
- **Well Ink** (`#070b14`): The sidebar rail — darker than the canvas, so navigation sits in its own recess.
- **Notebook White** (`#f8fafc`): Primary text. Near-white rather than pure white, to keep long sessions comfortable.
- **Cool Graphite** (`#94a3b8`): Secondary text — descriptions, leads, helper copy.
- **Faint Pencil** (`#7d8399`): Tertiary text — timestamps, hints, disabled labels.
- **Ruled Line** (`rgba(30, 41, 59, 0.65)`): Every hairline border and divider. The rules are the structure, so this token is used constantly.

### Light Register

Light mode is a plain paper world using the same layout and geometry: **Paper** (`#f8f9fa`) canvas, **Graphite Ink** (`#18181b`) text, **Ballpoint Blue** (`#5b8def`) accent, with `#18181b` as the primary button fill and white as its label.

### Named Rules

**The Two-Register Rule.** Dark is the default experience and light is a plain paper register. Never mix values across registers — a component reads its colour from the token, never from a hard-coded hex, so it is correct in both.

**The Signal Rule.** Instrument Cyan marks what is active, focused, or actionable. It is not a background wash: when accent coverage spreads across large fills or whole panels, it stops meaning "here" and the system loses its only attention mechanism.

## Typography

**Display Font:** Plus Jakarta Sans (with `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`)
**Body Font:** Plus Jakarta Sans (same fallback stack)
**Mono Font:** Geist Mono (with `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`)

**Character:** One family across display and body gives the whole product a single confident voice — geometric, slightly rounded, friendly without being cute. Tight negative tracking on headings pulls them into confident blocks; Geist Mono carries identifiers, code and technical readouts where character-level distinction matters.

### Hierarchy

- **Hero** (44px, weight 700–800, 1.2): Empty states and first-run moments only.
- **Display** (32px, weight 700, 1.2, `-0.02em`): Section-defining headings.
- **Page title** (22px, weight 700, 1.2, `-0.02em`): The `.page-head h1` on every view — consistent across all seven views.
- **Lead** (20px, weight 400, `--lh-body`): Supporting intro copy under a heading.
- **Body** (15px, weight 400, 1.5, `-0.01em`): Default text, constrained to a 68ch measure (`.hint`, `.page-head .lead`).
- **Caption** (13px, weight 500): Button labels and compact controls.
- **Label** (11.5px, weight 600, `0.04em`, uppercase-adjacent): Field labels (`label.fld span`), section eyebrows, badges at 11px.
- **Fine / Micro** (12px / 11px): Timestamps, hints, dense table meta.

### Named Rules

**The Tabular Rule.** Any number the user compares vertically — grades, percentages, counts, deadlines, KPIs — renders with `font-variant-numeric: tabular-nums`. Columns of figures must align without the reader doing the alignment.

## Layout

The application is a fixed-height flex shell: a **248px sidebar rail** on the left (darker than the canvas, collapsible to an icon rail) and a scrollable `#viewRoot` on the right. Content sits in `.view-padded` at **24px/32px padding**, dropping to 16px/16px below 768px.

Spacing runs on an **8px grid** (`4 / 8 / 12 / 16 / 24 / 32 / 48 / 80`). Reading text is capped at a **68ch measure**. Dense tables use fixed row heights of **36px** (`30px` compact, `44px` comfortable) so lists scan at a constant rhythm.

Grids are composed from `.g2` / `.g3` / `.g4` and the asymmetric `.g-2-1` (1.85fr / 1.15fr) for main-plus-rail views. Collapse is tiered:

- **1150px** — four- and three-column grids fall to two columns
- **980px** — the sidebar becomes an overlay drawer
- **960px** — planner, library, settings and tasks grids fall to one column
- **768px** — all remaining grids go single-column, page padding tightens
- **640px** — page titles grow to 24px, secondary card-head affordances collapse
- **480px** — cards drop to 16px padding, spacers hide, buttons go `margin-left: auto`

Scrollbars are thin and pill-shaped (6px, translucent slate thumb) so the chrome disappears.

## Elevation & Depth

The system is **flat by default with reactive glow** — confirmed as the elevation philosophy. Surfaces sit level with the canvas and separate through background steps and hairline rules rather than permanent shadow. Depth is *earned*: a shadow and a cyan glow appear only in response to state (hover, focus, elevation), then retract.

### Shadow Vocabulary

- **Card resting** (`0 1px 2px rgba(24,24,27,.03), 0 2px 8px rgba(24,24,27,.04)` light / `0 4px 20px -2px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04)` dark): Barely-there separation at rest — enough to read the plate, not enough to lift it.
- **Product** (`0 1px 2px …, 0 4px 12px …` light / `0 4px 16px rgba(0,0,0,.45)` dark): Persistent app-level chrome — toasts, sticky bars.
- **Elevated** (`0 2px 4px …, 0 8px 24px …` light / `0 12px 30px -4px rgba(0,0,0,.65), 0 0 20px rgba(56,189,248,.12)` dark): Modals, popovers, and any card in its hovered state.
- **Accent glow** (`0 0 16px rgba(91,141,239,.15)` light / `0 0 24px rgba(56,189,248,.2)` dark): Paired with a shadow, never alone — the halo that says "this is live."

Glass surfaces (chat composer, modals) use `rgba(..., 0.85)` background with a **12–16px backdrop blur** and a translucent accent-tinted border.

### Named Rules

**The Reactive Glow Rule.** Nothing glows at rest. Glow is a response to hover, focus, or selection and must be reversible — if a surface is still glowing when nothing is pointing at it, the state has leaked.

## Shapes

The form language is **pill-and-plate**: every control is a full pill (`9999px`), every container is a rectangular plate. Buttons, badges, chips, scrollbars and the skip-link are pills; cards are 16px plates; inputs are 12px — a middle step that reads as "field" rather than "button" or "panel." The scale runs `0 / 6 / 8 / 12 / 16 / 20 / 24 / 9999`.

Borders are hairlines (1px) built from the Ruled Line token — never thick, never doubled. Cards carry a **double-bezel**: a 1px gradient ring painted through a masked pseudo-element so the top-left edge catches a cyan specular highlight, intensifying on hover. Radii are inherited via `border-radius: inherit` on all pseudo-elements so rings never clip.

## Components

Controls are precise and ruled — tight padding, tabular numbers, hairline separation — but rounded enough to stay approachable. Nothing is chunky; nothing is playful.

### Buttons

- **Shape:** Full pill (`9999px`), `9px 18px` padding, 13px label at weight 500. Compact variants `6px 14px` and `4px 10px`.
- **Primary:** Instrument Cyan fill with Deep Navy label (`#0a0f1c`), weight 600, an inset top highlight (`inset 0 1px 0 rgba(255,255,255,.35)`) and a cyan drop glow. A 135° specular gradient fades in over the surface on hover.
- **Hover / Focus:** Accent-tinted background with an accent border and 12px glow; primary lifts `translateY(-1px)` and deepens to Deep Sky. Active presses to `scale(0.98)` / `translateY(0) scale(0.97)`. Transitions are 150ms ease-out-quart for colour, 250ms ease-out-expo for shadow, spring for transform.
- **Secondary:** Bento Plate fill, hairline rule border, Notebook White label — the quiet default.
- **Ghost:** No fill, no border at rest; gains a 4% wash and a hairline on hover.
- **Semantic:** `.danger` (Flagged Red on red-soft) and `.ok` (Verified Green on green-soft), both tinted rather than filled.
- **Disabled:** 40% opacity, no transform, no shadow, `not-allowed`.

### Inputs / Fields

- **Style:** Console Slate background, hairline rule border, 12px radius, `12px 16px` padding, full width.
- **Focus:** Accent border plus a 2px accent outline and a two-layer halo — `0 0 0 3px` accent at 8% **and** `0 0 20px` accent at 4% — while the background lifts to Bento Plate so the field visibly "opens."
- **Labels:** `label.fld span` at 11.5px / 600 / `0.04em` in Cool Graphite, 5px above the field. Hints sit below in Faint Pencil at the 68ch measure.
- **Search:** Same field with a 12px-padded leading icon, pointer-events disabled so it never steals focus.

### Cards / Containers

- **Corner Style:** 16px plate (`12px` in the `pad-sm` compact variant).
- **Background:** Bento Plate with 16px backdrop blur — a machined glass plate.
- **Border:** Hairline Ruled Line, turning Instrument Cyan at 35% on hover.
- **Shadow Strategy:** Reactive Glow Rule — `shadow-card` at rest, `shadow-elevated` + `glow-accent` on hover, paired with a `-2px` lift.
- **Internal Padding:** `22px 24px` (16px below 480px).
- **Header:** `.card-head` is a flex row with 12px gap, a bottom hairline, and a flexible spacer pushing actions right — the ruled notebook line.

### Badges & Chips

- **Style:** Pill, `2px 8px`, 11px weight 500, tabular numerals, 1px transparent border that takes a 15%-alpha tint of the semantic colour.
- **State:** Tinted background + matching text for `crit` / `high` / `med` / `low` / `ok` / `info`; `mute` is transparent with a hairline for neutral tags. The `.scope-chip-bar` and `.page-head` chips share the pill geometry.

### Navigation

- **Style:** Sidebar rail in Well Ink, 248px, with a hairline right edge. Items are 17px stroked icons (stroke-width 1.5) beside 13–14px labels.
- **Default:** Transparent on the rail.
- **Hover:** A 5% navy wash and Notebook White label.
- **Active:** A stronger wash, a bolder label, and a **left marker bar** (`.sb-nav a.active::before`) — the notebook's margin rule marking the current page. Icon and label both shift to accent.
- **Mobile:** Below 980px the rail becomes an overlay drawer; below 640px its internal padding tightens and the header compresses.

### Signature: The Double-Bezel Plate

`.card::before` paints a 1px inset ring through a masked pseudo-element (`mask-composite: exclude`) with a 135° gradient running accent → white → transparent → accent. At rest it sits at 60% opacity; on hover it reaches full strength alongside the lift and glow. It is the one piece of flourish in an otherwise restrained system, and it is what keeps the plates from reading as generic rounded rectangles.

## Do's and Don'ts

### Do:

- **Do** read every colour from a token so a component is correct in both registers — dark values come from `[data-theme="dark"]`, light from `:root`.
- **Do** apply `font-variant-numeric: tabular-nums` to any figure the user scans or compares in a column.
- **Do** keep the 8px spacing grid (`4 / 8 / 12 / 16 / 24 / 32 / 48 / 80`) and cap reading text at the 68ch measure.
- **Do** reserve glow and shadow for hover, focus, and selection, and retract them when the state ends.
- **Do** use pills for controls and 8–16px plates for containers, and inherit radius with `border-radius: inherit` on pseudo-elements.
- **Do** lead headings with tight tracking (`-0.02em`) and keep card headers on a hairline rule with a flexible spacer.
- **Do** report workload pressure in calm, factual language — status colours and short labels, not exclamation.

### Don't:

- **Don't** drift toward flat generic SaaS dashboard styling — the ruled structure and the instrument glow are the identity, confirmed as the anti-reference.
- **Don't** hard-code a hex where a token exists; that breaks the Two-Register Rule and splits the source of truth.
- **Don't** let Instrument Cyan become a background wash or cover large fills — the Signal Rule depends on its rarity.
- **Don't** add permanent resting shadow to a surface that isn't elevated, or leave a glow on after hover/focus clears.
- **Don't** thicken borders past 1px hairlines, double them, or round a control with a plate radius (or vice versa).
- **Don't** introduce motivational, gamified, or celebratory treatment — no streaks, confetti, or trophy framing in colour, copy, or motion.
