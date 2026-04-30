# Operator UI Redesign

## Status

Evergreen product/design document. Defines the design principles, design
system, and per-screen direction for the operator UI. Updates to the operator
UI should land in this document so it stays the source of truth.

## Why Redesign

The current UI accumulated detail faster than structure. It surfaces almost
every field the orchestrator emits at the same visual weight, which makes it
read as a debug console rather than an operational tool. Specifically:

- Internal state-machine labels (`handling_code_rabbit`, `running_special_reviewers`)
  appear directly in the UI.
- Inconsistency warnings written for engineers ("observedCommitSha present
  but didCommitCode is false") sit next to first-order operator information.
- Both `targetHeadSha` and `observedCommitSha` are shown inline on every run
  row.
- Token counts, workspace paths, and provider metadata all share visual weight
  with agent reasoning text, which is the actual product of an agent run.
- Noop reconciliations render in the main timeline, even when collapsed.
- Live/in-progress states use a small `animate-status-pulse` dot inside a
  badge, which is too subtle to communicate liveness at a glance.
- The home page mixes open, closed, and merged PRs with no default filter.

The redesign keeps every piece of data the orchestrator produces. It changes
how that data is **layered** — surface, story, inspector — so the right thing
is visible at the right moment.

## Audience

The primary user is Jackson today. Engineers will join later. The UI is
designed to be approachable by default for a new engineer who needs to
understand "is this PR healthy?" and "what did the agent decide?" without
prior context, while still letting an operator drill into every internal
field when debugging system behavior.

## Design Principles

### 1. Health first, detail on demand

Every screen leads with current status and most recent activity. Internal
detail is reachable, but never the first thing your eye lands on.

### 2. Two reading modes: Operator and Inspector, on separate routes

Operator and Inspector are full pages with their own routes, not a toggle
on a shared layout. This lets each mode evolve its own component tree and
information architecture without one constraining the other.

- **Operator** is the default. It hides SHAs, workspace paths, raw JSON,
  provider metadata, internal phase labels, command summaries, token usage,
  and noop reconciliations. It uses operator-friendly verbs.
- **Inspector** reveals everything. It is a parallel view of the same PR
  containing the technical layer the current UI exposes today, restyled
  to make clear it is the behind-the-scenes view.

The Operator page links into Inspector with an "Inspect" affordance and
back. The URL is the source of truth for which mode you are in, so links
are shareable for debugging.

### 3. Agent reasoning is the product

The most valuable text on the screen is what an agent thought. The fields
`investigationSummary`, `finalAssessment`, `whyNoCommit`, and per-thread
`reasoningSummary` are the highest-prominence content inside any expanded
run, presented as readable prose, not collapsed key-value pairs.

### 4. Motion encodes liveness, nothing else

Anything that is live or running gets unmistakable motion. Static rows are
static. Decorative animation is removed. Motion lives at the row or card
level, not on a 6px badge dot, so a working PR is unmistakably alive when
scanning the home page.

### 5. Density without screaming

Density is achieved with whitespace, weight, and color contrast — not by
shrinking type to 10–11px. The base text size goes up; the visual weight of
secondary information goes down. Tabular data uses rhythm; narrative content
gets prose-quality typography.

### 6. One canonical visual vocabulary for status

Every status concept (lifecycle, phase, run status, disposition, error
severity) maps to exactly one color and one shape, and that mapping is
identical across every screen. Today these vocabularies are similar but
inconsistent across components.

### 7. Internal language stays internal

State-machine names like `handling_code_rabbit` are translated to operator
language ("Reviewing CodeRabbit feedback") in Operator mode and shown
verbatim in Inspector mode. The translation table is centralized.

### 8. Surface the signals, do not synthesize the verdict

The operator status block exposes the underlying signals
(`phase`, `lifecycleState`, `dirty`, `blockedReason`, `statusSummary`,
latest run phase/status, last reconciled time) directly, in operator
language. Multiple short lines is preferred over one synthesized English
sentence — the orchestrator's published signals are richer than a single
sentence can faithfully represent, and synthesizing risks misleading
the operator when the underlying state is ambiguous.

### 9. Time is a first-class structural element

A PR's story is a sequence of events in time. The PR detail page treats time
as the primary axis: one unified vertical timeline, not four sibling sections
("Reconciliation Timeline", "Specialized Reviewers", "Artifacts", "PR Events")
that each tell a partial chronological story.

### 10. Errors are stories, not labels

A blocked or errored state gets a "what, why, what to do" treatment with
the agent's last reasoning surfaced inline, instead of a red badge plus an
`errorType` string and a `lastSeenAt` time.

### 11. Commits are first-class

A commit produced by an agent is a primary outcome of the system, not a
metadata footnote. Every event that produced a commit shows that commit
prominently, with a clear visual link from the activity (e.g. "Reviewing
CodeRabbit feedback") to the commit it pushed. The operator should never
have to expand a card or hop to GitHub to answer "which run produced this
commit?" or "did this CodeRabbit run actually push something?".

This applies to all three activities that can produce commits: `fix_checks`,
`handle_code_rabbit`, and specialized reviewer runs.

## Design System

### Color palette

The current palette is teal-on-near-black with status colors mixed in at low
opacity (`bg-emerald-500/10 text-emerald-400 ring-emerald-500/20` everywhere).
The result reads as a single muted teal field with hard-to-distinguish status
tints.

The new palette borrows from telemetry / control-room aesthetics: a warm dark
canvas with deliberately spaced status hues that read clearly against it.

#### Surfaces

| Token | OKLCH | Notes |
|---|---|---|
| `--surface-canvas` | `oklch(0.14 0.012 255)` | Page background |
| `--surface-panel` | `oklch(0.18 0.014 255)` | Cards |
| `--surface-panel-hover` | `oklch(0.21 0.016 255)` | Card hover |
| `--surface-inset` | `oklch(0.12 0.01 255)` | Insets like code blocks, raw JSON |
| `--surface-inspector` | `oklch(0.16 0.008 255)` | Inspector page background — slightly desaturated, "behind the scenes" |
| `--border-hairline` | `oklch(0.26 0.01 255)` | Default border |
| `--border-strong` | `oklch(0.34 0.012 255)` | Section divider |

#### Status vocabulary (one mapping, used everywhere)

Each status concept gets one color and one shape. This replaces the ad-hoc
mappings in `status-badge.tsx`.

| Concept | Color name | OKLCH | Shape |
|---|---|---|---|
| **Live** (running, dispatching, refreshing) | Signal Cyan | `oklch(0.80 0.16 220)` | Sweeping bar / animated rail |
| **Healthy** (recently completed, settled) | Lime | `oklch(0.84 0.17 135)` | Filled circle |
| **Idle** (clean, nothing to do) | Slate | `oklch(0.62 0.02 255)` | Hollow circle |
| **Caution** (dirty, retryable, transient) | Amber | `oklch(0.82 0.17 80)` | Filled circle |
| **Blocked** (needs operator, hard fail) | Coral | `oklch(0.72 0.20 25)` | Filled triangle |
| **Deferred / handoff** (passed elsewhere) | Violet | `oklch(0.72 0.18 295)` | Hollow diamond |
| **Reviewer** (specialized reviewer activity) | Indigo | `oklch(0.74 0.16 270)` | Filled square |
| **Skipped** (intentionally not run) | Slate dim | `oklch(0.45 0.015 255)` | Hollow circle, dim |

Brand primary stays cyan-leaning. Default text foreground is
`oklch(0.94 0.005 255)` on canvas. Muted foreground (used much less than
today) is `oklch(0.66 0.015 255)`.

The dot-grid background is removed. It adds visual noise to a UI that already
has many small status indicators.

### Typography

Current: Geist Sans + Geist Mono. Geist Sans stays. Geist Mono is replaced.
The user feedback was that monospace + color is currently hard to read; the
goal is creative-but-recognizable.

| Role | Family | Weight | Notes |
|---|---|---|---|
| UI text | **Geist Sans** | 400 / 500 / 600 | Keep |
| Headings & numerics | **Geist Sans** | 600, with `font-feature-settings: "cv11", "ss01"` | OpenType variants for distinct sevens / ones / zeros |
| Narrative / prose mono | **Monaspace Argon** | 400 / 500 | Humanist mono. PR titles, agent reasoning excerpts where prose flow matters |
| Technical mono (SHAs, code, commands) | **Monaspace Neon** | 400 / 500 | Geometric mono. SHAs, commands, code, raw JSON |
| Tabular numerics | Geist Sans + `font-variant-numeric: tabular-nums` | — | All counts, durations, timestamps |

Monaspace is GitHub's open-source variable-monospace family. Two faces from
the same family gives a creative, slightly distinctive feel while staying
legible. Argon for prose vs Neon for code is a meaningful distinction the eye
will pick up on.

#### Type scale

Going up from today's 10–13px range. Density is preserved by tightening
spacing and sharpening hierarchy, not by shrinking type.

| Token | Size | Use |
|---|---|---|
| `text-display` | 22px / 1.2 | Page titles |
| `text-title` | 16px / 1.35 | Section titles, PR row primary |
| `text-body` | 14px / 1.5 | Default text, most prose |
| `text-meta` | 13px / 1.4 | Secondary metadata, timestamps |
| `text-mono-sm` | 12.5px tabular | SHA fragments, IDs |
| `text-micro` | 11px uppercase tracked | Section labels only — never for content |

The current 10px content text is gone.

### Motion language

Today motion is over-applied in low-impact places (a 6px pulsing dot inside
a 24px badge) and absent where it would matter (a row containing a running
PR looks identical to a row containing an idle PR).

| State | Motion |
|---|---|
| Static / settled | None |
| Pending / queued | 2.4s slow opacity pulse on the row's left status rail |
| Running / dispatching | Continuous indeterminate sweep along the row's left rail and across the top of the active card |
| Just transitioned | One-shot 600ms color flash from previous status color to new status color |
| Stale (no recent reconcile and dirty) | Subtle 4s amber breath on the row rail |
| Stuck / blocked | Coral rail, no motion (drawing attention through color, not noise) |

### Density and spacing

- 4px base spacing unit, with a strict 4 / 8 / 12 / 16 / 24 / 32 scale.
- Card padding: 16px on the body, 12px on tight inline rows.
- List row vertical padding: 10px.
- Hairline borders only as separators between rows or sections. The current
  pattern of putting `ring-1 ring-inset` on every badge is dropped; status
  pills use solid color blocks instead, which read more clearly and reduce
  visual ringing.

### Iconography

Continue with `lucide-react`. Standardize sizes: 14px in dense rows, 16px in
section headers, 20px in empty states. The current mix of `h-3 w-3`,
`h-3.5 w-3.5`, and `h-4 w-4` is unified.

### Layered detail strategy

The design answer to "approachable by default, can drill down to everything."
Information lives in three layers, with progressive disclosure between them.

1. **Surface** — always visible, no interaction needed. Current status
   signals, last action, blocker, time. Operator-friendly language.
2. **Story** — one click of expand or scroll. Agent rationale, decision per
   thread, findings, handoffs. The narrative of what happened and why.
3. **Inspector** — reached by navigating to the Inspector route. SHAs,
   workspace paths, provider names, command summaries, token usage, raw
   JSON, internal phase labels.

The Operator route shows layers 1 + 2. The Inspector route shows all three.

## Routes

URL is the source of truth for which mode the user is in. The split into
two routes (rather than a query string toggle) keeps the two reading modes
in independent component trees so each can evolve without compromising the
other.

| Route | Page |
|---|---|
| `/` | PR list (Operator) |
| `/pr/[repoSlug]/[prNumber]` | PR detail (Operator) |
| `/pr/[repoSlug]/[prNumber]/inspect` | PR detail (Inspector) |
| `/policies` | Policies list |
| `/policies/[repoSlug]` | Policy editor |

The PR list does not need an Inspector variant — there is little Inspector
content meaningful at the list level, and the Operator list links into
either Operator or Inspector PR detail depending on how the user navigates.

## Component Patterns

Defined here in prose; concrete component implementations come in the
implementation plan that follows this document.

### PR row (home page)

Replaces the current 7-column grid.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ ▌ vercel/next.js #92413  feat: streaming RSC                            │
│ ▌                                                                        │
│ ▌ ◉ Live · Reviewing CodeRabbit feedback · 2 of 4 threads               │
│ ▌ jackson/streaming-rsc · branch updated 4m ago                         │
└─────────────────────────────────────────────────────────────────────────┘
```

- 4px left rail in the canonical status color of the PR's current state.
  Animated for live, breathing for stale, solid for blocked.
- Title line uses sans for repo + PR# and Argon mono for the PR title.
- The status block surfaces signals directly, in operator language: a
  status mark, the operator-friendly phase, and any inline qualifiers
  (`dirty`, `blockedReason`, count summaries from the latest run).
- Branch and reconcile time on the meta line.
- No SHAs on the home page (those are surfaced in Inspector mode).

### PR detail header — Operator

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  vercel/next.js #92413                          [Re-evaluate now]       │
│  feat: streaming RSC                            [Inspect ↗]             │
│                                                                         │
│  ◉ Live · Reviewing CodeRabbit feedback                                 │
│  ⚠ Dirty — re-reconcile pending                                         │
│  ⓘ Latest run: completed 12s ago — fixed 2 of 4 threads                 │
└─────────────────────────────────────────────────────────────────────────┘
```

- Big title block.
- "Inspect" affordance routes to `/pr/[slug]/[num]/inspect`.
- The status block is a stack of short signal lines, not one synthesized
  sentence. Each line corresponds to a real signal: phase, dirty/blocked,
  latest run summary, manual re-evaluate state, etc. Lines are only shown
  when the underlying signal is present.

### PR detail header — Inspector

The Inspector header keeps the same title and Re-evaluate action and adds
a sibling block exposing the technical signals: branch name, current HEAD
SHA, internal phase enum, internal lifecycle enum, dirty flag, manual event
state, manual claim freshness, workflow ID, last reconciled timestamp. All
in `Monaspace Neon`. A back affordance routes to `/pr/[slug]/[num]`.

### Activity stream

Replaces today's separate sections: "Reconciliation Timeline", "Specialized
Reviewers", "Artifacts", "PR Events".

A single vertical timeline with a left spine, dots in canonical status
shape/color, and cards on the right. Filter chips above:

```text
Filters:  [All]  [Agent runs]  [Reviewers]  [Errors]  [GitHub]    🔍 Search
─────────────────────────────────────────────────────────────────────
│  ◉  4m ago    Working — fixing failing checks
│  │            "ESLint reported 3 errors in apps/web/components/..."
│  │            ▾ See agent reasoning
│  │
│  ●  18m ago   Reviewed CodeRabbit feedback — fixed 3 of 4 threads
│  │            ┌──────────────────────────────────────────────────┐
│  │            │  ⎇  Pushed commit  7c2f4e1a  ↗                   │
│  │            │     fix(rsc): replace manual debounce with        │
│  │            │     useDeferredValue per CodeRabbit guidance      │
│  │            └──────────────────────────────────────────────────┘
│  │            ▾ See full reasoning
│  │
│  ◇  22m ago   Deferred to Linear: ENG-2241
│  │            "Refactor of legacy hook out of scope for this PR"
│  │
│  ▲  31m ago   Blocked — auth token expired refreshing workspace
│  │            (3 retries · last: GitError 'invalid credentials')
│  │            ▾ See last attempt
│  │
│  ■  1h ago    Specialized reviewer: security-reviewer
│  │            No findings, no code changes
│  │
```

- Each event has: status mark + time + verb + one-line summary + expand.
- Operator hides noops, hides system events, and groups consecutive
  reconciliations. Inspector shows them all.
- Expanding an event reveals the Story layer: agent reasoning, findings,
  per-thread decisions.
- Events that produced a commit render a **commit chip** inline as a
  collapsed-state element of the card (see "Commit chip" pattern below).
  The chip is always visible without expanding, so the activity-to-commit
  link is readable at a glance while scanning the stream.
- Other artifacts (GitHub comments, Linear issues) render as smaller inline
  mentions on their parent event — these are not commits and do not get the
  full chip treatment.
- The Artifacts table is removed in Operator mode; the same data is reachable
  via the events that produced it. Inspector mode also gets the Outputs panel
  for grouped lookup.

### Commit chip

The visual primitive that makes Principle 11 ("Commits are first-class")
concrete. Used wherever a commit needs to be referenced inline.

```text
┌──────────────────────────────────────────────────────────┐
│  ⎇  Pushed commit  7c2f4e1a  ↗                           │
│     fix(rsc): replace manual debounce with useDeferred…  │
└──────────────────────────────────────────────────────────┘
```

- Distinct surface (`--surface-panel-hover`) and a 1px accent border in the
  Healthy (lime) status color, so it visually pops out of the parent card.
- `⎇` GitCommit icon at 14px, leading.
- Short SHA in `Monaspace Neon` (technical mono), with a copy-on-click
  affordance. The full SHA appears on hover.
- The commit message subject in `Monaspace Argon` (narrative mono), one
  line truncated.
- `↗` opens the commit on GitHub
  (`https://github.com/<repoSlug>/commit/<sha>`).
- When the parent event is expanded, the chip stays in place; the message
  body grows to two lines and the chip exposes the change-stat summary if
  available (`+12 -4 across 3 files`).
- In Inspector mode, the chip additionally shows the SHA pair (target HEAD
  vs observed commit) using the canonical Inspector typeface.

The chip is the same component everywhere it appears — activity stream
event cards, the Outputs panel commit group, and any future surface that
references a commit. This keeps the visual language for "this is a commit
the agent made" consistent across the app.

### Reviewer summary widget

Specialized reviewers have a small dedicated summary block that lives above
the activity stream on PR detail. It pulls the existing summary fields
already on `reviewerRuns` (`reviewerId`, `status`, `summary`, `matchedFiles`,
finding/handoff counts from `detailsJson`).

```text
Reviewers on this SHA:
  ■ security      ✓ no findings
  ■ perf          ✓ no findings
  ■ a11y          ⚠ 2 findings — see stream
```

The widget is read-only; clicking a reviewer scrolls the activity stream to
that reviewer's most recent event for the current SHA. The widget hides
itself if no reviewers have run on the current SHA.

### Threads section

Stays as a dedicated section above the activity stream because threads are
"current state" while the stream is "history".

- Unresolved threads expanded by default.
- Resolved threads collapsed under a single "Resolved (12)" header at the
  bottom of the section.
- Each thread card foregrounds the disposition (color-blocked badge in the
  canonical vocabulary), the file path, and the body. Decisions render as
  prose with clear "decided X because Y" framing.

### Outputs panel (Inspector only)

Inspector mode includes a compact "Outputs" panel that lists artifacts by
kind, since the artifact set is small and well-defined.

The orchestrator currently produces three artifact kinds:

- **`commit`** — produced by `fix_checks`, `handle_code_rabbit`, and
  specialized reviewer runs.
- **`github_comment`** — produced by `handle_code_rabbit` for `false_positive`
  and `defer` outcomes.
- **`linear_issue`** — produced by `handle_code_rabbit` for `defer` outcomes.

The Outputs panel groups by kind. Commits render as full commit chips so
the visual language matches the activity stream. GitHub comments and
Linear issues render as compact rows with `externalId`, `summary`, and
`createdAt`. This makes it easy to verify at a glance that "every deferred
thread has a Linear ticket" or "the agent pushed exactly one commit this
run" without scrubbing the timeline. Operator mode does not need this
panel — artifacts are already attached to their parent events in the
stream, and commits in particular are surfaced via the commit chip.

### Empty and loading states

- Empty: a quiet sentence with a small icon. No "ghost rows".
- Loading: shimmer rows that match the new row layout, capped at 4 rows so
  the page doesn't feel like a slot machine on every nav.

## Status Semantics Translation Table

Centralized; used by Operator-mode rendering. Inspector mode shows the
internal value verbatim.

| Internal | Operator label |
|---|---|
| `idle` | Idle |
| `refreshing` | Checking GitHub |
| `fixing_checks` | Fixing failing checks |
| `handling_code_rabbit` | Reviewing CodeRabbit feedback |
| `running_special_reviewers` | Running specialized reviewers |
| `resolving_merge_conflicts` / `resolve_merge_conflicts` | Resolving merge conflicts |
| `recording_results` | Recording results |
| `terminal_cleanup` | Cleaning up |

| Internal | Operator label |
|---|---|
| `noop` | (hidden in Operator; "No-op reconciliation" in Inspector) |
| `success` | Completed |
| `failed` | Failed |
| `blocked` | Blocked |
| `skipped` | Skipped |
| `running` | Running |

| Internal | Operator label |
|---|---|
| `fix` | Fixed |
| `false_positive` | Marked as false positive |
| `defer` | Deferred to Linear |

## Per-Screen Direction

### Home page (`/app/page.tsx`)

**Current:** flat 7-column grid (Repository / PR / Branch / State / Status /
Reconciled / chevron) with three badges in the State column. Mixes open,
closed, and merged PRs.

**Direction:**

- New PR row component with a status rail and a stacked operator-language
  signal block.
- Default filter: open PRs only. Filter chips at the top: `Open` (default) /
  `Needs attention` / `Recently merged` / `All`.
- "Needs attention" = lifecycle is open AND (`hasBlockingError` OR `dirty`
  for more than 5 minutes since `lastReconciledAt`).
- Repo grouping is **not** added now (no new functionality); rows sort
  by repo, then by `lastReconciledAt` desc, with live PRs floated to the
  top.
- Counter in the header reflects the active filter ("12 open · 2 need
  attention").
- Row's left rail uses the canonical motion language (sweeping for live,
  amber breath for stale, coral solid for blocked).

### PR detail — Operator (`/pr/[repoSlug]/[prNumber]`)

**Current:** header → workflow state strip → Threads → Reconciliation Timeline
→ Specialized Reviewers → Artifacts → PR Events. Many sibling sections, lots
of badges, SHAs everywhere.

**Direction (top to bottom):**

1. **Header** with title, signal stack, Re-evaluate action, Inspect link.
2. **Threads** section (unresolved expanded, resolved collapsed under a
   group header).
3. **Reviewer summary widget** for the current SHA, when applicable.
4. **Activity stream** — one unified timeline absorbing today's
   Reconciliation Timeline, Specialized Reviewers, Artifacts, and PR Events.
   Filter chips above.

The "Workflow state strip" component is removed — its information is
absorbed into the header signal stack. The "Latest action" / "dirty flag is
set" hint row is dropped; those signals appear as their own lines in the
header signal stack.

### PR detail — Inspector (`/pr/[repoSlug]/[prNumber]/inspect`)

A separate page with its own component tree. Same overall layout shape as
the Operator page so navigation feels consistent, but:

- Header includes the technical signal block (SHAs, internal phase enum,
  workflow ID, manual claim freshness, etc.).
- Activity stream shows noops, system events, both SHA columns per run,
  command summaries, provider metadata, raw JSON toggle, internal phase
  labels, token usage.
- Outputs panel renders below the activity stream.
- Inspector page background uses `--surface-inspector` and Monaspace Neon
  is the dominant typeface, making the mode unambiguous.

### Activity stream sub-design

The stream merges four current sources. Each source maps to one event type:

| Source today | Event type | Operator visible by default? |
|---|---|---|
| `prRuns` (success) | "Agent run" | Yes |
| `prRuns` (failed / blocked) | "Failure" | Yes |
| `prRuns` (noop) | "Reconciliation" | No (Inspector only) |
| `reviewerRuns` | "Specialized reviewer" | Yes |
| `workflowErrors` | "Error" | Yes |
| `artifacts` | folded into the run that produced them | — (Inspector also has the Outputs panel) |
| `events` (githubEvents) | "GitHub event" | No (Inspector or filter) |
| `events` (manual) | "Manual re-evaluate" | Yes |

### Policies list (`/app/policies/page.tsx`)

**Current:** 7-column grid (Repository / Status / Checks / Fixing / Reviewers
/ PRs / chevron) with count badges.

**Direction:**

- Same row pattern as the new PR row (left rail conveys enabled/disabled),
  larger title, secondary line shows the counts as a sentence:
  "12 status checks · 3 fixable · 2 specialized reviewers · 4 active PRs".
- Disabled repos render at lower opacity at the bottom of the list.
- "Caps" indicator (`+`) becomes a tooltip rather than an inline glyph.

### Policy editor (`/app/policies/[repoSlug]/page.tsx`)

**Current:** Save button at top right, three sections (Repository, Status
Checks, Specialized Reviewers).

**Direction:**

- Mostly preserved structure — this screen is already clean.
- Sticky save bar at the bottom of the viewport that appears only when the
  form is dirty, with explicit "Discard" and "Save" actions and a summary
  of what will change ("3 status check changes · 1 reviewer added").
- Status checks list grouped by source (Checks API vs Commit Status) with a
  filter chip.
- Specialized reviewer cards get the new layered treatment: the ID + run
  policy + description on the surface, prompt ID + globs on a "Configure"
  expand, in keeping with the layered-detail principle.

### Navigation (`/components/nav.tsx`)

**Current:** logo + 2 links + a small green "Live" indicator.

**Direction:**

- Keep the structure; restyle to the new color palette and type scale.
- The "Live" pill becomes a small connection-state indicator that uses the
  canonical Live status color and motion. When the Convex subscription is
  reconnecting, it switches to amber.
- The Operator/Inspector mode is **not** a nav element — it lives on the
  PR detail page header, scoped to where it matters.

## Component Inventory

Listed for traceability when the implementation plan is written.

**Replaced or substantially reworked:**

- `components/status-badge.tsx` — replaced by a single `<StatusMark />`
  primitive driven by the canonical vocabulary, plus a `<SignalStack />`
  for the multi-line operator status block on the PR detail header.
- `components/run-detail.tsx` — split into `<ActivityStream />`,
  `<EventCard />`, `<AgentReasoning />`, `<ReviewerEventCard />`,
  `<ErrorEventCard />`, plus Inspector-specific variants.
- `app/page.tsx` — new `<PrRow />`, `<HomeFilterBar />`.
- `app/pr/[repoSlug]/[prNumber]/page.tsx` — Operator page; new
  `<PrHeaderOperator />`, `<SignalStack />`, restructured layout.

**New:**

- `<StatusMark />` — the canonical shape+color primitive.
- `<StatusRail />` — left-edge animated rail for rows and cards.
- `<CommitChip />` — first-class commit reference primitive, used inside
  event cards and the Outputs panel. Implements Principle 11.
- `<ActivityStream />` and event-type cards listed above.
- `<AgentReasoning />` — prose-quality renderer for investigation,
  assessment, and findings.
- `<ReviewerSummary />` — the small per-SHA reviewer block.
- `<SignalStack />` — multi-line operator status block.
- `<FilterChips />` — used on the home page and the activity stream.
- `app/pr/[repoSlug]/[prNumber]/inspect/page.tsx` — Inspector page with
  its own component tree, including `<PrHeaderInspector />`,
  `<TechnicalSignalBlock />`, `<OutputsPanel />`, and Inspector variants of
  the activity stream cards.

**Kept as-is (style updates only):**

- `components/time-ago.tsx`
- `components/convex-provider.tsx`
- All `components/ui/*` shadcn primitives (Button, Input, Switch, etc.) —
  restyled via tokens rather than rewritten.

## Constraints

The redesign does not introduce new functionality. It only re-presents data
already in Convex. Specifically out of scope:

- Authentication / multi-user concerns.
- Cross-PR fleet/health views.
- Notifications, alerts, or external pings.
- New operator actions (pause PR, force retry, override decision, etc.).
- Worker/poller health surfacing.
- Per-repo grouping or tagging beyond what's in the schema today.

The redesign does require a small set of backend additions to surface data
the orchestrator already has access to but does not currently persist. These
are documented in "Data Dependencies" below.

## Data Dependencies

Audit of what the design needs vs what is in Convex today, with backend
work itemized so it can be planned alongside the UI work.

### Already available (no backend change needed)

- `pullRequests`: `branchName`, `headSha`, `lifecycleState`, `statusSummary`,
  `currentPhase`, `dirty`, `blockedReason`, `lastReconciledAt`, `workflowId`.
- `prRuns`: `phase`, `status`, `targetHeadSha`, `startedAt`, `completedAt`,
  `summary`, plus rich `detailsJson` containing `overallSummary`,
  `investigationSummary`, `finalAssessment`, `whyNoCommit`, per-check and
  per-thread outcomes, token usage, provider, workspacePath, mergeConflict,
  providerMetadata.
- `reviewerRuns`: `reviewerId`, `targetHeadSha`, `matchedFiles`, `status`,
  `summary`, `detailsJson` (findings, handoffs, reviewerPack).
- `workflowErrors`: `errorType`, `errorMessage`, `phase`, `retryable`,
  `blocked`, `lastSeenAt`.
- `artifacts`: `artifactKind`, `externalId`, `correlationKey`, `summary`,
  `createdAt`.
- `reviewThreads` and `threadDecisions`: full disposition/decision graph.
- `ui.listPullRequests` already returns `latestRunStatus`, `latestRunPhase`,
  and a derived `hasBlockingError`.

### Backend gaps (need persistence changes before the UI can render the
intended design)

These are tracked as backend tickets in the Linear breakdown so they can be
done in parallel with the UI work that depends on them.

#### Gap 1 — PR title not persisted (blocks home row + detail header)

The orchestrator fetches the PR title from GitHub
(`PullRequestSnapshot.title` in `apps/orchestrator/src/domain/github.ts`)
but strips it before calling `pullRequests.upsert` /
`pullRequests.upsertDiscovered`. The `pullRequests` table has no `title`
column.

**Fix:** Add `title: v.string()` to the `pullRequests` schema, thread it
through `PullRequestRef` (or pass alongside in the upsert mutation
arguments), include it in the `syncPullRequestStatus` and `upsertDiscovered`
flows, and surface it in `ui.listPullRequests` and `ui.getPullRequestDetail`.

#### Gap 2 — Stack traces not persisted on errors (blocks "errors are stories" treatment)

`recordWorkflowError` only persists `error.message`. `error.stack` is
discarded. The same is true for the `failed` `prRuns.detailsJson` path,
which captures `errorMessage` from the same `error.message` source. The
`workflowErrors` and `failed` run UIs are designed to render the full text
of an error, including stack traces.

**Fix:** Add `errorStack: v.union(v.string(), v.null())` to `workflowErrors`,
capture `error.stack` in `recordWorkflowError` callers, and include it in
the `failed` `prRuns.detailsJson` path. Render verbatim in the UI inside a
scrollable, monospace block with no smart parsing.

#### Gap 3 — Commit message and change-stats not persisted (degrades commit chip)

`artifacts.summary` for `commit` artifacts is set to the agent's
`overallSummary`, **not** the git commit subject/body. The commit chip is
designed to show the actual commit message.

**Fix (v1):** Ship the commit chip using the agent's `overallSummary` as
the subtitle, label it appropriately ("Run summary" rather than "Commit
message"), and file a follow-up backend ticket to capture the real commit
message + change-stats during the agent run and persist them on the
artifact (e.g., `commitMessage: string | null`, `commitStats: { additions,
deletions, files } | null`). The chip swaps to the real values once
available without any UI structural change.

#### Gap 4 — Activity stream pagination has no server query (blocks Load More)

`ui.getPullRequestDetail` returns fixed-cap arrays (50 runs, 50 reviewer
runs, 100 artifacts, 50 errors, 100 events). The Load More design needs a
paginated query.

**Fix:** Introduce `ui.listActivityStreamEvents` (paginated, takes a filter
arg matching the activity stream filter chips, returns a merged ordered
stream of runs + reviewer runs + errors + manual events) using Convex
pagination. The non-paginated initial PR detail query can stay; the stream
takes over below the fold.

#### Gap 5 — `listPullRequests` is unfiltered by lifecycle (cosmetic)

Today `ui.listPullRequests` returns up to 200 PRs of mixed lifecycle
states. The home page filter chips can do client-side filtering against
the same payload at current scale; a `lifecycleState` query argument is a
nice-to-have but not required for v1.

**Fix:** Optional. Add `lifecycleState?: ...` arg to `ui.listPullRequests`
when paginating becomes worthwhile.

#### Gap 6 — Latest run summary missing from `listPullRequests`

The home row signal stack wants the latest run's `summary` (and the latest
manual event status) surfaced inline. `ui.listPullRequests` currently
returns `latestRunStatus` and `latestRunPhase` but not `latestRunSummary`.

**Fix:** Add `latestRunSummary: string | null` (and optionally
`latestRunCompletedAt`) to the `ui.listPullRequests` return shape. Trivial
extension of the existing query.

### Pagination policy

- PR detail initial render: keep the existing batched query for the first
  page of each source (threads, latest 50 runs, etc.).
- Activity stream: server-side merge via `ui.listActivityStreamEvents`,
  page size 25, cursor-based, "Load more" button at the bottom of the
  stream. Filter chips apply server-side via the query arg.

### Error rendering policy

Errors render their full text faithfully. No truncation, no smart parsing,
no "expand to see more" for stack traces. The error card in the activity
stream gives the error its own tall, scrollable monospace block sized to
fit common stack traces (~24 lines visible by default with overflow scroll
for longer ones). This applies to both `workflowErrors` and `failed`
`prRuns`.

## Recommended Next Step

The next document is an implementation plan that:

1. Establishes the new color and type tokens in `globals.css` and the
   shadcn theme files.
2. Introduces `<StatusMark />`, `<StatusRail />`, and the canonical
   vocabulary, and migrates `status-badge.tsx` consumers to it.
3. Builds `<PrRow />` and the home page filter bar; ships the home page
   redesign as the first visible slice.
4. Builds `<ActivityStream />`, `<SignalStack />`, and the Operator PR
   detail page.
5. Adds the Inspector route and its component tree.
6. Restyles the policies screens onto the new tokens.
7. Removes dead code (`status-badge.tsx` after migration, the old Workflow
   state strip, the Artifacts and PR Events sections).
