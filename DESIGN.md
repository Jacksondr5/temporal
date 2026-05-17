---
name: PR Review Operator
description: An operations-room interface for an AI-driven pull request review system
colors:
  charcoal: "oklch(0.16 0.012 50)"
  charcoal-up: "oklch(0.20 0.014 55)"
  charcoal-deep: "oklch(0.13 0.01 50)"
  panel: "oklch(0.21 0.014 55)"
  panel-hover: "oklch(0.25 0.016 55)"
  rule: "oklch(0.32 0.014 55)"
  rule-strong: "oklch(0.42 0.016 55)"
  inspector-canvas: "oklch(0.15 0.01 240)"
  inspector-panel: "oklch(0.20 0.012 245)"
  cream: "oklch(0.92 0.008 75)"
  cream-dim: "oklch(0.75 0.012 70)"
  cream-soft: "oklch(0.55 0.012 65)"
  phosphor: "oklch(0.83 0.16 75)"
  phosphor-dim: "oklch(0.62 0.12 75)"
  scope-green: "oklch(0.74 0.16 145)"
  caution-yellow: "oklch(0.85 0.18 95)"
  oxide-red: "oklch(0.62 0.20 30)"
  indigo-fold: "oklch(0.55 0.14 280)"
  station-blue: "oklch(0.62 0.12 240)"
typography:
  display:
    fontFamily: "\"IBM Plex Sans Condensed\", Inter, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "0.005em"
  headline:
    fontFamily: "\"IBM Plex Sans Condensed\", Inter, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.04em"
  title:
    fontFamily: "\"IBM Plex Sans Condensed\", Inter, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.005em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  meta:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.5
  mono:
    fontFamily: "\"JetBrains Mono\", ui-monospace, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  inspector-title:
    fontFamily: "\"JetBrains Mono\", ui-monospace, Menlo, monospace"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  micro:
    fontFamily: "\"JetBrains Mono\", ui-monospace, Menlo, monospace"
    fontSize: "10.5px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.18em"
  label:
    fontFamily: "\"IBM Plex Sans Condensed\", Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.18em"
rounded:
  sharp: "0"
  hairline: "1px"
  pill: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  xl: "28px"
  xxl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.phosphor}"
    textColor: "{colors.charcoal-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.sharp}"
    padding: "10px 22px"
  button-primary-hover:
    backgroundColor: "oklch(0.88 0.16 75)"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.cream}"
    typography: "{typography.label}"
    rounded: "{rounded.sharp}"
    padding: "10px 22px"
  button-secondary-hover:
    textColor: "{colors.phosphor}"
  button-tech:
    backgroundColor: "transparent"
    textColor: "{colors.cream}"
    typography: "{typography.mono}"
    rounded: "{rounded.sharp}"
    padding: "6px 12px"
  chip-filter:
    backgroundColor: "transparent"
    textColor: "{colors.cream-dim}"
    typography: "{typography.label}"
    rounded: "{rounded.sharp}"
    padding: "8px 14px"
  chip-filter-active:
    backgroundColor: "{colors.phosphor}"
    textColor: "{colors.charcoal-deep}"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.cream}"
    rounded: "{rounded.sharp}"
  panel-inset:
    backgroundColor: "{colors.charcoal-up}"
    textColor: "{colors.cream-dim}"
  panel-deep:
    backgroundColor: "{colors.charcoal-deep}"
    textColor: "{colors.cream-dim}"
  panel-inspector:
    backgroundColor: "{colors.inspector-panel}"
    textColor: "{colors.cream}"
  input-text:
    backgroundColor: "{colors.charcoal-up}"
    textColor: "{colors.cream}"
    typography: "{typography.mono}"
    rounded: "{rounded.sharp}"
    padding: "8px 12px"
  input-text-focus:
    backgroundColor: "{colors.charcoal-up}"
    textColor: "{colors.cream}"
---

# Design System: PR Review Operator

## 1. Overview

**Creative North Star: "The Machine Room"**

The interface is a 1970s-flavored computer operations room reimagined for an autonomous-agent age. The user is at a workstation, on a desktop monitor, watching a fleet of pull requests being worked on by AI agents and reading what the agents wrote about each one. The aesthetic borrows from mission-control consoles, oscilloscope readouts, and flight-data recorders, not from the SaaS observability dashboards or the editorial-typographic Linear-likes that dominate this category. The ground is a warm charcoal, never blue-black. The dominant accent is phosphor amber, never cyan. The typography is industrial: a condensed sans for instrument-panel chrome, a humanist sans for human prose, a geometric mono for technical readouts. There are no rounded corners and no decorative shadows.

The system is full-bleed at desktop widths, because the user is at desktop widths. The page does not max-width to a centered column; PR rows stretch across the screen and carry telemetry on the right of every row. The vocabulary is data-dense without being noisy: density comes from whitespace, weight, and tonal layering, not from shrinking type.

The design is committed to two reading modes that share one chrome family but feel unmistakably distinct from across the room. **Operator** is the default — operator-friendly verbs, hidden internal phase enums, no SHAs unless asked. **Inspector** flips the title typography to mono, exposes every internal field in a 4-column technical-signals grid, and marks itself with a sticky diagonal-stripe band along the top of the page. The mode shift is structural, not a quiet badge.

**Key Characteristics:**
- Warm charcoal canvas, never blue-black or pure black.
- One dominant accent (phosphor amber) reserved exclusively for "live."
- Hard edges by default. Border-radius zero. Rounded corners are not part of this design language.
- Three type families with non-overlapping roles: condensed sans for chrome, humanist sans for prose, geometric mono for technical data.
- Tonal layering carries depth. Drop shadows are reserved for the phosphor glow on live indicators.
- Density at desktop widths. Telemetry pinned to the right of every PR row.
- Mode (Operator vs Inspector) signaled by chrome, not by a label.

## 2. Colors: The Operations-Room Palette

A warm charcoal canvas with one dominant accent (phosphor amber, used exclusively for "live"), three named status hues that carry the rest of the lifecycle, and two cool-leaning ink colors used sparingly for handoff and reviewer events. Everything reads against the charcoal at WCAG 2.2 AA contrast.

### Primary
- **Phosphor** (`oklch(0.83 0.16 75)`): the live color, period. Used on running PRs, live LEDs, the brand mark, primary buttons. Never as a decoration. See *The Phosphor Reservation Rule* below.

### Secondary (status hues)
- **Scope Green** (`oklch(0.74 0.16 145)`): healthy / settled. Recently completed runs, "no findings" reviewers, clear states.
- **Caution Yellow** (`oklch(0.85 0.18 95)`): dirty / re-run pending / stale. Also signals INSPECT mode chrome.
- **Oxide Red** (`oklch(0.62 0.20 30)`): blocked / held / errored. Stack-trace accent.
- **Indigo Fold** (`oklch(0.55 0.14 280)`): deferred / handed off (Linear). Cool, distinct from Station Blue.
- **Station Blue** (`oklch(0.62 0.12 240)`): reviewer events (specialized reviewer runs).

### Neutral
- **Charcoal** (`oklch(0.16 0.012 50)`): page canvas (Operator).
- **Charcoal Up** (`oklch(0.20 0.014 55)`): secondary surface, telemetry inset, panel header bar.
- **Charcoal Deep** (`oklch(0.13 0.01 50)`): stack-trace surface, raw JSON wells.
- **Panel** (`oklch(0.21 0.014 55)`): card / station rack surface.
- **Panel Hover** (`oklch(0.25 0.016 55)`): row hover state.
- **Inspector Canvas** (`oklch(0.15 0.01 240)`): page canvas (Inspector mode only). A hair cooler than Operator's charcoal so the eye registers the mode shift before reading any chrome.
- **Inspector Panel** (`oklch(0.20 0.012 245)`): panel surface in Inspector mode.
- **Rule** (`oklch(0.32 0.014 55)`): hairline borders, row separators.
- **Rule Strong** (`oklch(0.42 0.016 55)`): section dividers, button outlines.
- **Cream** (`oklch(0.92 0.008 75)`): primary text, never `#fff`.
- **Cream Dim** (`oklch(0.75 0.012 70)`): secondary text, prose body.
- **Cream Soft** (`oklch(0.55 0.012 65)`): tertiary text, eyebrow labels, idle indicators.

### Named Rules

**The Phosphor Reservation Rule.** Phosphor amber is reserved for "live" exclusively. Live PRs, live LEDs, live indicators in the rack, primary action buttons (which are themselves live). The dominance is the point — when the eye sees phosphor, it means *something is happening right now*. Phosphor never appears as a decorative tint on idle elements, brand marks that aren't connection-state indicators, or hover states on neutral surfaces.

**The One Color One Shape Rule.** Each status concept maps to exactly one color *and* exactly one shape. The mapping is identical across every screen and every component (LED, status mark, indicator dot, badge). See [docs/design/status-vocabulary.md](docs/design/status-vocabulary.md) for the canonical mapping. WCAG 2.2 AA: status is never communicated by color alone.

**The No-Black Rule.** The canvas is `oklch(0.16 0.012 50)`. It is never `#000`. Every neutral is tinted toward the warm hue family (`50`–`55` in OKLCH terms) so the dark surface reads as warm charcoal, not gunmetal. Inspector mode breaks this with a deliberate cool tilt to `240`–`245`, signaling its different mood.

## 3. Typography

**Display Font:** IBM Plex Sans Condensed (with Inter fallback) — instrument-panel chrome.
**Body Font:** Inter (with system-ui fallback) — human prose, agent reasoning, summaries.
**Mono Font:** JetBrains Mono (with ui-monospace fallback) — SHAs, traces, technical key/value data.

**Character:** A three-family system where each family has a distinct, non-overlapping role. The condensed sans makes labels and headlines feel like a stenciled instrument readout. The humanist sans makes agent reasoning feel like a person wrote it. The geometric mono makes technical data feel like an instrument trace. Mixing roles dilutes the system.

### Hierarchy
- **Display** (700, 32px / 1.08, tracked +0.005em): page-level titles like "feat: streaming RSC" on the PR detail header. Mixed-case (set the actual subject), distinct from Headline which uppercases.
- **Headline** (700, 26px / 1.05, tracked +0.04em, UPPERCASE): page heads on list views — "12 OPEN · 2 NEED OPERATOR".
- **Title** (600, 17px / 1.3, mixed case): row primaries like the PR subject inside a station-row.
- **Body** (400, 14px / 1.55): default text, agent reasoning, prose quotes. Capped at **80ch** for prose readability — see *The Reading Cap Rule*.
- **Meta** (500, 12.5px / 1.5): secondary metadata, telemetry rows, signal-cell sub-text.
- **Mono** (400, 12px / 1.5): technical key/value data, SHAs, paths, telemetry values.
- **Inspector Title** (600 mono, 22px / 1.25): the PR detail title in Inspector mode only — the typography itself signals the mode shift.
- **Micro** (500 mono, 10.5px / 1.3, tracked +0.18em, UPPERCASE): eyebrow labels, panel headers like "Technical Signals · pullRequests".
- **Label** (700 condensed, 11px / 1.05, tracked +0.18em, UPPERCASE): button labels, state tags, filter chips.

### Named Rules

**The Three-Role Rule.** Condensed sans is for chrome (labels, headlines, state tags, button text). Humanist sans is for prose (agent reasoning, summaries, body text). Geometric mono is for technical data (SHAs, traces, key/value telemetry). Crossing roles is forbidden: condensed sans never appears as body prose; mono never appears as a button label; sans never appears as SHA text.

**The Reading Cap Rule.** Agent prose elements (`.quote`, `.reasoning-quote`, narrative summaries) cap at 80ch for readability. Technical content — stack traces, retry lists, telemetry tables, commit chips, raw JSON — uses the full available width of its container. The cap applies to prose, not to data.

**The Inspector Mono Rule.** In Inspector mode, the PR detail's title flips to JetBrains Mono. Operator mode keeps it in IBM Plex Sans Condensed. The typography difference is one of three signals (alongside the diagonal-stripe band and the caution-yellow chrome accents) that mark which mode the user is in.

## 4. Elevation

This system has no drop shadows on chrome. Depth is conveyed through tonal layering (charcoal → charcoal-up → panel → panel-hover) and through hairline rules. Shadows exist for exactly one purpose: the phosphor glow on live LEDs, where the bloom communicates "alive" rather than depth. Anything else is forbidden.

The Inspector mode's diagonal-stripe band is not a shadow; it's a printed-tape mode-marker, full-bleed and sticky-positioned at the top of the viewport.

### Shadow Vocabulary
- **Phosphor Bloom** (`box-shadow: 0 0 0 1px oklch(0.42 0.016 55), 0 0 12px 2px oklch(0.83 0.16 75 / 0.4)`): applied only to `.led.is-live` and a few adjacent live indicators. The 1px ring grounds the LED on its surface; the 12px-radius bloom communicates liveness.
- **Status Halo** (`box-shadow: 0 0 0 1px oklch(0.42 0.016 55), 0 0 4px 1px <status-color> / 0.35`): a dimmer halo applied to non-live status LEDs (healthy, caution, blocked) to keep them legible against the panel surface without implying liveness.

### Named Rules

**The No-Shadow Rule.** Drop shadows on cards, panels, buttons, modals, dropdowns are forbidden. Surfaces that lift on hover do so by tonal change (panel → panel-hover), not by shadow. Modals — when they appear at all — are bordered, not lifted.

**The Phosphor Glow Exception.** The only legitimate use of `box-shadow` outside zero-blur rings is the phosphor bloom on live indicators. If something is going to glow, it is going to mean "live." Otherwise it is going to be flat.

## 5. Components

### Buttons

- **Shape:** Sharp rectangles (border-radius 0). Padding 10px / 22px on default, 6px / 12px on the smaller `.btn.is-tech` mono variant.
- **Primary:** Phosphor-amber background, charcoal-deep text, condensed-sans label. Hover lifts to a brighter phosphor (`oklch(0.88 0.16 75)`).
- **Secondary:** Transparent with a 1px rule-strong border, cream text. Hover swaps the border and text to phosphor.
- **Tech:** Mono typography, smaller padding, transparent background. Used for inspector-mode actions like "view raw JSON ↗", "copy workflow id". Always paired with a destination glyph (`↗` for opens-in-new-tab, `→` for in-app navigation, `↓` for downloads).

### Filter chips
- **Shape:** Rectangular, sharp corners, 8px / 14px padding. Sit inside a 1-rule-bordered container with 4px gap between chips.
- **Default:** transparent, cream-dim text, condensed-sans label.
- **Active:** phosphor background, charcoal-deep text. The phosphor here is the same single live color — an active filter is "what's live in your view right now."
- **Counts:** Always include a count next to the label, in mono, smaller, dimmer.

### Panels (the canonical "rack")
- **Shape:** Sharp rectangles, 1px rule border, no shadow. The system uses panels everywhere a card would have appeared in a more conventional design — but the panel is bordered and tonal, never lifted.
- **Background:** `panel` surface (`oklch(0.21 0.014 55)`).
- **Hover (when interactive):** `panel-hover`. Tonal step, never a shadow.
- **Header bar:** When a panel has a header, it sits in `charcoal-up` with a 1px rule beneath, micro-typography uppercase tracked, phosphor or caution-yellow text depending on mode.
- **Inset (deeper surface):** `charcoal-deep` for stack traces and raw JSON wells. Always reads as the deepest available tonal step.

### Inputs
- **Shape:** Sharp rectangles, 1px rule border, mono typography.
- **Default:** `charcoal-up` background, cream text, 8px / 12px padding.
- **Focus:** Border switches to phosphor at full opacity (1.5px). No outer ring; the border itself carries the focus indication.

### Navigation (the "rack" at top)
- **Shape:** A panel spanning the full viewport width with a 1px rule border. Sharp corners.
- **Brand:** A small live LED + condensed-sans wordmark + mono subtitle.
- **Tabs:** Rectangular buttons, sharp corners, transparent default, phosphor-bordered when active.
- **Right side:** Connection state ("Convex Live") + a mono clock readout.

### StatusMark (signature)
The canonical status primitive. See [docs/design/status-vocabulary.md](docs/design/status-vocabulary.md) for the complete shape and color mapping. Each status concept (live, healthy, caution, blocked, deferred, reviewer, idle, skipped) has exactly one shape and one color. The component is the same primitive everywhere it appears — station-row LED, activity-stream event dot, reviewer-row tag, signal-cell glyph.

### StationRow (signature, the PR row)
The home page's PR row. A 3-column layout: 64px stamp column (LED on a tonal stamp surface) | flexible body (PR meta line + subject + state line) | fixed 460px telemetry panel on the right (a 4-column key/value mono grid showing Branch, Threads, Last activity, Reviewers).

The whole row is a panel. Hover lifts to `panel-hover`. The LED in the stamp column is the canonical StatusMark for the PR's lifecycle state. The state-tag (uppercase condensed, status-color) reinforces the LED — color AND shape AND text.

### CommitChip (signature)
The visual primitive that makes commits first-class artifacts. A bordered inset (`charcoal-up`) with a 1px scope-green border. Layout: leading icon + small uppercase "COMMIT" label (in scope green) + short SHA (in phosphor, mono) + commit subject (humanist sans, body size) + change-stats (mono, dim, right-aligned).

The chip appears wherever a commit needs to be referenced — inside an activity-stream event card, in the Inspector's outputs panel, in any future surface. Never modified per surface. The component is the visual language for "this is a commit the agent made."

### TechDrawer (signature, Inspector only)
The per-event technical sidebar in the Inspector's activity stream. Absolute-positioned to the right of an event's body, 380px wide. Contains a stack of 110px-key / flex-value mono rows showing internal data: runId, phase, target/observed SHA pair, provider, workspacePath, token usage, command. Bottom of the drawer carries 1–2 mono action buttons ("view detailsJson ↗", "tail agent stdout"). Body of the event flows naturally on the left with `padding-right: 400px` to reserve drawer space.

### StackTraceBlock (signature, error story)
A `charcoal-deep` surface with a 2px oxide-red top border, mono typography at 12px / 1.65, max-height 432px (~24 visible lines), `overflow-y: auto` and `overflow-x: hidden`. Lines wrap via `white-space: pre-wrap` and `overflow-wrap: anywhere` — stack traces never produce horizontal scrollbars. Error messages render in oxide-red; frame names in cream; paths in cream-soft; line numbers in phosphor. The component is full-fidelity: no truncation, no smart parsing.

### Mode Band (signature, Inspector only)
A sticky 4px diagonal-stripe band along the top of the viewport (caution-yellow stripes against charcoal). Visible at all scroll positions. Combined with the mode tag in the rack and the JetBrains Mono detail title, it makes Inspector mode unambiguous from across the room.

## 6. Do's and Don'ts

### Do
- **Do** use phosphor amber exclusively for "live." If something is glowing, it means it is happening right now.
- **Do** make every status concept distinguishable by **shape AND color**. Color-blind users must be able to read the system without text labels (WCAG 2.2 AA).
- **Do** keep agent reasoning in humanist-sans body typography (Inter, 14px / 1.55). It is the most valuable text on the screen.
- **Do** show signals **stacked**, not synthesized. Multiple short status lines beat one synthesized English sentence whenever the synthesis would lie about the underlying state.
- **Do** hard-edge everything. Border-radius is `0`. Rounded corners are not part of this design language.
- **Do** pin technical telemetry to the right of every PR row in a 4-column key/value mono grid. The telemetry is not optional; it is part of the row's identity.
- **Do** mark Inspector mode unambiguously: the diagonal-stripe band, the caution-yellow chrome, and the JetBrains Mono title together signal the mode from across the room.
- **Do** show the full text of an error including its complete stack trace. No truncation, no horizontal scroll.
- **Do** use full viewport width on desktop. The user is at a workstation; a centered narrow column wastes their screen.

### Don't
- **Don't** look like a generic SaaS observability dashboard (DataDog, Grafana, Datadog clones). No big-number-with-tiny-label hero stats. No identical 4-up card grids. No gradient accents.
- **Don't** look like a raw debug console (GitHub Actions log walls, the Temporal Web UI's default). No "everything is a badge with a timestamp." No flat tables of internal field names without operator-language translation.
- **Don't** look like a consumer-warm or playful tool. No soft pastels, no illustrated empty states, no mascot-energy microcopy, no rounded-everything chrome.
- **Don't** look like an enterprise admin console (ServiceNow, Jira admin). No dense gray tables with blue underlined links. No three-tab settings hierarchies.
- **Don't** use drop shadows on chrome. Depth comes from tonal layering, not from blur. The phosphor glow on live LEDs is the only exception.
- **Don't** use rounded corners as decoration. Border-radius is `0` on virtually every component. The rare 1–2px radius is reserved for badge-like accents and never as visual softening.
- **Don't** wrap stack traces in horizontal scroll. They always wrap with `pre-wrap` + `overflow-wrap: anywhere`.
- **Don't** let prose stretch past 80ch. Agent reasoning must remain readable.
- **Don't** synthesize a single English sentence when multiple signals are in conflict (dirty AND blocked, retrying AND partial-success). Surface the signals stacked.
- **Don't** show internal phase enums (`handling_code_rabbit`, `running_special_reviewers`) in Operator mode. Translate them via [docs/design/status-vocabulary.md](docs/design/status-vocabulary.md). Inspector shows the verbatim internal value.
- **Don't** show SHAs in Operator mode. SHAs are an Inspector concern.
- **Don't** use cyan, blue-black, or pure black anywhere. The charcoal is warm. The accent is phosphor amber, not phosphor green and not terminal cyan.
- **Don't** mix the three type families' roles. Condensed sans is for chrome only. Humanist sans is for prose only. Mono is for technical data only.
- **Don't** wrap everything in a max-width container. The system is desktop-first and full-bleed.
