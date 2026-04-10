# Merge Conflict Resolution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first workflow action that detects GitHub-reported PR merge conflicts, resolves them with a merge commit when possible, and blocks with a PR comment when automation cannot safely continue.

**Architecture:** GitHub mergeability is the decision gate. The orchestrator models merge conflicts as a preflight blocking condition, runs a dedicated merge-conflict agent before existing fix-check/review actions, verifies the pushed merge commit from observed git state, and marks the workflow dirty for a fresh reconciliation pass.

**Tech Stack:** TypeScript, Temporal workflows/activities, GitHub REST/GraphQL APIs, Convex persistence, Codex CLI agent runtime, git CLI.

---

## Testing Policy For This Slice

Automated tests are deferred for now. Do not add a test runner or test files in this implementation slice.

Verification for this slice is limited to:

- `scripts/bootstrap-worktree.sh`
- `pnpm --filter orchestrator typecheck`
- `pnpm --filter web typecheck`
- `pnpm typecheck`
- focused manual review of the affected workflow and runtime paths

When testing is revisited, use the deferred testing section in `docs/plans/2026-04-10-merge-conflict-resolution-design.md`.

---

### Task 1: Extend PR Snapshot Mergeability Metadata

**Files:**
- Modify: `apps/orchestrator/src/domain/github.ts`
- Modify: `apps/orchestrator/src/integrations/github.ts`

**Step 1: Add domain types**

In `apps/orchestrator/src/domain/github.ts`, add:

```ts
export type GitHubMergeabilityState =
  | 'mergeable'
  | 'conflicting'
  | 'unknown'
  | 'other';

export interface PullRequestBaseRef {
  branchName: string;
  sha: string;
}
```

Extend `PullRequestSnapshot`:

```ts
base: PullRequestBaseRef;
mergeabilityState: GitHubMergeabilityState;
```

**Step 2: Add GitHub API fields**

In `apps/orchestrator/src/integrations/github.ts`, extend `GitHubApiPullRequest`:

```ts
base: {
  ref: string;
  sha: string;
};
mergeable: boolean | null;
mergeable_state?: string | null;
```

Add a normalizer near `toActor`:

```ts
function normalizeMergeabilityState(
  pullRequest: GitHubApiPullRequest,
): GitHubMergeabilityState {
  if (pullRequest.mergeable === null) {
    return 'unknown';
  }

  if (pullRequest.mergeable === true) {
    return 'mergeable';
  }

  return pullRequest.mergeable_state === 'dirty' ? 'conflicting' : 'other';
}
```

Import `GitHubMergeabilityState` from the domain module.

**Step 3: Populate snapshots**

In `fetchPullRequestSnapshot`, add:

```ts
base: {
  branchName: pullRequest.base.ref,
  sha: pullRequest.base.sha,
},
mergeabilityState: normalizeMergeabilityState(pullRequest),
```

**Step 4: Verify**

Run:

```bash
scripts/bootstrap-worktree.sh
pnpm --filter orchestrator typecheck
```

Expected: TypeScript errors from downstream code that constructs `PullRequestSnapshot` manually, or a clean pass if no manual construction exists.

**Step 5: Commit**

```bash
git add apps/orchestrator/src/domain/github.ts apps/orchestrator/src/integrations/github.ts
git commit -m "Add PR mergeability metadata"
```

---

### Task 2: Signal Mergeability Changes From The Poller

**Files:**
- Modify: `apps/orchestrator/src/domain/github.ts`
- Modify: `apps/orchestrator/src/poller/normalizeEvent.ts`
- Modify: `apps/orchestrator/src/poller/discoverEvents.ts`
- Modify: `apps/orchestrator/src/integrations/github.ts`

**Step 1: Add an event kind**

In `GitHubPrEventKind`, add:

```ts
| 'pull_request_mergeability_changed'
```

Add optional event fields:

```ts
mergeabilityState?: GitHubMergeabilityState;
baseSha?: string;
```

**Step 2: Add a normalizer**

In `apps/orchestrator/src/poller/normalizeEvent.ts`, add:

```ts
export function normalizeMergeabilityEvent(
  pullRequest: DiscoveredPullRequest,
  input: {
    observedAt: string;
    baseSha: string;
    mergeabilityState: GitHubMergeabilityState;
  },
): GitHubPrEvent {
  return {
    id: `mergeability:${pullRequest.repoSlug}:${pullRequest.pr.number}:${pullRequest.pr.headSha}:${input.baseSha}:${input.mergeabilityState}`,
    kind: 'pull_request_mergeability_changed',
    pr: pullRequest.pr,
    observedAt: input.observedAt,
    actor: pullRequest.author,
    headSha: pullRequest.pr.headSha,
    baseSha: input.baseSha,
    mergeabilityState: input.mergeabilityState,
  };
}
```

**Step 3: Add a lightweight mergeability fetch**

Add `fetchPullRequestMergeability(pr: PullRequestRef)` to `GitHubClient`.

Return:

```ts
{
  base: PullRequestBaseRef;
  mergeabilityState: GitHubMergeabilityState;
}
```

Implement it with `GET /repos/{owner}/{repo}/pulls/{number}` and the same normalizer from Task 1.

**Step 4: Record mergeability observations**

In `discoverEventsForPullRequest`, call `github.fetchPullRequestMergeability(pullRequest.pr)`.

Use the existing Convex poll state helpers instead of adding a new table:

```ts
const cursorKey = `mergeability:${pullRequest.pr.number}:${pullRequest.pr.headSha}:${mergeability.base.sha}`;
const previousRecord = (await convex.getPollCursor(repoSlug, cursorKey)) as
  | { cursorValue?: string | null }
  | null;
const previous = previousRecord?.cursorValue ?? null;
await convex.setPollCursor({
  repoSlug,
  source: 'github_mergeability',
  cursorKey,
  cursorValue: mergeability.mergeabilityState,
  lastObservedAt: observedAt,
});
```

Only emit `pull_request_mergeability_changed` when:

```ts
previous !== mergeability.mergeabilityState &&
mergeability.mergeabilityState === 'conflicting'
```

**Step 5: Avoid schema churn**

Do not change Convex schema in this slice. `githubEvents.kind` is already a string, and the workflow will fetch a fresh PR snapshot after receiving the mergeability signal. Rely on the event ID plus fresh snapshot state instead of persisting `mergeabilityState` or `baseSha` on the event row.

**Step 6: Verify**

Run:

```bash
pnpm --filter orchestrator typecheck
```

Expected: pass after all event type call sites handle the new kind.

**Step 7: Commit**

```bash
git add apps/orchestrator/src/domain/github.ts apps/orchestrator/src/poller/normalizeEvent.ts apps/orchestrator/src/poller/discoverEvents.ts apps/orchestrator/src/integrations/github.ts
git commit -m "Signal PR mergeability conflicts"
```

---

### Task 3: Add Merge Conflict Action To Reconciliation

**Files:**
- Modify: `apps/orchestrator/src/domain/workflow.ts`
- Modify: `apps/orchestrator/src/workflows/reconcile.ts`

**Step 1: Add workflow phase**

Add to `PrWorkflowPhase`:

```ts
| 'resolving_merge_conflicts'
```

**Step 2: Add action type**

Add to `PrReviewNextAction`:

```ts
| {
    type: 'resolve_merge_conflicts';
    baseBranchName: string;
    baseSha: string;
  }
```

**Step 3: Give it highest priority**

At the start of `buildReconciliationResult`, before failing-check classification:

```ts
if (inputs.snapshot.mergeabilityState === 'conflicting') {
  return {
    action: {
      type: 'resolve_merge_conflicts',
      baseBranchName: inputs.snapshot.base.branchName,
      baseSha: inputs.snapshot.base.sha,
    },
    snapshotHeadSha: inputs.snapshot.pr.headSha,
  };
}
```

Do nothing special for `unknown`; allow the existing checks/reviews/reviewer logic to continue.

**Step 4: Map action to phase**

In `mapActionToPhase`, map:

```ts
case 'resolve_merge_conflicts':
  return 'resolving_merge_conflicts';
```

**Step 5: Verify**

Run:

```bash
pnpm --filter orchestrator typecheck
```

Expected: TypeScript points out all unhandled switch statements and workflow branches that need the new action.

**Step 6: Commit**

```bash
git add apps/orchestrator/src/domain/workflow.ts apps/orchestrator/src/workflows/reconcile.ts
git commit -m "Prioritize merge conflict reconciliation"
```

---

### Task 4: Add Merge Conflict Workspace Operations

**Files:**
- Modify: `apps/orchestrator/src/domain/agentRuntime.ts`
- Modify: `apps/orchestrator/src/integrations/workspace.ts`

**Step 1: Add workspace result types**

In `domain/agentRuntime.ts`, add:

```ts
export interface PreparedMergeConflictWorkspace extends PreparedPullRequestWorkspace {
  baseBranchName: string;
  baseSha: string;
  mergeAttemptStatus: 'clean_merge' | 'conflicted';
  mergeOutput: string;
  conflictedFiles: string[];
}
```

**Step 2: Extend WorkspaceManager**

Add:

```ts
prepareMergeConflictWorkspace(input: {
  pr: PullRequestRef;
  baseBranchName: string;
  baseSha: string;
}): Promise<PreparedMergeConflictWorkspace>;
```

**Step 3: Implement local merge attempt**

Implementation outline:

```ts
const workspace = await preparePullRequestWorkspace(input.pr);
await runGit(['fetch', 'origin', input.baseBranchName, '--prune'], workspace.path);

try {
  const result = await runGit(
    ['merge', '--no-ff', '--no-edit', `origin/${input.baseBranchName}`],
    workspace.path,
  );
  return {
    ...workspace,
    baseBranchName: input.baseBranchName,
    baseSha: input.baseSha,
    mergeAttemptStatus: 'clean_merge',
    mergeOutput: [result.stdout, result.stderr].filter(Boolean).join('\n'),
    conflictedFiles: [],
  };
} catch (error) {
  const conflictedFiles = (
    await runGit(['diff', '--name-only', '--diff-filter=U'], workspace.path)
  ).stdout.trim().split('\n').filter(Boolean);

  return {
    ...workspace,
    baseBranchName: input.baseBranchName,
    baseSha: input.baseSha,
    mergeAttemptStatus: 'conflicted',
    mergeOutput: error instanceof Error ? error.message : 'git merge failed',
    conflictedFiles,
  };
}
```

Use a shared local helper rather than `this.preparePullRequestWorkspace`, because the current workspace manager methods are arrow functions in an object literal. Preserve the conflicted working tree for the agent.

**Step 4: Verify**

Run:

```bash
pnpm --filter orchestrator typecheck
```

Expected: pass after imports are fixed.

**Step 5: Commit**

```bash
git add apps/orchestrator/src/domain/agentRuntime.ts apps/orchestrator/src/integrations/workspace.ts
git commit -m "Prepare merge conflict workspaces"
```

---

### Task 5: Add Merge Conflict Agent Runtime

**Files:**
- Modify: `apps/orchestrator/src/domain/agentRuntime.ts`
- Modify: `apps/orchestrator/src/integrations/agentRuntime.ts`
- Create: `apps/orchestrator/src/activities/runMergeConflictAgent.ts`
- Modify: `apps/orchestrator/src/activities/index.ts`

**Step 1: Add agent input and execution types**

Add:

```ts
export interface MergeConflictAgentRunInput {
  snapshot: PullRequestSnapshot;
  baseBranchName: string;
  baseSha: string;
  provider?: AgentProvider;
}

export interface MergeConflictAgentExecution {
  status: AgentExecutionStatus;
  provider: AgentProvider;
  workspace: PreparedMergeConflictWorkspace | null;
  logFilePath: string | null;
  startingHeadSha: string;
  localHeadAfter: string | null;
  remoteHeadAfter: string | null;
  summary: string;
  blockedReason: string | null;
  usage: import('ai').LanguageModelUsage | null;
  providerMetadata: import('ai').ProviderMetadata | null;
  result: MergeConflictAgentResult | null;
}
```

Define a Zod result schema with:

```ts
overallSummary
investigationSummary
finalAssessment
whyNoCommit
commandsSummary
didModifyCode
didCommitCode
observedCommitSha
```

**Step 2: Extend AgentRuntimeClient**

Add:

```ts
runMergeConflictResolution(
  input: MergeConflictAgentRunInput,
): Promise<MergeConflictAgentExecution>;
```

**Step 3: Add prompt builder**

Prompt requirements:

- resolve merge conflicts
- preserve both PR and base intent where possible
- make the project valid after the merge
- avoid broad or unrelated refactoring
- inspect conflicted files before editing
- run focused verification when practical
- commit and push exactly once if resolved
- explain why no commit was pushed if blocked

**Step 4: Implement runtime**

Use `workspaceManager.prepareMergeConflictWorkspace`.

If `mergeAttemptStatus === 'clean_merge'`, push the merge commit when local head changed from starting head, then return completed without launching Codex.

If conflicted, launch Codex with the merge-conflict prompt.

After Codex returns, verify:

```bash
git diff --name-only --diff-filter=U
git status --porcelain
git fetch origin <pr-branch> --prune
git rev-parse HEAD
git rev-parse origin/<pr-branch>
```

Throw or return blocked if unmerged paths remain or the working tree is dirty after a claimed commit.

**Step 5: Add activity wrapper**

Create `runMergeConflictAgent.ts` following the pattern in `runFixChecksAgent.ts`.

Export it from `activities/index.ts`.

**Step 6: Verify**

Run:

```bash
pnpm --filter orchestrator typecheck
```

Expected: pass once the workflow has not yet imported the activity, or actionable type errors for missing exports.

**Step 7: Commit**

```bash
git add apps/orchestrator/src/domain/agentRuntime.ts apps/orchestrator/src/integrations/agentRuntime.ts apps/orchestrator/src/activities/runMergeConflictAgent.ts apps/orchestrator/src/activities/index.ts
git commit -m "Add merge conflict agent runtime"
```

---

### Task 6: Add Workflow-Owned PR Comment Posting

**Files:**
- Modify: `apps/orchestrator/src/integrations/github.ts`
- Create: `apps/orchestrator/src/activities/postPullRequestComment.ts`
- Modify: `apps/orchestrator/src/activities/index.ts`

**Step 1: Add GitHub client method**

Add to `GitHubClient`:

```ts
postPullRequestComment(input: {
  repository: RepositoryRef;
  prNumber: number;
  body: string;
}): Promise<{ commentId: number; htmlUrl: string | null }>;
```

Implement with:

```ts
POST /repos/{owner}/{repo}/issues/{issue_number}/comments
```

**Step 2: Add activity**

Create `postPullRequestComment.ts`:

```ts
export async function postPullRequestComment(input: {
  repository: RepositoryRef;
  prNumber: number;
  body: string;
}): Promise<{ commentId: number; htmlUrl: string | null }> {
  const runtimeConfig = loadRuntimeConfig();
  const github = createGitHubClient(runtimeConfig.github);
  return await github.postPullRequestComment(input);
}
```

**Step 3: Verify**

Run:

```bash
pnpm --filter orchestrator typecheck
```

Expected: pass.

**Step 4: Commit**

```bash
git add apps/orchestrator/src/integrations/github.ts apps/orchestrator/src/activities/postPullRequestComment.ts apps/orchestrator/src/activities/index.ts
git commit -m "Add PR comment posting activity"
```

---

### Task 7: Integrate Merge Conflict Resolution Into Workflow

**Files:**
- Modify: `apps/orchestrator/src/workflows/prReviewOrchestrator.ts`

**Step 1: Import activities**

Add proxy activity bindings for:

```ts
runMergeConflictAgent
postPullRequestComment
```

Use the 30-minute activity proxy group for the agent. Use the 1-minute proxy group for comment posting.

**Step 2: Add run details helper**

Add:

```ts
function toMergeConflictRunDetails(execution: MergeConflictAgentExecution): string {
  return toRunDetailsJson({
    provider: execution.provider,
    status: execution.status,
    usage: execution.usage,
    providerMetadata: execution.providerMetadata,
    logFilePath: execution.logFilePath,
    workspacePath: execution.workspace?.path ?? null,
    reusedExistingClone: execution.workspace?.reusedExistingClone ?? null,
    startingHeadSha: execution.startingHeadSha,
    localHeadAfter: execution.localHeadAfter,
    remoteHeadAfter: execution.remoteHeadAfter,
    baseBranchName: execution.workspace?.baseBranchName ?? null,
    baseSha: execution.workspace?.baseSha ?? null,
    conflictedFiles: execution.workspace?.conflictedFiles ?? [],
    mergeOutput: execution.workspace?.mergeOutput ?? null,
    blockedReason: execution.blockedReason,
    result: execution.result,
  });
}
```

**Step 3: Add action branch before fix_checks**

Handle `resolve_merge_conflicts` before `fix_checks`.

On start, record `prRuns` with:

```ts
phase: 'resolve_merge_conflicts'
status: 'running'
summary: `Resolving merge conflicts with ${baseBranchName}.`
```

Call:

```ts
const execution = await runMergeConflictAgent({
  snapshot,
  baseBranchName,
  baseSha,
});
```

If `execution.result?.observedCommitSha`, call `markWorkflowDirtyForHead` and record completed run.

If `execution.blockedReason`, record blocked/failed run, set `blockedReason`, and post a PR comment:

```md
Automation is blocked because this PR has merge conflicts that could not be resolved safely.

Reason: <blockedReason>

The remaining review automation will wait until the conflict is resolved.
```

**Step 4: Ensure one block comment per run**

For the first slice, post on each blocked merge-conflict run. Leave dedupe per head/base pair as a follow-up unless duplicate comments become noisy.

**Step 5: Verify**

Run:

```bash
pnpm --filter orchestrator typecheck
```

Expected: pass.

**Step 6: Commit**

```bash
git add apps/orchestrator/src/workflows/prReviewOrchestrator.ts
git commit -m "Run merge conflict resolution first"
```

---

### Task 8: Update Operator UI Labels

**Files:**
- Modify: `apps/web/components/status-badge.tsx`
- Modify: `apps/web/components/run-detail.tsx`
- Modify: `apps/web/lib/run-details.ts`

**Step 1: Add phase/status label**

Add support for:

```ts
'resolving_merge_conflicts'
'resolve_merge_conflicts'
```

Use neutral/running styling consistent with existing active phases.

**Step 2: Render merge conflict run details**

In `run-details.ts`, parse merge-conflict run details as a generic agent-like execution if the phase is `resolve_merge_conflicts`.

Display:

- base branch
- base SHA
- conflicted files
- observed commit SHA
- blocked reason

Keep rendering simple; do not build a new UI surface.

**Step 3: Verify**

Run:

```bash
pnpm --filter web typecheck
pnpm typecheck
```

Expected: pass.

**Step 4: Commit**

```bash
git add apps/web/components/status-badge.tsx apps/web/components/run-detail.tsx apps/web/lib/run-details.ts
git commit -m "Display merge conflict resolution runs"
```

---

### Task 9: Final Manual Verification

**Files:**
- No planned file changes.

**Step 1: Run full typecheck**

Run:

```bash
pnpm typecheck
```

Expected: pass.

**Step 2: Review git diff**

Run:

```bash
git status --short
git log --oneline -8
```

Expected:

- clean worktree
- one commit per task
- no test files added

**Step 3: Document follow-up testing**

If implementation uncovered any specific risky path, append it to the deferred testing list in `docs/plans/2026-04-10-merge-conflict-resolution-design.md`.

**Step 4: Commit docs follow-up if needed**

```bash
git add docs/plans/2026-04-10-merge-conflict-resolution-design.md
git commit -m "Document merge conflict testing follow-ups"
```

Skip this commit if there was no docs follow-up.

---

## Deferred Follow-Ups

- Add automated unit tests for reconciliation priority and mergeability handling.
- Add integration-style git fixture tests for conflicted merge workspaces.
- Add PR comment dedupe per head/base pair if blocked comments become noisy.
- Consider repo policy controls if some repositories should not allow automated conflict resolution.
