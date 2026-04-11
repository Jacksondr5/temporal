# Terminal PR Cleanup Design

**Goal:** When a tracked pull request becomes closed or merged, stop further automation, persist the terminal lifecycle state in Convex, delete the on-disk workspace, and conclude the Temporal workflow without losing historical data.

**Decisions:**
- `closed` and `merged` use the same cleanup flow.
- The workflow is the single owner of terminal cleanup.
- The poller only detects terminal state and signals the workflow.
- Historical Convex data is retained; only the workspace clone is deleted.
- Cancellation is cooperative through normal Temporal signaling and activity completion. No process-level force-kill logic is added.

**Behavior:**
- The poller compares tracked open PRs against the current GitHub open PR set.
- If a tracked PR disappears from the open set, the poller fetches its current GitHub state.
- If GitHub reports `closed` or `merged`, the poller signals the workflow with the terminal lifecycle state.
- The workflow stops launching any new agent work once that signal has been observed.
- After any currently running activity returns, the workflow records terminal state in Convex, writes a final run/status entry, deletes the workspace clone, and exits.

**Data model changes:**
- Add explicit `lifecycleState` to the tracked PR record with values `open`, `closed`, or `merged`.
- Keep run history, reviewer history, workflow errors, and events unchanged.
- Keep terminal PRs visible in the UI for now.

**Operational notes:**
- Manual re-evaluate requests should be rejected for terminal PRs.
- If a PR is reopened later, the poller can treat it as open again by upserting `lifecycleState: open`.
- Workspace deletion is part of terminal cleanup, so the workflow does not conclude until cleanup completes.
