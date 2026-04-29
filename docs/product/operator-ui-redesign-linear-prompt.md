# Linear Project + Issues — Operator UI Redesign

This document is a self-contained prompt for an agent that has Linear API
access. Hand it the prompt below verbatim. The agent should create one
project and the listed issues, in the order given, with the dependencies
declared.

---

## Prompt

You are creating a Linear project and a set of issues to track the
implementation of the Operator UI Redesign for the PR Review Orchestrator.

The full design and rationale lives at
`docs/product/operator-ui-redesign.md` in the repo. Read it before creating
issues so you can write accurate descriptions and acceptance criteria. When
you write issue descriptions, link back to the relevant section of that doc
rather than restating it in full — the doc is the source of truth and will
be updated over time.

The codebase is a pnpm monorepo:

- `apps/web/` — Next.js 16 operator UI (Tailwind v4, shadcn/ui, Convex
  client). All pages are real-time via Convex subscriptions.
- `apps/orchestrator/` — Temporal worker, GitHub poller, agent runtime,
  activities, workflows.
- `convex/` — shared Convex backend (schema + queries + mutations).
- `packages/domain/` — placeholder for shared types.

### Project to create

**Name:** Operator UI Redesign

**Description:**

> Redesign the operator dashboard from a debug-style UI into a layered
> operational tool with Operator and Inspector reading modes on separate
> routes, a unified activity stream that promotes commits and agent
> reasoning, and a refreshed design system with new tokens, typography,
> motion language, and status vocabulary. See
> `docs/product/operator-ui-redesign.md` for principles, system, and
> per-screen direction.

**Lead / assignee:** Jackson (defer to user if unsure).

**Status:** Active / In progress.

If your Linear team supports milestones or sub-projects, organize the
issues under these milestones (else use labels):

1. **M1 — Foundation** (tokens, primitives, backend gaps)
2. **M2 — Home page**
3. **M3 — PR detail (Operator)**
4. **M4 — PR detail (Inspector)**
5. **M5 — Polish & cleanup**

### Conventions for every issue

- **Labels:** add `operator-ui-redesign`. Add a per-area label
  (`area:web`, `area:convex`, `area:orchestrator`) where applicable.
- **Description format:**
  - One-paragraph summary.
  - "Context" section linking to the relevant heading in
    `docs/product/operator-ui-redesign.md`.
  - "Acceptance criteria" as a checklist.
  - "Out of scope" section so reviewers know what NOT to change.
  - "Dependencies" if any (use Linear's blocked-by relations).
- **Estimate:** use your team's scale. Sizes given below are rough
  T-shirt sizes — convert to whatever your team uses (XS/S/M/L/XL).
- **Order:** create in the order listed. Set blocked-by relations so the
  dependency graph is correct.
- **Do not create implementation PRs.** This task is project + issues only.

---

## Milestone 1 — Foundation

These ship before any visible UI work. They unblock everything that
follows.

### Issue 1.1 — Backend: persist PR title on `pullRequests`

**Size:** S (~2hr)
**Area:** convex, orchestrator
**Blocks:** 2.1 (Home PR row), 3.1 (Operator detail header)

Surface gap documented in `docs/product/operator-ui-redesign.md` →
"Data Dependencies" → "Gap 1".

Today the orchestrator fetches `PullRequestSnapshot.title` from GitHub
(`apps/orchestrator/src/domain/github.ts:80`) and discards it before
calling `pullRequests.upsert` / `pullRequests.upsertDiscovered`. The
`pullRequests` table has no `title` column.

**Acceptance criteria:**

- [ ] `convex/schema.ts` `pullRequests` gains `title: v.string()` (default
      `""` for backfill compatibility, or `v.union(v.string(), v.null())`
      if the team prefers explicit nulls — match existing patterns in the
      table).
- [ ] `convex/pullRequests.ts` `upsert` and `upsertDiscovered` mutations
      accept and persist `title`. Backfill behavior for rows missing the
      field documented in the PR description.
- [ ] `apps/orchestrator/src/domain/github.ts` `PullRequestRef` includes
      `title` (or the upsert call signature carries `title` alongside the
      ref — pick the cleaner option).
- [ ] All call sites in `apps/orchestrator/src/integrations/convex.ts`,
      poller, and workflow that build `PullRequestRef` populate `title`
      from `PullRequestSnapshot.title` or the GitHub PR object.
- [ ] `convex/ui.ts` `listPullRequests` and `getPullRequestDetail` include
      `title` in the return shape.
- [ ] Manual smoke: an existing tracked PR shows its title after the next
      reconciliation cycle.

**Out of scope:** UI rendering of the title (that's Issue 2.1 and 3.1).

---

### Issue 1.2 — Backend: persist `errorStack` on `workflowErrors` and `failed` runs

**Size:** S (~2hr)
**Area:** convex, orchestrator
**Blocks:** 3.4 (Activity stream — Error event card)

Surface gap documented in `docs/product/operator-ui-redesign.md` →
"Data Dependencies" → "Gap 2".

Today `recordWorkflowError` only persists `error.message`. `error.stack`
is discarded. The `failed` `prRuns.detailsJson` path captures
`errorMessage` from the same source.

**Acceptance criteria:**

- [ ] `convex/schema.ts` `workflowErrors` gains
      `errorStack: v.union(v.string(), v.null())`.
- [ ] `apps/orchestrator/src/activities/recordWorkflowError.ts` accepts
      and forwards `errorStack`. All call sites in
      `apps/orchestrator/src/workflows/prReviewOrchestrator.ts` capture
      `error instanceof Error ? error.stack ?? null : null` and pass it
      through.
- [ ] The `failed` `prRuns.detailsJson` payload (built where the workflow
      records a failed run) includes `errorStack` in the same shape
      pattern; `apps/web/lib/run-details.ts` `FailedRunDetails` gains
      `errorStack: string | null` and parses it.
- [ ] `convex/workflowErrors.ts` insert mutation accepts the new field.
- [ ] Manual smoke: trigger a known failure path; confirm the stack trace
      lands in Convex on both `workflowErrors` and the corresponding
      `prRuns` row when present.

**Out of scope:** UI rendering of the stack (that's Issue 3.4).

---

### Issue 1.3 — Convex query: `ui.listActivityStreamEvents` (paginated, server-merged)

**Size:** M (~½ day)
**Area:** convex
**Blocks:** 3.3 (Activity stream)

Surface gap documented in `docs/product/operator-ui-redesign.md` →
"Data Dependencies" → "Gap 4" and "Pagination policy".

The activity stream merges four sources (`prRuns`, `reviewerRuns`,
`workflowErrors`, manual `githubEvents`) ordered by time, with filter
chips. Server-side merge keeps client logic simple and pagination correct.

**Acceptance criteria:**

- [ ] New query `ui.listActivityStreamEvents` in `convex/ui.ts` with args:
      - `repoSlug: v.string()`
      - `prNumber: v.number()`
      - `filter: v.union(v.literal("all"), v.literal("agent_runs"), v.literal("reviewers"), v.literal("errors"), v.literal("github"))`
      - `mode: v.union(v.literal("operator"), v.literal("inspector"))` —
        Operator hides noops + non-manual GitHub events; Inspector shows
        them all.
      - `paginationOpts: paginationOptsValidator`
- [ ] Returns `{ page, isDone, continueCursor }` per Convex pagination
      conventions.
- [ ] Each item carries an `eventType` discriminator
      (`"agent_run" | "reviewer_run" | "workflow_error" | "github_event"`)
      and the source row payload.
- [ ] Page size 25.
- [ ] Sorted by event time desc.
- [ ] Document any Convex single-paginated-query constraint workarounds in
      a comment if hit (see existing `boundedCount` pattern in
      `listReposWithPolicies`).
- [ ] Manual smoke: query returns expected merged stream for a busy PR
      under each filter and mode.

**Out of scope:** UI consumption (Issue 3.3).

---

### Issue 1.4 — Extend `ui.listPullRequests` with home-row signals

**Size:** XS (~1hr)
**Area:** convex
**Blocks:** 2.1 (Home PR row)

Per `docs/product/operator-ui-redesign.md` → "Data Dependencies" →
"Gap 6": the home row's signal stack wants the latest run's summary
inline.

**Acceptance criteria:**

- [ ] `ui.listPullRequests` adds `latestRunSummary: string | null` and
      `latestRunCompletedAt: string | null` to the per-PR return shape.
- [ ] Pulled from the same `latestRun[0]` already fetched.
- [ ] `apps/web/app/page.tsx` continues to compile; new fields are
      optional from the consumer's perspective.

**Out of scope:** Using the new fields in rendering (Issue 2.1).

---

### Issue 1.5 — Design tokens & global styles refactor

**Size:** M (~½ day)
**Area:** web
**Blocks:** all 2.x and 3.x rendering work

Per `docs/product/operator-ui-redesign.md` → "Design System" → "Color
palette", "Typography", "Type scale".

**Acceptance criteria:**

- [ ] `apps/web/app/globals.css` updated with new surface, border, and
      status tokens per the OKLCH values in the design doc.
- [ ] Status vocabulary tokens added as CSS custom properties (one
      `--status-live`, `--status-healthy`, `--status-idle`,
      `--status-caution`, `--status-blocked`, `--status-deferred`,
      `--status-reviewer`, `--status-skipped`).
- [ ] Type scale tokens added (`text-display`, `text-title`, `text-body`,
      `text-meta`, `text-mono-sm`, `text-micro`).
- [ ] Geist Sans retained. Geist Mono replaced by Monaspace Argon
      (narrative mono) and Monaspace Neon (technical mono) loaded via
      `next/font/local` from self-hosted woff2 files in
      `apps/web/public/fonts/`. CSS variables `--font-mono-narrative` and
      `--font-mono-technical` exposed.
- [ ] `text-mono` Tailwind utility maps to `--font-mono-technical` (the
      common case); `text-mono-narrative` utility added.
- [ ] Dot-grid background removed from `body` / `dot-grid` class.
- [ ] `animate-status-pulse` keeps existing definition for now (migration
      to row-level motion is in Issue 1.6).
- [ ] Existing pages still render without crashing after the token swap
      (visual regression is fine and expected — replaced incrementally in
      later milestones).

**Out of scope:** Rebuilding components against the new tokens (separate
issues).

---

### Issue 1.6 — `<StatusMark />` + `<StatusRail />` primitives

**Size:** S (~3hr)
**Area:** web
**Blocks:** all 2.x and 3.x rendering work
**Depends on:** 1.5

Per `docs/product/operator-ui-redesign.md` → "Design System" → "Status
vocabulary" + "Motion language".

**Acceptance criteria:**

- [ ] New `apps/web/components/status-mark.tsx` exports `<StatusMark />`
      with props `{ status: StatusKind, size?: 'sm' | 'md' }` rendering
      the canonical color + shape mapping. `StatusKind` exported from a
      single canonical type union (`'live' | 'healthy' | 'idle' |
      'caution' | 'blocked' | 'deferred' | 'reviewer' | 'skipped'`).
- [ ] New `apps/web/components/status-rail.tsx` exports `<StatusRail />`
      that renders a 4px left rail with the canonical motion behavior
      (sweeping for `live`, breathing for `caution`/stale, solid for
      `blocked`/`healthy`/`idle`, etc. — exact rules per the doc's
      "Motion language" table).
- [ ] Status-to-canonical mapping helper exposed (e.g., `mapPhaseToStatus`,
      `mapRunStatusToStatus`, `mapDispositionToStatus`,
      `mapErrorToStatus`) in `apps/web/lib/status.ts`. These are the
      single place internal labels translate to canonical kinds.
- [ ] Storybook-style demo route NOT required; instead include a
      `__playground` page at `apps/web/app/_playground/status/page.tsx`
      that visually renders all marks, rails, and motions for design
      sign-off. Mark with `noindex`.

**Out of scope:** Migrating consumers off `status-badge.tsx` (Issue 5.1).

---

### Issue 1.7 — `<CommitChip />` primitive

**Size:** S (~3hr)
**Area:** web
**Blocks:** 3.3 (Activity stream)
**Depends on:** 1.5

Implements Principle 11 ("Commits are first-class") per
`docs/product/operator-ui-redesign.md` → "Component Patterns" → "Commit
chip".

**Acceptance criteria:**

- [ ] New `apps/web/components/commit-chip.tsx` exports `<CommitChip />`
      with props `{ repoSlug, sha, message, expanded?, mode?: 'operator' | 'inspector', targetSha?: string | null, stats?: { additions, deletions, files } | null }`.
- [ ] Visual treatment per the doc: distinct surface, lime accent border,
      `⎇` GitCommit icon, short SHA in technical mono with copy-on-click
      and full-SHA hover, message subject in narrative mono (truncated
      single line collapsed; two lines expanded), `↗` link to GitHub
      commit URL.
- [ ] Inspector mode renders the SHA pair (target → observed) when
      `targetSha` differs from `sha`.
- [ ] If `stats` is null (current backend reality), do not render the
      stats line.
- [ ] If `message` is null/empty, fall back to "(no message available)"
      in muted style — but this should be rare since we'll initially pass
      the agent's `overallSummary` as the message per the v1 plan in
      Issue 1.8.
- [ ] Demonstrated on the playground route from Issue 1.6.

**Out of scope:** Real commit message persistence (Issue 1.8).

---

### Issue 1.8 — (Follow-up) Persist real commit message + stats on artifacts

**Size:** M (~½ day)
**Area:** convex, orchestrator
**Priority:** Medium (degrades commit chip but does not block it)
**Depends on:** none — can ship after the chip is rendering

Surface gap documented in `docs/product/operator-ui-redesign.md` →
"Data Dependencies" → "Gap 3".

V1 ships `<CommitChip />` using the agent's `overallSummary` as the
subtitle. This issue replaces it with the real commit message + stats.

**Acceptance criteria:**

- [ ] Schema additions on `artifacts`: `commitMessage: v.union(v.string(), v.null())` and
      `commitStats: v.union(v.object({ additions: v.number(), deletions: v.number(), files: v.number() }), v.null())`.
      Both default to null for non-commit artifact kinds.
- [ ] Agent runtime captures the commit message via
      `git log -1 --pretty=%B` (or equivalent) and the change-stat via
      `git log -1 --shortstat` (or equivalent) immediately after a
      successful push, before the workspace is reset/cleaned.
- [ ] All three persist activities (`persistFixChecksExecution`,
      `persistCodeRabbitExecution`, `persistSpecializedReviewerExecution`)
      forward the captured values to `upsertArtifact`.
- [ ] `<CommitChip />` consumer (Activity stream event card) prefers
      `artifact.commitMessage` over the agent's `overallSummary` when
      present, and renders `commitStats` when present.

---

## Milestone 2 — Home page

### Issue 2.1 — `<PrRow />` and home page filter bar

**Size:** M (~½ day)
**Area:** web
**Depends on:** 1.1, 1.4, 1.5, 1.6

Per `docs/product/operator-ui-redesign.md` → "Component Patterns" →
"PR row (home page)" and "Per-Screen Direction" → "Home page".

**Acceptance criteria:**

- [ ] New `apps/web/components/pr-row.tsx`, `apps/web/components/home-filter-bar.tsx`.
- [ ] `apps/web/app/page.tsx` renders the new row + filter bar. Default
      filter `Open`. Chips: `Open` / `Needs attention` / `Recently merged` /
      `All`. Counter in the page header reflects active filter
      ("12 open · 2 need attention").
- [ ] "Needs attention" = `lifecycleState === 'open' && (hasBlockingError ||
      (dirty && (Date.now() - lastReconciledAt) > 5 * 60 * 1000))`.
- [ ] Sort: live PRs (per `latestRunStatus === 'running'`) at top, then
      `lastReconciledAt` desc within a repo group, then by repo.
- [ ] Row uses `<StatusRail />` left edge with motion per the doc's table.
- [ ] Title line: `repoSlug #prNumber` in sans, then PR title in
      narrative mono.
- [ ] Status block: `<StatusMark />` + operator-language phase + inline
      qualifiers from `dirty`, `blockedReason`, `latestRunSummary`. Use
      the canonical status translation table from `lib/status.ts`.
- [ ] No SHAs visible on the home row.
- [ ] Empty / loading states match the doc.
- [ ] Old `<PhaseBadge />` etc. usage removed from this page.

**Out of scope:** Removing `status-badge.tsx` (Issue 5.1).

---

## Milestone 3 — PR detail (Operator)

### Issue 3.1 — `<PrHeaderOperator />` + `<SignalStack />`

**Size:** M (~½ day)
**Area:** web
**Depends on:** 1.1, 1.5, 1.6

Per `docs/product/operator-ui-redesign.md` → "Component Patterns" →
"PR detail header — Operator" and Principle 8 (surface signals, do not
synthesize the verdict).

**Acceptance criteria:**

- [ ] New `apps/web/components/pr-header-operator.tsx` and
      `apps/web/components/signal-stack.tsx`.
- [ ] `apps/web/app/pr/[repoSlug]/[prNumber]/page.tsx` adopts the new
      header.
- [ ] Header shows: repo + PR# title block (sans), PR title (narrative
      mono), Re-evaluate action (preserved from current page), Inspect
      link routing to `/pr/[repoSlug]/[prNumber]/inspect`.
- [ ] `<SignalStack />` renders one short line per active signal:
      operator-language phase + `<StatusMark />`, dirty/blocked, latest
      run summary, manual re-evaluate state. Lines render only when the
      underlying signal is present. No synthesized prose.
- [ ] The current "Workflow state strip" component is removed.
- [ ] Existing manual-reevaluate behavior (queueing, polling state from
      `latestManualEvent`) preserved.

**Out of scope:** Activity stream (Issue 3.3).

---

### Issue 3.2 — `<ReviewerSummary />` widget

**Size:** S (~3hr)
**Area:** web
**Depends on:** 1.6

Per `docs/product/operator-ui-redesign.md` → "Component Patterns" →
"Reviewer summary widget".

**Acceptance criteria:**

- [ ] New `apps/web/components/reviewer-summary.tsx` rendered above the
      activity stream on PR detail.
- [ ] Pulls from `reviewerRuns` already returned by
      `getPullRequestDetail`. Filters to the most recent run per
      `reviewerId` whose `targetHeadSha === pr.headSha`.
- [ ] Widget hides itself entirely if no reviewer has run on the current
      `headSha`.
- [ ] Each row: `<StatusMark status="reviewer" />` + reviewerId +
      summary glyph (`✓ no findings` / `⚠ N findings`).
- [ ] Clicking a reviewer scrolls the activity stream to that reviewer's
      most recent event (use a shared anchor scheme).

---

### Issue 3.3 — `<ActivityStream />` and event cards (Operator mode)

**Size:** L (~1.5 days)
**Area:** web
**Depends on:** 1.3, 1.5, 1.6, 1.7

Per `docs/product/operator-ui-redesign.md` → "Component Patterns" →
"Activity stream" and "Per-Screen Direction" → "Activity stream
sub-design".

**Acceptance criteria:**

- [ ] New `apps/web/components/activity-stream.tsx` and event-type cards:
      `agent-run-event-card.tsx`, `reviewer-event-card.tsx`,
      `error-event-card.tsx`, `manual-event-card.tsx`,
      `agent-reasoning.tsx`.
- [ ] Consumes `ui.listActivityStreamEvents` (Issue 1.3) with `mode:
      "operator"`. Filter chips drive the `filter` arg.
- [ ] Vertical timeline with left spine + dots in canonical
      `<StatusMark />` shapes.
- [ ] Each event card collapsed state shows: status mark, time verb,
      one-line summary, and (for runs that produced a commit)
      `<CommitChip />` inline.
- [ ] Expand reveals the Story layer: `<AgentReasoning />` with
      `investigationSummary` / `finalAssessment` / `whyNoCommit`,
      per-thread / per-check outcomes when present, findings + handoffs
      for reviewer events.
- [ ] Operator mode hides noops, hides non-manual GitHub events, and
      groups consecutive reconciliations as already done in the existing
      `RunTimeline`.
- [ ] Load More button at bottom of stream uses `continueCursor` from
      Issue 1.3.
- [ ] Sections removed from `app/pr/[repoSlug]/[prNumber]/page.tsx`:
      "Reconciliation Timeline", "Specialized Reviewers", "Artifacts",
      "PR Events". They are absorbed into the stream.
- [ ] Internal phase labels rendered as Operator labels per the
      translation table in the design doc.

---

### Issue 3.4 — Error event card with full stack rendering

**Size:** S (~3hr)
**Area:** web
**Depends on:** 1.2, 3.3

Per `docs/product/operator-ui-redesign.md` → "Data Dependencies" →
"Error rendering policy" and Principle 10 ("Errors are stories, not
labels").

**Acceptance criteria:**

- [ ] `<ErrorEventCard />` renders `errorType`, `errorMessage`, and
      `errorStack` (when present) faithfully — no truncation, no parsing.
- [ ] `errorMessage` rendered as wrapped prose. `errorStack` rendered in
      a tall scrollable monospace block sized to ~24 visible lines by
      default; overflow scrolls. Uses `--font-mono-technical`.
- [ ] No "expand to see more" gate for the stack — it's visible by
      default. Card height grows to accommodate.
- [ ] Same treatment applied to `failed` `prRuns` event cards (the
      `errorMessage` + `errorStack` are surfaced on the agent-run event
      card variant).

---

## Milestone 4 — PR detail (Inspector)

### Issue 4.1 — Inspector route + `<PrHeaderInspector />` + technical signal block

**Size:** M (~½ day)
**Area:** web
**Depends on:** 1.5, 1.6, 3.1

Per `docs/product/operator-ui-redesign.md` → "Routes" and
"Component Patterns" → "PR detail header — Inspector".

**Acceptance criteria:**

- [ ] New route `apps/web/app/pr/[repoSlug]/[prNumber]/inspect/page.tsx`.
- [ ] Background uses `--surface-inspector`. Default mono is
      `--font-mono-technical`.
- [ ] New `apps/web/components/pr-header-inspector.tsx` and
      `apps/web/components/technical-signal-block.tsx`.
- [ ] Technical signal block exposes: `branchName`, current `headSha`
      (full + short copy), `currentPhase` (raw enum), `lifecycleState`
      (raw enum), `dirty`, `manualRequestState` + `manualClaimIsFresh`,
      `workflowId`, `lastReconciledAt`.
- [ ] Re-evaluate action preserved.
- [ ] Back link routes to `/pr/[repoSlug]/[prNumber]`.

---

### Issue 4.2 — Inspector activity stream variants

**Size:** M (~½ day)
**Area:** web
**Depends on:** 1.3, 3.3, 4.1

Per `docs/product/operator-ui-redesign.md` → "Per-Screen Direction" →
"PR detail — Inspector".

**Acceptance criteria:**

- [ ] `<ActivityStream />` consumed with `mode: "inspector"`. Noops
      visible. Non-manual GitHub events visible.
- [ ] Event cards in Inspector variant additionally render: SHA pair
      (`targetHeadSha` → `observedCommitSha`), command summaries,
      provider metadata, raw JSON toggle, internal phase labels, token
      usage (via existing `<UsageBadge />` ported to new tokens).
- [ ] `<CommitChip mode="inspector">` shows the SHA pair.
- [ ] Workspace path, reviewer pack, providerMetadata visible in
      collapsed cards rather than gated behind expand.

---

### Issue 4.3 — `<OutputsPanel />`

**Size:** S (~3hr)
**Area:** web
**Depends on:** 1.7, 4.1

Per `docs/product/operator-ui-redesign.md` → "Component Patterns" →
"Outputs panel (Inspector only)".

**Acceptance criteria:**

- [ ] New `apps/web/components/outputs-panel.tsx` rendered below the
      activity stream on the Inspector page.
- [ ] Groups artifacts (already returned by `getPullRequestDetail`) by
      kind.
- [ ] `commit` group renders `<CommitChip mode="inspector">` per
      artifact.
- [ ] `github_comment` and `linear_issue` groups render compact rows with
      `externalId`, `summary`, `createdAt`, plus a deep link
      (GitHub comment URL constructed from `repoSlug` + ID; Linear issue
      URL constructed from `externalId`).
- [ ] Empty state per group hidden if no artifacts of that kind.

---

## Milestone 5 — Polish & cleanup

### Issue 5.1 — Migrate remaining `status-badge.tsx` consumers and delete

**Size:** S (~2hr)
**Area:** web
**Depends on:** 2.1, 3.1, 3.3, 4.1, 4.2

**Acceptance criteria:**

- [ ] Audit all imports of `apps/web/components/status-badge.tsx`. Replace
      every usage with `<StatusMark />` + canonical translation helpers
      from `lib/status.ts`.
- [ ] Delete `apps/web/components/status-badge.tsx`.
- [ ] No regressions on policies pages (which currently import
      `LifecycleBadge` etc.).

---

### Issue 5.2 — Policies list & editor restyle on new tokens

**Size:** M (~½ day)
**Area:** web
**Depends on:** 1.5, 1.6

Per `docs/product/operator-ui-redesign.md` → "Per-Screen Direction" →
"Policies list" and "Policy editor".

**Acceptance criteria:**

- [ ] `apps/web/app/policies/page.tsx` adopts the new row pattern
      (left rail conveys enabled/disabled, larger title, secondary line
      shows counts as a sentence).
- [ ] Disabled repos render at lower opacity at the bottom of the list.
- [ ] Caps indicator (`+`) becomes a tooltip rather than an inline glyph.
- [ ] `apps/web/app/policies/[repoSlug]/page.tsx` gains a sticky
      bottom-of-viewport save bar that appears only when the form is
      dirty, with Discard and Save actions and a one-line change summary.
- [ ] Status check list grouped by source (`check_run` vs
      `commit_status`) with a filter chip.
- [ ] Specialized reviewer cards: surface = id + run policy + description;
      `Configure` expand reveals prompt ID + globs.

---

### Issue 5.3 — Navigation restyle + connection-state indicator

**Size:** XS (~1hr)
**Area:** web
**Depends on:** 1.5, 1.6

Per `docs/product/operator-ui-redesign.md` → "Per-Screen Direction" →
"Navigation".

**Acceptance criteria:**

- [ ] `apps/web/components/nav.tsx` restyled to new tokens and type
      scale.
- [ ] "Live" pill becomes a connection-state indicator using
      `<StatusMark status="live" />` when connected; switches to
      `<StatusMark status="caution" />` when the Convex subscription is
      reconnecting (use Convex client connection state — confirm API
      surface with the project's `convex/react` version before
      implementation).

---

### Issue 5.4 — Remove dead UI code and stale CSS

**Size:** XS (~1hr)
**Area:** web
**Depends on:** all 2.x, 3.x, 4.x, 5.1, 5.2, 5.3

**Acceptance criteria:**

- [ ] Remove `dot-grid` background CSS from `globals.css` (already done
      in 1.5; verify no stragglers).
- [ ] Remove the legacy collapsed-noops UI from Operator code paths
      (Inspector keeps it).
- [ ] Remove the old "Workflow state strip" code if any traces remain.
- [ ] Remove unused imports across the touched pages.
- [ ] `pnpm -w build` passes in `apps/web`.

---

### Issue 5.5 — Playground page audit + design sign-off

**Size:** XS (~1hr)
**Area:** web

**Acceptance criteria:**

- [ ] `apps/web/app/_playground/status/page.tsx` updated with all final
      primitives (`<StatusMark />`, `<StatusRail />`, `<CommitChip />`,
      example error card with stack, Operator vs Inspector cards
      side-by-side).
- [ ] Jackson reviews the playground in production, signs off in the
      Linear issue comments, and the playground is either deleted or
      kept behind a `noindex` (your call).

---

## After creation

When you're done, post a comment on the project (or the first issue)
summarizing:

1. Total issue count and total estimate.
2. The dependency graph as a short text outline.
3. Any issues you couldn't create exactly as specified, with the reason.

Do not start implementation. The user will work through the issues in
priority order or assign them out from there.
