# Status Check Catalog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace handwritten fixable-check policy strings with a poller-discovered status-check catalog controlled by checkboxes.

**Architecture:** Add an additive Convex `repoStatusChecks` table keyed by repository and GitHub status-check name. The poller upserts discovered check runs and commit statuses without starting PR workflows. Workflow check handling reads enabled catalog rows and still only acts on checks present in the current PR snapshot.

**Tech Stack:** Convex schema/functions, Temporal orchestrator TypeScript, Next.js app router, shadcn-style UI components.

---

### Task 1: Add Convex Catalog

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/repoStatusChecks.ts`
- Modify: `convex/ui.ts`

Add a new `repoStatusChecks` table with `repoSlug`, `name`, `source`, and `enabled`.
Expose mutations to upsert observed checks and set enabled state.
Expose queries for repo detail and policy list counts.

### Task 2: Wire Orchestrator Reads And Discovery

**Files:**
- Modify: `apps/orchestrator/src/domain/github.ts`
- Modify: `apps/orchestrator/src/domain/policy.ts`
- Modify: `apps/orchestrator/src/integrations/github.ts`
- Modify: `apps/orchestrator/src/integrations/convex.ts`
- Modify: `apps/orchestrator/src/poller/discoverEvents.ts`
- Modify: `apps/orchestrator/src/activities/classifyChecks.ts`

Track each snapshot check source as `check_run` or `commit_status`.
Upsert status-check catalog rows during poller discovery.
Load enabled catalog names for workflow classification.
Continue ignoring enabled catalog rows absent from the current PR snapshot.

### Task 3: Replace Policy UI Textareas

**Files:**
- Add: `apps/web/components/ui/checkbox.tsx`
- Modify: `apps/web/app/policies/page.tsx`
- Modify: `apps/web/app/policies/[repoSlug]/page.tsx`

Use shadcn-style checkboxes for discovered status checks.
Remove fixable/ignored textareas from the UI.
Preserve specialized reviewer editing.

### Task 4: Verify

Run:

```bash
scripts/bootstrap-worktree.sh
pnpm typecheck
```

Expected: TypeScript and Convex generated types are consistent.
