# PR Workspace Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify PR workspace preparation so clone-time setup happens once and reused workspaces refresh to the latest remote PR branch state with minimal git operations.

**Architecture:** `workspace.ts` owns PR-local clones under `WORKSPACE_ROOT`. The first run clones the PR branch and applies git identity once. Reused workspaces skip remote and identity normalization, fetch the current remote branch state, hard-reset to `origin/<branch>`, and remove untracked files before agent work begins.

**Tech Stack:** TypeScript, Node.js child-process git integration, Temporal orchestrator activities

---

## Task 1: Document the approved behavior

**Files:**
- Create: `docs/plans/2026-04-10-pr-workspace-refresh-design.md`
- Create: `docs/plans/2026-04-10-pr-workspace-refresh-implementation-plan.md`

**Step 1: Save the design summary**

Write the approved design in `docs/plans/2026-04-10-pr-workspace-refresh-design.md`.

**Step 2: Save the implementation plan**

Write this plan file so the workspace behavior change is documented before code edits.

## Task 2: Simplify first-time clone setup

**Files:**
- Modify: `apps/orchestrator/src/integrations/workspace.ts`

**Step 1: Clone the PR branch directly**

Update clone logic so the initial clone checks out the PR branch once instead of relying on later recurring branch setup.

**Step 2: Apply git identity only during initial clone setup**

Move git identity configuration so it runs once for a newly created workspace and not on every reuse.

## Task 3: Simplify workspace refresh for reused clones

**Files:**
- Modify: `apps/orchestrator/src/integrations/workspace.ts`

**Step 1: Remove recurring remote and branch normalization**

Delete the recurring `remote set-url`, recurring git identity configuration, and recurring checkout logic from the reuse path.

**Step 2: Refresh from the remote PR branch**

For reused workspaces, fetch the PR branch, hard-reset to `origin/<branch>`, and clean untracked files so the workspace matches the latest remote branch state.

## Task 4: Verify the orchestrator still builds

**Files:**
- Modify: `apps/orchestrator/src/integrations/workspace.ts`

**Step 1: Run targeted typecheck or build validation**

Run the smallest available verification command for the orchestrator package.

**Step 2: Review the diff**

Inspect the final diff to confirm the behavior matches the approved design and no unrelated changes were introduced.
