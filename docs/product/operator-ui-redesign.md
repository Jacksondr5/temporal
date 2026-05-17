# Operator UI Redesign

## Status

**Superseded.** This document was the first pass at the operator UI redesign and committed to a specific visual direction (warm dark canvas, Monaspace + Geist typography, eight-color status vocabulary). That direction has been replaced by a fresh ground-up design committed in the documents below.

The visual design now lives in:

- [`PRODUCT.md`](../../PRODUCT.md) — register, users, brand personality, anti-references, strategic principles, accessibility target.
- [`DESIGN.md`](../../DESIGN.md) — Stitch-format design system (colors, typography, elevation, components, do's and don'ts). Frontmatter carries machine-readable tokens; markdown body is the prose specification.
- [`.impeccable/design.json`](../../.impeccable/design.json) — sidecar with tonal ramps, motion tokens, shadow tokens, and full HTML/CSS component snippets for the design panel.
- [`docs/design/status-vocabulary.md`](../design/status-vocabulary.md) — canonical mapping of every status concept to color, shape, motion, and operator-language label. Includes the Operator-vs-Inspector translation tables for `currentPhase`, `prRuns.status`, `threadDecisions.disposition`, `lifecycleState`, and timeline event types.
- [`docs/design/operator-and-inspector-modes.md`](../design/operator-and-inspector-modes.md) — the two-mode system, where the line between Operator and Inspector falls, the routes, and the chrome that makes the mode unambiguous from across the room.
- [`.impeccable/mocks/`](../../.impeccable/mocks/) — rendered HTML mocks of the Machine Room design across operator and inspector views.

The Creative North Star is **"The Machine Room"** — a 1970s-flavored computer operations room reimagined for an autonomous-agent age. Warm charcoal canvas, phosphor-amber dominant for live, hard edges, three-family typography (IBM Plex Sans Condensed for chrome, Inter for prose, JetBrains Mono for technical data). Refer to `DESIGN.md` for the full spec.

## What survived from this doc

One section of this document outlived the visual direction and is still load-bearing for implementation: the **Data Dependencies** audit of backend changes the redesign needs. Those are captured below, unchanged. Treat them as the implementation checklist for landing the UI; every gap here is independent of which visual direction we ship.

## Data Dependencies

Audit of what the design needs vs. what is in Convex today, with backend work itemized so it can be planned alongside the UI work.

### Already available (no backend change needed)

- `pullRequests`: `branchName`, `headSha`, `lifecycleState`, `statusSummary`, `currentPhase`, `dirty`, `blockedReason`, `lastReconciledAt`, `workflowId`.
- `prRuns`: `phase`, `status`, `targetHeadSha`, `startedAt`, `completedAt`, `summary`, plus rich `detailsJson` containing `overallSummary`, `investigationSummary`, `finalAssessment`, `whyNoCommit`, per-check and per-thread outcomes, token usage, provider, workspacePath, mergeConflict, providerMetadata.
- `reviewerRuns`: `reviewerId`, `targetHeadSha`, `matchedFiles`, `status`, `summary`, `detailsJson` (findings, handoffs, reviewerPack).
- `workflowErrors`: `errorType`, `errorMessage`, `phase`, `retryable`, `blocked`, `lastSeenAt`.
- `artifacts`: `artifactKind`, `externalId`, `correlationKey`, `summary`, `createdAt`.
- `reviewThreads` and `threadDecisions`: full disposition/decision graph.
- `ui.listPullRequests` already returns `latestRunStatus`, `latestRunPhase`, and a derived `hasBlockingError`.

### Backend gaps that block the intended design

These are tracked as backend tickets so they can be done in parallel with the UI work that depends on them.

#### Gap 1 — PR title not persisted (blocks home row + detail header)

The orchestrator fetches the PR title from GitHub (`PullRequestSnapshot.title` in `apps/orchestrator/src/domain/github.ts`) but strips it before calling `pullRequests.upsert` / `pullRequests.upsertDiscovered`. The `pullRequests` table has no `title` column.

**Fix:** Add `title: v.string()` to the `pullRequests` schema, thread it through `PullRequestRef` (or pass alongside in the upsert mutation arguments), include it in the `syncPullRequestStatus` and `upsertDiscovered` flows, and surface it in `ui.listPullRequests` and `ui.getPullRequestDetail`.

#### Gap 2 — Stack traces not persisted on errors (blocks "errors are stories" treatment)

`recordWorkflowError` only persists `error.message`. `error.stack` is discarded. The same is true for the `failed` `prRuns.detailsJson` path, which captures `errorMessage` from the same `error.message` source. The error story UI is designed to render the full text of an error including stack traces.

**Fix:** Add `errorStack: v.union(v.string(), v.null())` to `workflowErrors`, capture `error.stack` in `recordWorkflowError` callers, and include it in the `failed` `prRuns.detailsJson` path. Render verbatim in the UI inside a `<StackTraceBlock />` component (see `DESIGN.md` Components section).

#### Gap 3 — Commit message and change-stats not persisted (degrades commit chip)

`artifacts.summary` for `commit` artifacts is set to the agent's `overallSummary`, **not** the git commit subject/body. The `CommitChip` component is designed to show the actual commit message and change-stats.

**Fix (v1):** Ship the commit chip using the agent's `overallSummary` as the subtitle, label it appropriately ("Run summary" rather than "Commit message"), and file a follow-up backend ticket to capture the real commit message + change-stats during the agent run and persist them on the artifact (e.g., `commitMessage: string | null`, `commitStats: { additions, deletions, files } | null`). The chip swaps to the real values once available without any UI structural change.

#### Gap 4 — Activity stream pagination has no server query (blocks Load More)

`ui.getPullRequestDetail` returns fixed-cap arrays (50 runs, 50 reviewer runs, 100 artifacts, 50 errors, 100 events). The activity-stream Load More design needs a paginated query.

**Fix:** Introduce `ui.listActivityStreamEvents` (paginated, takes a filter arg matching the activity-stream filter chips, returns a merged ordered stream of runs + reviewer runs + errors + manual events) using Convex pagination. The non-paginated initial PR detail query can stay; the stream takes over below the fold. The Inspector variant accepts a `mode: "inspector"` argument that also includes noop reconciliations and system events.

#### Gap 5 — `listPullRequests` is unfiltered by lifecycle (cosmetic)

Today `ui.listPullRequests` returns up to 200 PRs of mixed lifecycle states. The home-page filter chips can do client-side filtering against the same payload at current scale; a `lifecycleState` query argument is a nice-to-have but not required for v1.

**Fix:** Optional. Add `lifecycleState?: ...` arg to `ui.listPullRequests` when paginating becomes worthwhile.

#### Gap 6 — Latest run summary missing from `listPullRequests`

The home-row signal stack wants the latest run's `summary` (and the latest manual event status) surfaced inline. `ui.listPullRequests` currently returns `latestRunStatus` and `latestRunPhase` but not `latestRunSummary`.

**Fix:** Add `latestRunSummary: string | null` (and optionally `latestRunCompletedAt`) to the `ui.listPullRequests` return shape. Trivial extension of the existing query.

### Pagination policy

- PR detail initial render: keep the existing batched query for the first page of each source (threads, latest 50 runs, etc.).
- Activity stream: server-side merge via `ui.listActivityStreamEvents`, page size 25, cursor-based, "Load more" button at the bottom of the stream. Filter chips apply server-side via the query arg.

### Error rendering policy

Errors render their full text faithfully. No truncation, no smart parsing, no "expand to see more" for stack traces. The `<StackTraceBlock />` component in the activity stream gives the error its own tall, scrollable monospace block sized to fit common stack traces (~24 lines visible by default with overflow scroll for longer ones). Lines wrap via `white-space: pre-wrap` and `overflow-wrap: anywhere` — stack traces never produce horizontal scrollbars. This applies to both `workflowErrors` and `failed` `prRuns`.

## Constraints (unchanged)

The redesign does not introduce new functionality. It only re-presents data already in Convex. Specifically out of scope:

- Authentication / multi-user concerns.
- Cross-PR fleet/health views.
- Notifications, alerts, or external pings.
- New operator actions (pause PR, force retry, override decision, etc.).
- Worker/poller health surfacing.
- Per-repo grouping or tagging beyond what's in the schema today.

The redesign does require the backend additions documented above to surface data the orchestrator already has access to but does not currently persist.
