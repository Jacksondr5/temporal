# Merge Conflict Resolution Design

## Status

Approved direction captured on April 10, 2026.

## Goal

Detect pull requests that GitHub reports as having merge conflicts and make conflict resolution the first automated step in the PR review workflow.

The workflow should attempt to resolve merge conflicts before fixing checks, handling Code Rabbit threads, or running specialized reviewers. This keeps later work grounded on a branch that can actually merge into its base branch.

## Non-Goals

- Do not keep every PR branch up to date with its base branch.
- Do not run this step when the PR is merely behind the base branch but still mergeable.
- Do not rebase or force-push PR branches.
- Do not fold merge conflict handling into the existing CI/status-check runner.
- Do not use this step for broad refactoring.

## Chosen Approach

Use GitHub's PR mergeability state as the gate for conflict handling, then use a local git merge attempt as the workspace setup for the resolver.

The workflow should add a new first-class action:

1. Resolve merge conflicts
2. Fix allowlisted failing checks
3. Handle Code Rabbit review items
4. Run matching specialized reviewers
5. Reconcile again and return to idle if clean

This treats a merge conflict as a blocking preflight condition rather than a normal status check. It has the same workflow priority as a blocking check, but it needs a different data contract, workspace setup, prompt, verification path, and human notification behavior.

## Why Not Model This As A Failing Check

The existing `fix_checks` path is built around `GitHubCheckRun` data:

- check name
- status and conclusion
- details URL
- app name and slug
- policy classification
- check-specific log inspection guidance

Merge conflicts have a different native interface:

- base branch name and SHA
- GitHub mergeability state
- local merge output
- conflicted file list
- conflict markers in the working tree
- merge commit creation
- post-push verification that GitHub now considers the PR mergeable

Representing conflicts as a fake check would require placeholder fields and would mix CI-log-oriented prompt guidance into a git conflict task. The cleaner model is a general "blocking preflight condition" category with `merge_conflict` as the first supported condition.

## Detection

The GitHub PR snapshot should include enough metadata to answer:

- base branch name
- base branch SHA
- PR head branch name
- PR head SHA
- GitHub mergeability state

The workflow should only run conflict resolution when GitHub reports the PR is conflicted or otherwise not cleanly mergeable because of merge conflicts.

If GitHub's mergeability state is temporarily unknown or still loading, the workflow should not block and should not run an agent. The poller already observes PRs continuously, so the next poll cycle can pick up the settled state.

To make that reliable, mergeability should be treated as observed poll state. The poller should record the last seen mergeability state for each PR head/base pair and signal the workflow when the state changes into a conflicting state. Otherwise, a transition from unknown to conflicted on the same head SHA could be missed because the existing head/review/check event IDs would already be deduped.

When a workflow pass sees unknown mergeability, it should skip only the merge-conflict action. It may continue normal action selection for checks and reviews; a later mergeability-change signal can still preempt future passes when GitHub reports a conflict.

## Workspace Setup

The merge conflict runner should prepare the same PR branch workspace used by other code-changing agents, then fetch the PR base branch.

The runner should attempt a local merge from the base branch into the PR branch:

```bash
git fetch origin <base-branch> --prune
git merge --no-ff origin/<base-branch>
```

If the merge succeeds without conflicts, the runner can commit/push the merge if git did not already create a merge commit, then mark the workflow dirty so it re-fetches the PR state.

If the merge stops with conflicts, the conflicted working tree becomes the input for the merge conflict agent.

The workflow should prefer merge commits over rebases. It should not rewrite PR history.

## Agent Behavior

The conflict resolver agent should receive:

- repository and PR number
- PR branch and head SHA
- base branch and base SHA
- current title/body
- changed files
- conflicted files
- local merge command/output summary

The prompt should frame the task as:

- resolve the merge conflicts
- preserve the intent of both the PR branch and the base branch where possible
- make the project valid after the merge
- avoid broad or unrelated refactoring
- run focused verification when practical
- commit and push exactly once if it changes code
- explain why it did not push if it cannot safely finish

The agent should not be overly constrained to mechanical hunk selection. It may make the edits needed to produce a correct merge result, but the goal is conflict resolution, not opportunistic cleanup.

## Success Verification

After the agent returns, the runtime should inspect git state rather than trusting the agent's structured output alone.

Minimum verification:

- the working tree is clean
- no unmerged paths remain
- the PR branch remote head changed from the starting SHA
- the observed pushed commit is recorded in run details

The workflow should then mark itself dirty for the new head SHA and start a fresh reconciliation pass. The next snapshot should determine whether GitHub now reports the PR as mergeable and whether checks/reviews need attention.

## Blocking And Notification

If the resolver cannot safely resolve the conflict, the workflow should:

- record a blocked workflow error in Convex
- record a failed or blocked PR run with the resolver's summary
- set the PR workflow `blockedReason`
- post a concise GitHub PR comment explaining that automation is blocked by merge conflicts and human help is needed

The GitHub comment should be reserved for intentional process blocks, not routine transient infrastructure errors.

The comment should include:

- that automation detected merge conflicts
- that it attempted resolution and stopped
- a short reason from the resolver
- that the remaining review automation is blocked until the conflict is resolved

## Data Model Impact

The domain model should gain mergeability metadata on `PullRequestSnapshot` rather than trying to encode it as a check.

Likely additions:

- `baseBranchName`
- `baseSha`
- `mergeabilityState`

The workflow decision inputs should support preflight blocking conditions. The first condition can be:

- `merge_conflict`

`prRuns.detailsJson` for merge-conflict runs should include:

- starting head SHA
- base branch
- base SHA
- conflicted files
- local head after
- remote head after
- observed commit SHA
- agent summary
- blocking reason, if any

## UI Impact

The operator UI can display merge conflict resolution as another PR run phase. It does not need a new top-level product concept at first.

Useful labels:

- `resolving_merge_conflicts`
- `Merge conflicts resolved`
- `Merge conflict resolution blocked`

The PR summary should surface the blocked reason when conflict resolution fails.

## Error Handling

If GitHub snapshot fetch fails, use the existing workflow/activity failure path.

If GitHub mergeability is unknown, skip conflict handling for that pass and wait for a later poll/signal.

If local git merge reports no conflicts even though GitHub reported conflicts, treat the local result as useful but still rely on the next GitHub snapshot for final truth. The workflow should push a merge commit only if doing so changes the PR branch.

If the agent pushes a commit but returns invalid or incomplete structured output, do not immediately rerun it. Follow the existing recovery design direction: inspect observed external state first.

## Deferred Testing

Testing is intentionally deferred for now. When we come back to it, unit tests should cover:

- reconciliation chooses merge conflict resolution before checks, review items, and specialized reviewers
- unknown mergeability does not run the resolver
- mergeable PRs skip the resolver
- conflicted PRs produce the merge conflict action
- resolver success marks the workflow dirty with the observed pushed SHA
- resolver failure records a blocked state and requests a PR comment

Integration-style tests should cover:

- local merge conflict setup produces the expected conflicted file list
- resolved merge commits are detected after push
- no unmerged paths remain before a run is considered successful

## Open Questions

- Which exact GitHub REST or GraphQL mergeability enum should the implementation normalize around?
- Should the PR comment be de-duplicated per head SHA, per base SHA, or per conflict run?
- Should repos be able to disable automated merge conflict resolution through policy?
