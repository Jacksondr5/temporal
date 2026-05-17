# Operator and Inspector Modes

## Status

Evergreen design document. Defines the two reading modes the UI commits to, where the line between them falls, and how the chrome makes the mode unambiguous from across the room. Referenced by `DESIGN.md`, `PRODUCT.md`, and the route definitions. When a new internal field needs a place to live, this document decides which side of the line it belongs on.

## Why this exists separately

The two-mode system is a structural commitment, not a styling detail. It crosses routes (URLs are the source of truth), components (each surface has a separate component tree per mode), and information policy (which fields are even visible). It doesn't fit any of Stitch's six sections, but it is the most load-bearing decision in the system and changing it ripples across everything.

## The two modes

### Operator (default)

The mode the user lands in. Optimized for the **glance question**: "is this PR healthy, where is the agent, and where do I need to step in?" The operator has minutes-to-seconds attention and is scanning across many PRs.

What's visible:
- Operator-friendly verbs ("Reviewing CodeRabbit feedback", not `handling_code_rabbit`)
- Status signals stacked on top of each other, each line one real signal from Convex
- Agent reasoning rendered as prose at body typography quality
- Commit chips wherever the agent pushed code
- Reviewer summary widget with one row per reviewer and a clear pass/fail mark
- A right-rail "About this PR" panel with branch, author, opened-when, last-sync, threads, GitHub link, policy

What's hidden:
- Internal phase enums (`fixing_checks`, `running_special_reviewers`)
- Internal lifecycle enums
- SHAs (target HEAD or observed)
- Workflow IDs, run IDs, activity IDs
- Provider names and provider metadata
- Token usage
- Workspace paths
- Command summaries
- Raw JSON (any kind)
- Noop reconciliations
- System events (`github.synchronize` deliveries, signal dispatches)
- The Outputs panel (artifacts are reachable through the events that produced them)

### Inspector (opt-in via "Inspect →")

The mode the operator opts into to answer the **debugging question**: "what did the agent actually do, and why?" The user has minutes-to-many-minutes attention and is reading depth on a single PR.

What's added on top of Operator:
- A 4-column **Technical Signals** panel at the top of the PR detail with every internal field: `currentPhase`, `lifecycleState`, `targetHeadSha`, `observedCommitSha`, `dirty`, `blockedReason`, `statusSummary`, `hasBlockingError`, `workflowId`, `runId`, `manualClaimedAt`, `manualEvent`, `latestRunPhase`, `latestRunStatus`, `lastReconciledAt`, `policyId`
- A per-event **technical drawer** alongside every event in the activity stream: `runId`, `phase`, target/observed SHA pair (with arrow `→` and divergent-state coloring), `provider`, `workspacePath`, token usage, `command`, plus action buttons (`view detailsJson ↗`, `tail agent stdout`)
- **Noop reconciliations** rendered inline in the stream (Operator hides them entirely)
- **System events** (github webhook deliveries, manual signal dispatches) rendered inline
- An **Outputs panel** below the stream, grouped horizontally by artifact kind (Commits / Comments / Issues), each kind a column
- Tech actions in the rack: `view raw JSON ↗`, `copy workflow id`, `open in temporal ↗`

What's the same as Operator:
- The page header structure (eyebrow, title, signal stack, action row)
- The activity-stream chronological order
- Agent reasoning prose treatment
- Commit chips
- The error-story full-fidelity stack-trace block (PRODUCT principle 10 applies in both modes)

What's different chrome-wise:
- The **diagonal-stripe band** sticky-positioned along the very top of the viewport (caution-yellow stripes against charcoal). Visible at all scroll positions.
- The brand LED in the rack switches from phosphor to caution-yellow (a "you are not in production view" signal).
- A `⚲ Inspect Mode` chip in the rack, in caution-yellow.
- A `← Operator` back link in the rack.
- The PR detail title flips from IBM Plex Sans Condensed to **JetBrains Mono** at 22px / 1.25.
- The page canvas tilts a hair cooler: `oklch(0.15 0.01 240)` instead of Operator's `oklch(0.16 0.012 50)`. The tonal shift is small enough that the eye registers "different mode" before reading any chrome.

## Routes

URLs are the source of truth for which mode the user is in. Two separate routes, two separate component trees — not a query-string toggle. This lets each mode evolve its own components without compromising the other.

| Route | Page | Mode |
|---|---|---|
| `/` | PR list (Operator) | Operator |
| `/pr/[repoSlug]/[prNumber]` | PR detail (Operator) | Operator |
| `/pr/[repoSlug]/[prNumber]/inspect` | PR detail (Inspector) | Inspector |
| `/policies` | Policies list | Operator-style |
| `/policies/[repoSlug]` | Policy editor | Operator-style |

The PR list does not need an Inspector variant. There is little Inspector content meaningful at the list level; the list links into either mode of PR detail depending on how the user navigates.

The Operator detail page links into Inspector via an "Inspect →" affordance in the action row of the detail header. The Inspector detail page links back via the `← Operator` link in the rack. Both directions preserve the PR identity (`repoSlug`, `prNumber`) and the user's scroll position.

## Where the line falls

The line between Operator and Inspector is not "advanced details" or "more info." It is **whose language is being spoken**.

- Operator speaks the **operator's** language. Phrases like "Re-run pending," "Held," "Reviewing CodeRabbit feedback." Numbers framed as state ("3 of 4 threads logged" not "+3/4"). No internal IDs.
- Inspector speaks the **system's** language. Phrases like `phase=handle_code_rabbit`, `runId=prRun-92413-04812`. Verbatim internal values. SHA pairs. JSON payloads.

If a piece of data has an operator translation, it goes in Operator (translated) and Inspector (verbatim). If it has no operator translation — a workflow ID is just a workflow ID — it lives in Inspector only.

When in doubt: the question is "would a new engineer understand this without prior system context?" If yes, it can live in Operator. If no, it lives in Inspector.

### Decision rules for new fields

When the orchestrator gains a new persisted field, decide where it lives by asking these questions in order:

1. **Does this field describe agent decisions or outcomes?** (e.g., `whyNoCommit`, `finalAssessment`, per-thread reasoning) → **Operator**, foregrounded as prose. PRODUCT principle 2.
2. **Does this field surface a real state signal the operator might need?** (e.g., new `dirty` reason, new lifecycle phase) → **Operator**, with operator-language translation, as a line in the signal stack.
3. **Does this field describe how the system reached its decision?** (e.g., command summaries, token usage, provider metadata) → **Inspector** only.
4. **Does this field name an internal entity?** (workflow IDs, run IDs, activity IDs, SHAs as IDs) → **Inspector** only.
5. **Does this field describe an event the system produces but the operator doesn't act on?** (e.g., noop reconciliations, raw GitHub webhook deliveries) → **Inspector** only.

If a field straddles the line — a SHA is both an ID and a meaningful operator signal when divergent — surface a **derived** signal in Operator ("Head moved during sweep") and the verbatim SHA in Inspector.

## How the chrome enforces the mode

The chrome differences exist so a screenshot of the UI tells you which mode it's from without reading any text. Three signals together:

1. **The diagonal-stripe band** at the top of the viewport. Visible from across the room. Caution-yellow stripes are the universal "this is not the production view" signal.
2. **The brand LED color**. Operator's brand LED is phosphor amber (live, in-production). Inspector's brand LED is caution-yellow (you are looking behind the scenes).
3. **The detail title typography**. Operator titles are condensed sans (IBM Plex Sans Condensed). Inspector titles are mono (JetBrains Mono). The font itself is the mode signal.

Any one of those signals alone might be missed. Together they make the mode unambiguous.

## What is *not* a mode

A few patterns that look mode-like but aren't:

- **The activity-stream filter chips** (All / Agent runs / Reviewers / Errors / GitHub) are not modes. They filter the same set of events; they don't reveal new fields. The same chips work in both Operator and Inspector mode (Operator has a smaller default set; Inspector adds noop and system).
- **The "Re-evaluate now" button** is not a mode. It's an action available in both views.
- **A future "raw JSON" inline viewer** is not a mode. It's an Inspector-side detail surface that opens within the Inspector route.

If a feature feels mode-like but doesn't change *which language is being spoken*, it isn't a mode. It's a detail.

## Implementation notes

- Each route has its own component tree under `apps/web/app/pr/.../page.tsx` and `apps/web/app/pr/.../inspect/page.tsx`. Shared primitives (StatusMark, CommitChip, AgentReasoning) are imported by both. Mode-specific chrome (TechnicalSignalsPanel, OutputsPanel, ModeBand) is imported only by the Inspector tree.
- The Inspector route fetches the same Convex queries as Operator plus a few additional ones (`ui.listActivityStreamEvents` with `mode: "inspector"` to include noops and system events; the raw `pullRequests` row for verbatim internal fields).
- The mode is never inferred from a query parameter or stored in client state. It is the route. Bookmarkable, shareable, refreshable.

## Out of scope here

- The visual spec of each component (in `DESIGN.md` Components section, with HTML/CSS in `.impeccable/design.json` sidecar).
- The status mapping itself (in [status-vocabulary.md](status-vocabulary.md)).
- The strategic principles motivating two modes (in `PRODUCT.md` principles 1, 2, 3, and 7).
