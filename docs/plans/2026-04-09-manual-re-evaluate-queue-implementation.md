# Manual Re-evaluate Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow the Vercel-hosted PR detail UI to request a manual PR re-evaluation by writing a synthetic manual event into Convex and having the home-network orchestrator drain and signal it to Temporal.

**Architecture:** Reuse the existing `githubEvents` table as the operator-visible event stream, but add delivery bookkeeping fields so manual UI-created events can be claimed and marked processed exactly once by the orchestrator poller. The web app enqueues a manual event, the orchestrator fetches pending manual events from Convex on each poller pass, signals the corresponding workflow, and marks the event processed.

**Tech Stack:** Convex queries/mutations, Next.js 16 client components, Temporal TypeScript SDK client, TypeScript.

---

## Task 1: Extend Convex event storage for manual request delivery

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/githubEvents.ts`
- Modify: `convex/ui.ts`

**Step 1: Add delivery bookkeeping fields to `githubEvents`**

Add nullable fields for source and delivery state so manual events can be claimed and processed without creating a new table.

**Step 2: Add enqueue and delivery mutations**

Implement a public mutation to create a manual event for a PR and internal/public mutations or queries to list pending manual events and mark them claimed/processed.

**Step 3: Expose current manual request state in PR detail**

Update the UI detail query to include the newest manual event so the page can reflect queued or processed state.

## Task 2: Drain pending manual events in the orchestrator

**Files:**
- Modify: `apps/orchestrator/src/integrations/convex.ts`
- Modify: `apps/orchestrator/src/poller/runPoller.ts`

**Step 1: Add Convex client methods**

Expose helpers to list pending manual events and mark them processed after a successful signal.

**Step 2: Signal workflows for pending manual events**

At the start of each poller run, fetch pending manual events, signal the target PR workflow with the existing `manual` event shape, and then mark the event processed.

**Step 3: Keep poller accounting coherent**

Include manually drained events in poller summary counts so logs show how many workflow signals were triggered.

## Task 3: Add the PR detail action

**Files:**
- Modify: `apps/web/app/pr/[repoSlug]/[prNumber]/page.tsx`
- Modify: `apps/web/components/ui/button.tsx` (only if needed)

**Step 1: Add enqueue action wiring**

Use Convex `useMutation` from the PR detail page to enqueue a manual event with one click.

**Step 2: Reflect request state**

Disable or relabel the button while the mutation is in flight and show the latest manual request status from the detail query.

## Task 4: Validate the path

**Files:**
- No code changes required

**Step 1: Regenerate Convex types if needed**

Run the appropriate codegen command if schema/function references changed.

**Step 2: Run focused validation**

Run typecheck or lint commands for the web app, Convex functions, and orchestrator codepaths touched by this change.

**Step 3: Review residual risk**

Verify the remaining edge case is duplicate clicks before the orchestrator drains the queue, and ensure the mutation prevents duplicate pending manual events per PR.
