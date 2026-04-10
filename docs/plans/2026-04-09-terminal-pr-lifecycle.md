# Terminal PR Lifecycle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close per-PR Temporal workflows when the GitHub pull request is closed or merged.

**Architecture:** The poller remains the source of PR discovery. It lists open PRs as before, then checks previously tracked PRs in Convex that were not observed as open; if GitHub reports one as closed or merged, the poller records a terminal event and signals the existing workflow. The workflow treats terminal snapshots as final state, writes a final noop run/status, and returns.

**Tech Stack:** TypeScript, Temporal TypeScript SDK, Convex, GitHub REST API.

---

## Task 1: Add Lifecycle State To Domain And Convex

**Files:**

- Modify: `apps/orchestrator/src/domain/github.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/pullRequests.ts`
- Modify: `apps/orchestrator/src/integrations/convex.ts`

**Steps:**

1. Add `PullRequestLifecycleState = "open" | "closed" | "merged"`.
2. Add lifecycle state to PR refs/snapshots/status records.
3. Persist `lifecycleState` on `pullRequests`.
4. Add a bounded Convex query for tracked non-terminal PRs by repo.

## Task 2: Teach GitHub Integration About Closed/Merged PRs

**Files:**

- Modify: `apps/orchestrator/src/integrations/github.ts`
- Modify: `apps/orchestrator/src/poller/discoverPullRequests.ts`

**Steps:**

1. Parse REST PR `state` and `merged_at`.
2. Return `lifecycleState` from open discovery and snapshot fetches.
3. Add a method to fetch a single PR summary by repo/number.

## Task 3: Signal Terminal Events From Poller

**Files:**

- Modify: `apps/orchestrator/src/domain/github.ts`
- Modify: `apps/orchestrator/src/domain/workflow.ts`
- Modify: `apps/orchestrator/src/poller/runPoller.ts`
- Modify: `apps/orchestrator/src/poller/normalizeEvent.ts`

**Steps:**

1. Add `pull_request_closed` and `pull_request_merged` event kinds.
2. After processing open PRs, compare open PR numbers against tracked non-terminal PRs.
3. For tracked PRs no longer open, fetch GitHub state and signal a terminal event when closed/merged.

## Task 4: Complete Workflow On Terminal Snapshot

**Files:**

- Modify: `apps/orchestrator/src/domain/workflow.ts`
- Modify: `apps/orchestrator/src/workflows/prReviewOrchestrator.ts`

**Steps:**

1. Make terminal snapshots produce a `noop` action with a terminal reason.
2. After recording the terminal pass and final status, return from the workflow.
3. Ensure terminal events do not trigger agent execution.

## Task 5: Verify

**Commands:**

- `pnpm --filter orchestrator typecheck`
- `pnpm typecheck`

Expected result: TypeScript passes for the orchestrator and monorepo.
