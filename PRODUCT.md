# Product

## Register

product

## Users

The operator dashboard's primary user today is Jackson — the engineer who built the system and runs it on a private home network. Engineers will join over time as the orchestrator graduates from solo operation toward shared use.

The user is at a desk, on a large screen, in a working session. They open the UI for one of two reasons:

1. **"Is this PR healthy?"** — a glance question. They want to know, across all open PRs, where the agent is working, where it's stuck, and where a human needs to step in. Time-to-answer is measured in seconds, not clicks.
2. **"What did the agent actually do, and why?"** — a debugging question. They want to read the agent's reasoning on a specific run, see which threads it acted on, follow the chain of events on a PR through time, and reconcile the visible behavior against the internal state machine. Time-to-answer here is measured in minutes; depth matters more than speed.

The audience is technical. They are comfortable reading SHAs, stack traces, and internal phase enums — but they should not have to, unless they ask. The UI lets a new engineer answer the glance question without any prior context, and lets a system author answer the debugging question without ever leaving the app.

## Product Purpose

The orchestrator runs a long-lived Temporal workflow per pull request, dispatches AI agents to fix failing checks, address CodeRabbit feedback, run specialized reviewer passes, and resolve merge conflicts. Decisions, reasoning, and outputs accumulate in Convex.

This UI is the operator's window into that system. It exists to:

- Make agent decisions and reasoning legible — the agent's prose is the most valuable artifact the system produces, and it should read like the answer to a question, not like a metadata field.
- Make the state of every PR observable at a glance, with motion communicating liveness honestly rather than decoratively.
- Let an operator drill from glance → story → raw internal state without context-switching to logs, Convex queries, or the Temporal UI.
- Surface commits and other agent outputs as first-class artifacts. A commit an agent pushed is a real outcome of the system, not a footnote on a run.

Success means: the operator never opens Temporal Web UI or Convex dashboard to answer a normal question. They only open the operator UI.

## Brand Personality

**Operational, narrative, alive.**

- **Operational** — every pixel earns its place in a working session. Density is achieved through whitespace and weight, not by shrinking type. The interface respects the user's time and their existing technical fluency.
- **Narrative** — agent reasoning is foregrounded as prose. A PR's history reads as a sequence in time, not a grid of sibling sections each telling a partial story. Errors are explained, not labeled.
- **Alive** — running PRs visibly breathe. Motion is reserved for liveness — there is no decorative animation. A PR that is doing work looks unmistakably different from a PR that is idle, even from across the room.

Voice and tone in copy: direct, unhedged, never cute. The product talks to a peer, not a customer. No exclamation points, no marketing voice. Internal state-machine names are translated to operator language in the default view ("Reviewing CodeRabbit feedback", not `handling_code_rabbit`) and shown verbatim when the operator opts into the inspector surface.

## Anti-references

This UI must not look or feel like:

- **A generic SaaS observability dashboard** — DataDog, Grafana, the "hero metric + supporting tiles + gradient accent" template. Identical 4-up card grids. Big-number-with-tiny-label hero stats. Anything that looks like it could be screenshot-swapped with a competitor's landing page.
- **A raw debug console** — GitHub Actions log walls, the Temporal Web UI's default presentation, "everything is a badge with a timestamp", flat tables of internal field names. The existing UI's failure mode is reading like a debug console; the redesign is a deliberate move away from that.
- **A consumer-warm or playful tool** — soft pastels, illustrated empty states, mascot-energy microcopy, rounded-everything chrome. This is a working tool for a technical operator, not a delightful daily driver.
- **An enterprise admin console** — ServiceNow / Jira-admin styling. Dense gray tables, blue underlined links, hierarchical sidebars, breadcrumb-everywhere navigation, settings buried under three layers of tabs.

The fact that the system is dark-themed, tabular, and SHA-friendly does not require it to land in any of these aesthetic families. The anti-references exist precisely because category-reflex would push it toward the first two.

## Design Principles

### 1. Health first, detail on demand

Every screen leads with current status. Internal detail is reachable in one navigation, but never the first thing on screen. The operator should be able to answer "is this PR healthy?" without scrolling, expanding, or hovering.

### 2. Agent reasoning is the product

The most valuable content the system produces is what an agent thought — its investigation summary, final assessment, per-thread rationale, and explanation when it chose not to act. These read as prose at body-typography quality, not as collapsed key-value pairs. Token counts, provider names, and workspace paths are not the product.

### 3. Two surfaces, not progressive disclosure

The operational view (default) and the inspector view (opt-in) are separate routes with their own component trees. The operator view hides internal phase enums, SHAs, raw JSON, and noop reconciliations entirely. The inspector view exposes everything. The split is structural, not a "show advanced details" toggle, because the two surfaces are read by people in different mental modes and should evolve independently.

### 4. Show signals, don't synthesize verdicts

When the underlying state is ambiguous — dirty and blocked, retrying after partial success, deferred to Linear with one thread still open — the UI surfaces the underlying signals directly, in operator language. It does not collapse them into a single English sentence that pretends the state is simpler than it is. A short stack of signal lines beats one synthesized sentence whenever the synthesis would lie.

### 5. Time is the primary axis

A PR is a sequence of events in time, not a set of sibling sections each telling a partial chronological story. The PR detail page is structured around one unified timeline. Reviewer runs, errors, manual re-evaluations, and agent runs are all events on the same axis, distinguished by their canonical status mark — not by which sub-section of the page they live in.

## Accessibility & Inclusion

Target: **WCAG 2.2 AA**.

- **Color is never the only signal.** Every status concept (live, healthy, idle, caution, blocked, deferred, reviewer, skipped) is conveyed by a shape *and* a color, so the system remains readable under deuteranopia, protanopia, and tritanopia, and in screenshots posted to monochrome channels.
- **Motion respects `prefers-reduced-motion`.** Indeterminate sweeps, breathing rails, and pulse animations all collapse to a static state when the OS-level preference is set. Status is still communicated through color and shape.
- **Focus states are first-class.** Every interactive element has a visible focus ring — keyboard navigation must remain usable for an operator who is debugging a stuck PR while also juggling a terminal.
- **Body text minimum 14px.** No 10–11px content text. Section labels in micro-caps are the only place small type is acceptable, and they carry no informational weight that isn't repeated elsewhere.
- **Color contrast ratios meet AA against the canvas surface** for every status color and every text role (default, muted, mono).
