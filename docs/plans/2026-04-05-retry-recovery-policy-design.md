# Retry And Recovery Policy Design

## Status

Follow-up design note captured on April 5, 2026 for later implementation.

## Goal

Define a safer retry and recovery model for AI-driven PR automation without assuming that failed agent runs are side-effect-free.

This design is intentionally deferred until the orchestration and execution paths are more mature. It exists to preserve the agreed direction and terminology for later work.

## Why This Matters

The system now has real side effects:

- pushes commits to PR branches
- replies on GitHub review threads
- creates Linear tickets

That means a failed agent run is not automatically safe to retry. The agent may have already changed the external world before returning an invalid result or before persistence back into Convex succeeded.

The retry policy therefore needs to be based on observed external state, not just exceptions.

## Guiding Principle

Retries should be driven by whether the external world is still in the pre-action state.

If the system cannot prove that no side effects happened, it should reconcile observed state first and only retry if work is still outstanding.

## Failure Classes

### 1. Safe To Retry Immediately

These are failures that happen before any meaningful external side effect is likely.

Examples:

- GitHub snapshot fetch fails before the agent starts
- Convex read fails during planning
- agent process fails to launch
- provider transport fails before the agent meaningfully executes

Desired behavior:

- allow normal activity/workflow retry behavior
- keep the retry path automatic

### 2. Retry Only After Reconciliation

These are failures where side effects may already have happened.

Examples:

- agent pushes a commit but returns invalid structured output
- agent posts GitHub replies but persistence into Convex fails
- agent creates a Linear ticket but throws before returning the ticket ID
- agent summary says work completed but commit/ticket/comment metadata is missing

Desired behavior:

- do not immediately rerun the agent
- re-fetch current GitHub / Linear / branch state
- infer what actually happened
- continue only if work is still outstanding

### 3. Not Worth Automatic Retry

These are failures that are unlikely to improve through repetition.

Examples:

- provider or credential misconfiguration
- invalid prompt/result contract
- missing required tooling
- policy misconfiguration
- agent explicitly concludes it cannot safely complete the task

Desired behavior:

- record a blocked/operator-visible state
- do not churn the same action automatically

## Recovery Pass Model

When a run lands in the ambiguous middle category, the workflow should enter a recovery-oriented reconciliation path instead of launching a fresh agent immediately.

Recovery should inspect:

- current PR head SHA
- current failing/passing check state
- current unresolved Code Rabbit thread state
- GitHub replies that may have already been posted
- Linear tickets that may already exist for expected thread correlation keys
- Convex artifacts already persisted

The workflow should then decide:

- the action effectively succeeded
- some side effects happened, but work is still incomplete
- no side effects are visible, so a retry is safe
- the situation is blocked and needs operator review

## Future Execution Outcome States

The execution model should eventually distinguish at least these states:

- `completed`
- `completed_with_side_effect_recovery`
- `transient_failure`
- `ambiguous_side_effect_failure`
- `blocked`
- `skipped`

These states should be reflected in `prRuns` and `workflowErrors` so the operator UI can show why a run did or did not retry.

## Fix Checks Recovery

`fix_checks` should eventually use a recovery policy like this:

1. If the agent fails and the branch head did not move, treat it as a likely pre-side-effect failure.
2. If the agent fails and the branch head moved, fetch a fresh PR snapshot before doing anything else.
3. If the formerly failing checks are now green, mark the run as recovered and continue.
4. If checks are still red, decide whether to retry or block based on the evidence captured in the run details.

This is especially important because check outcomes can change independently of the workflow itself.

## Code Rabbit Recovery

`handle_code_rabbit` should eventually reconcile against thread-level artifacts:

- pushed commit on the PR branch
- GitHub replies on expected threads
- Linear issues created for deferred items

If those artifacts exist and the threads are no longer actionable, the system should treat the run as effectively recovered rather than re-running the agent.

## Data Needed To Support This Later

The current system already stores much of the right raw material:

- `prRuns`
- `workflowErrors`
- `artifacts`
- `threadDecisions`
- rich structured agent result details

When this design is implemented, the main remaining additions should be:

- stronger execution outcome typing
- explicit recovery-path run summaries
- clearer correlation between expected and observed external side effects

## Decision

Do not implement automatic deep retry logic yet.

For now:

- keep the current conservative behavior
- record failures clearly
- rely on fresh poll/signal-driven reconciliation
- terminate disposable stuck workflows during development when needed

Return to this design once the system is stable enough that ambiguous-side-effect recovery becomes the highest-value reliability improvement.
