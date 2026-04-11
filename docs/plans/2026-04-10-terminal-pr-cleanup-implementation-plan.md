# Terminal PR Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect when tracked PRs become closed or merged, stop further automation, persist terminal lifecycle state in Convex, delete the cloned workspace, and conclude the PR workflow while retaining history.

**Architecture:** The poller remains the source of GitHub truth. It detects tracked PRs that are no longer open and signals the existing Temporal workflow with a terminal lifecycle payload. The workflow becomes the sole owner of terminal cleanup: once terminal has been signaled, it refuses to schedule any new agent work, persists terminal state to Convex, records a final terminal run, deletes the PR workspace, and exits.

**Tech Stack:** TypeScript, Temporal TypeScript SDK, Convex queries/mutations, GitHub REST API, Next.js UI

---

## Task 1: Document the approved design

**Files:**
- Create: `docs/plans/2026-04-10-terminal-pr-cleanup-design.md`
- Create: `docs/plans/2026-04-10-terminal-pr-cleanup-implementation-plan.md`

**Step 1: Save the design summary**

Write the terminal PR cleanup design in the design doc.

**Step 2: Save the implementation plan**

Write this implementation plan to keep the behavior explicit before code changes.

## Task 2: Add terminal lifecycle types and GitHub detection

**Files:**
- Modify: `apps/orchestrator/src/domain/github.ts`
- Modify: `apps/orchestrator/src/integrations/github.ts`
- Modify: `apps/orchestrator/src/client.ts`

**Step 1: Add explicit lifecycle types**

Add a shared PR lifecycle state type for `open`, `closed`, and `merged`.

**Step 2: Fetch terminal state from GitHub**

Extend the GitHub client so the poller can resolve whether a tracked PR that disappeared from the open set is still open, closed, or merged.

**Step 3: Add terminal workflow signaling**

Add a dedicated Temporal client helper to signal the workflow with terminal lifecycle state.

## Task 3: Implement workflow-owned terminal cleanup

**Files:**
- Modify: `apps/orchestrator/src/domain/workflow.ts`
- Modify: `apps/orchestrator/src/workflows/signals.ts`
- Modify: `apps/orchestrator/src/workflows/prReviewOrchestrator.ts`
- Add: `apps/orchestrator/src/activities/removePullRequestWorkspace.ts`
- Modify: `apps/orchestrator/src/activities/index.ts`

**Step 1: Extend workflow state and status records**

Track lifecycle state and terminal cleanup phase in workflow state and persisted status.

**Step 2: Gate new work on terminal signal**

Make sure every agent-launch path checks terminal state before scheduling new work.

**Step 3: Add cleanup activity**

Expose workspace deletion as an activity and use it during terminal cleanup.

**Step 4: Record final terminal state**

Write a final workflow status and PR run entry before the workflow exits.

## Task 4: Persist lifecycle state in Convex

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/pullRequests.ts`
- Modify: `convex/githubEvents.ts`
- Modify: `apps/orchestrator/src/integrations/convex.ts`

**Step 1: Add lifecycle state to tracked PR records**

Extend the schema and upsert functions to preserve or set `lifecycleState`.

**Step 2: Add poller query support**

Expose the tracked PR records needed to detect terminal state.

**Step 3: Prevent manual requests for terminal PRs**

Reject enqueueing manual reevaluate events for closed or merged PRs.

## Task 5: Update the poller and UI

**Files:**
- Modify: `apps/orchestrator/src/poller/runPoller.ts`
- Modify: `convex/ui.ts`
- Modify: `apps/web/components/status-badge.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/pr/[repoSlug]/[prNumber]/page.tsx`

**Step 1: Detect terminal PRs in the poller**

Compare tracked PRs against the GitHub open set and signal terminal state when needed.

**Step 2: Surface lifecycle state in the UI**

Show whether a tracked PR is open, closed, or merged while keeping terminal PRs visible in the list/detail views.

## Task 6: Validate the full path

**Files:**
- No new files required

**Step 1: Regenerate generated Convex types if needed**

Run codegen so new Convex functions and schema fields are reflected in generated types.

**Step 2: Run focused validation**

Run typecheck for the orchestrator and web app paths touched by this change.

**Step 3: Review final diff**

Confirm the terminal cleanup path is coherent end-to-end and that no unrelated behavior changed.
