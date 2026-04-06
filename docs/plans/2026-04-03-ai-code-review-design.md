# AI-Driven PR Review Orchestration Design

## Status

Approved design draft based on collaborative review on April 3, 2026.

## Goal

Build a Temporal-based system that autonomously handles AI code review work on GitHub pull requests authored by Jackson. The system should react to PR review activity, fix issues when appropriate, explain false positives, and defer some work into Linear, while keeping Temporal private on a home network.

## Scope For V1

- Poll GitHub locally instead of using public webhooks.
- Operate only on an explicit allowlist of repositories.
- Operate only on open pull requests authored by Jackson.
- Push fixes directly to the PR branch.
- Preserve detailed reasoning as text summaries.
- Use Convex as the external control-plane store.
- Use one long-running Temporal workflow per pull request.

## Non-Goals For V1

- No public ingress directly into Temporal.
- No self-hosted GitHub Actions runner for public repositories.
- No multi-agent concurrent code modification on the same PR branch.
- No full raw code excerpt archival in Convex by default.

## High-Level Architecture

The system has three main components.

### 1. Local Poller

The poller runs inside the home network and periodically checks GitHub for relevant changes across an allowlist of repositories.

Responsibilities:

- Discover open PRs authored by Jackson in allowlisted repos.
- Detect changes relevant to automation, such as:
  - Code Rabbit reviews and review comments
  - new commits on the PR
  - failed checks on the latest head SHA
- Persist normalized event metadata and poll cursors in Convex.
- Start or signal a Temporal workflow for the PR using a stable workflow ID.

The poller is a trigger source and ingestion layer. It is not the decision engine.

### 2. Per-PR Temporal Workflow

Each PR gets exactly one long-running workflow, keyed by a stable workflow ID such as `pr:owner/repo:123`.

Responsibilities:

- Absorb signals representing new PR activity.
- Coalesce bursts of low-level events into a single reconciliation cycle.
- Serialize all code-changing work so that only one agent modifies the branch at a time.
- Fetch current GitHub state before taking action.
- Run work in the approved order:
  1. Fix allowlisted failing checks on the latest SHA
  2. Process unresolved Code Rabbit items
  3. Run matching specialized reviewers
  4. Reconcile again and return to idle if clean

The workflow treats GitHub's current PR state as the source of truth. Incoming events are used as wake-up signals and audit records, not as the authoritative unit of work.

### 3. Convex Control Plane

Convex stores the external durable records that should not live only in Temporal history.

Responsibilities:

- Repo allowlist and policy configuration
- Poll cursors and dedupe state
- Per-PR summaries and workflow references
- Code Rabbit thread state and decisions
- Specialized reviewer execution records
- Text reasoning summaries
- Artifact references such as commit SHAs, GitHub comment IDs, and Linear issue IDs
- Blocking error records and operator-facing audit data

Convex does not own orchestration. Temporal remains the workflow engine.

## Eventing And Concurrency Model

### Signals

The poller uses `signalWithStart` to interact with the PR workflow.

Effects:

- If the PR workflow is not running, Temporal starts it and delivers the signal.
- If the PR workflow is already running, Temporal delivers the signal to the existing workflow instance.
- There is never more than one active workflow for a given PR workflow ID.

### Signal Handling Rule

Signal handlers remain small and side-effect-free. They do not launch code-changing work directly.

Signal handlers should:

- record signal/event IDs for dedupe
- mark the workflow as dirty
- update compact workflow memory such as latest known head SHA and dirty reasons

### Coalescing

Coalescing means collapsing a burst of low-level changes into a single fresh reconciliation pass.

Examples:

- one review event plus many review-comment events
- multiple check updates
- a new commit arriving while another action is already in flight

The workflow does not run one agent pass per event. Instead, it notes that the PR changed and later re-fetches current state from GitHub.

### In-Flight Work Rule

Once a code-changing action starts, it is allowed to finish even if new signals arrive during execution.

Rationale:

- external side effects may already have occurred
- interruption would make reconciliation and attribution harder

If new activity arrives mid-flight, the workflow only marks itself dirty and performs another reconciliation pass afterward.

## PR Workflow State Machine

Suggested internal state:

- `prRef`
  - repo owner/name
  - PR number
  - branch name
  - latest known head SHA
- `dirty`
- `dirtyReasons`
  - `head_changed`
  - `reviews_changed`
  - `checks_changed`
- `processedEventIds`
- `phase`
  - `idle`
  - `refreshing`
  - `fixing_checks`
  - `handling_code_rabbit`
  - `running_special_reviewers`
  - `recording_results`
- `activeAction`
- `threadDecisions`
- `artifacts`

Loop behavior:

1. Wait until the workflow is dirty.
2. Fetch current PR snapshot from GitHub.
3. Compute the next action from the latest state.
4. Run exactly one code-changing action.
5. Record results and artifacts.
6. Re-fetch and reconcile if new signals arrived during the action.
7. Return to idle when nothing actionable remains.

## Decision Model

### Check Handling

Each repo policy classifies checks into categories.

- `fixable_blocking`
- `ignored_nonblocking`
- `informational`

Only `fixable_blocking` failures should gate later phases.

The workflow always evaluates checks against the latest head SHA.

### Code Rabbit Handling

Actionable unit:

- review thread or comment thread

Context:

- overall review summaries

For each unresolved Code Rabbit item, the agent chooses one outcome:

- `fix`
- `false_positive`
- `defer`

Each outcome must include a reasoning summary and any resulting artifact references.

Expected actions:

- `fix`
  - modify code
  - push directly to the PR branch
  - optionally leave a concise reply
- `false_positive`
  - reply with reasoning
  - record the explanation in Convex
- `defer`
  - create a Linear ticket
  - reply with rationale and ticket reference
  - record a stable deferred mapping to avoid duplicates

### Specialized Reviewers

Specialized reviewers are selected by changed-file match rules and always have permission to modify code.

Each reviewer definition should include:

- match rules
- reviewer purpose
- prompt or checklist
- run policy, such as once per head SHA or once per PR

### Specialized Reviewer Knowledge Packs

Specialized reviewers exist to load deeper, domain-specific knowledge only when it is needed.

Rationale:

- avoid bloating the context of general-purpose review/fix agents
- let a reviewer focus deeply on one system or framework
- support larger PRs by narrowing the active review domain

### Reviewer Pack Repository

Reviewer knowledge should live in a separate git repository that is managed independently of the orchestration codebase.

This pack repository is the source of truth for:

- reviewer registry entries
- reviewer README files
- supporting markdown/reference documents
- optional metadata describing handoff expectations or recommended tools

The orchestrator should sync or clone this repository once under the shared workspace root, not separately inside each PR clone.

Suggested layout:

- `WORKSPACE_ROOT/_reviewer-packs/...`
- `WORKSPACE_ROOT/<owner>/<repo>/pr-<number>/...`

This avoids duplicating the same knowledge into each PR workspace while still allowing reviewers to read structured markdown files at execution time.

### Registry Ownership

The reviewer-pack repository owns the reviewer registry.

This orchestration repo should not duplicate that registry in application config or Convex.

Repo policy should only specify:

- which reviewer IDs are enabled for a repo
- the execution order for those reviewer IDs

The order is the array order in repo policy.

### Context Loading Strategy

The primary knowledge-loading mechanism for specialized reviewers should be files in the reviewer-pack repository, not prompt stuffing and not global provider-specific skills.

Execution-time reviewer context should include:

- reviewer identity and purpose
- path to the reviewer pack
- the top-level README file to start from
- instructions to load additional markdown files from the pack as needed
- current PR snapshot and changed files
- information about where this reviewer appears in the overall workflow

This keeps the system more portable across provider implementations.

### MCP And CLI Tooling

MCP should be treated as a way to give reviewers extra capabilities, not as the primary mechanism for distributing reviewer knowledge.

CLI tools remain first-class and may be preferable in many cases because:

- they are often more feature-complete
- coding agents already use them effectively
- they fit well into local execution environments

The system should therefore allow reviewer packs to recommend:

- markdown knowledge files
- CLI tools
- optional MCP resources or tools

without making MCP mandatory.

### Scope Guardrails

Specialized reviewers should use soft scope guardrails, not hard tool/file restrictions.

Each reviewer should know:

- the domain it is primarily responsible for
- which changed files caused it to run
- which areas it should focus on first

Cross-cutting edits should still be allowed when required for correctness.

### Reviewer Coordination

Specialized reviewers should not communicate through shared agent sessions.

Instead, coordination happens through the workflow.

Each reviewer may emit structured handoff items describing:

- changes it made that later reviewers should account for
- follow-up considerations for downstream reviewers

Later reviewers should receive:

- a concise summary of prior reviewer runs
- any structured handoff items produced earlier in the sequence
- knowledge of which reviewers will still run after them

This gives reviewers awareness of their place in the process without coupling their execution.

### Specialized Reviewer Output Shape

Specialized reviewers should reuse the same top-level execution envelope as the existing agent runs:

- `overallSummary`
- `investigationSummary`
- `finalAssessment`
- `whyNoCommit`
- `commandsSummary`
- `commitSha`
- `usage`
- `providerMetadata`

They should then add reviewer-specific fields such as:

- `reviewerId`
- `matchedFiles`
- `findings`
- `handoffItems`

This keeps persistence and UI rendering uniform while still supporting reviewer-specific detail.

Execution order:

1. after allowlisted failing checks are handled
2. after Code Rabbit items are processed
3. one reviewer at a time

These reviewers are intended to apply deeper, domain-specific judgment after the first pass of Code Rabbit handling.

## Idempotency And Race Handling

There are two layers of idempotency.

### Poller + Convex

- dedupe discovered GitHub events
- advance cursors only after successful persistence
- keep normalized event metadata for audit and debugging

### Workflow

- dedupe absorbed signal IDs
- track per-thread decisions
- track artifacts from prior actions
- use stable correlation keys where possible

Examples of stable correlation:

- one Linear ticket per deferred thread key
- one recorded action per phase and head SHA
- one decision record per thread revision

Race rule:

- newer PR state supersedes older analysis
- newer PR state does not interrupt an already-started code-changing action

## Failure Handling

### Infrastructure Failures

Retry safely for:

- GitHub read failures
- GitHub write failures where retry is safe
- Convex persistence failures
- Linear API failures
- model/provider failures

If retries are exhausted, the workflow should:

- record the blocking failure in Convex
- remain recoverable for later signals or manual re-drive
- post a GitHub note only if the failure is relevant to humans reviewing the PR

### Agent Failures

Each action record should include:

- target head SHA at action start
- action type
- reasoning summary
- output artifacts, if any
- success/failure status

If an agent may already have created external side effects, the workflow should not guess. It should inspect GitHub and Linear, then reconcile from observed state.

## Observability

GitHub is the human-facing surface.
Convex is the operator and audit surface.
Temporal is the execution engine.

The system should make it easy to answer:

- why the workflow woke up
- what state it observed
- what decision it made for each thread
- what specialized reviewers ran and why
- what artifacts were produced
- what errors are currently blocking progress

Detailed reasoning should be preserved as text summaries rather than raw code excerpts.

## Suggested Convex Data Model

Collections or tables expected for v1:

- `repos`
- `repoPolicies`
- `pollState`
- `githubEvents`
- `pullRequests`
- `prRuns`
- `reviewThreads`
- `threadDecisions`
- `reviewerRuns`
- `artifacts`
- `workflowErrors`

### `repos`

- owner
- name
- enabled
- allowlisted

### `repoPolicies`

- fixable check patterns
- ignored check patterns
- specialized reviewer definitions
- decision policy knobs

### `pollState`

- per-repo cursors or watermarks by event type
- last successful poll timestamps

### `githubEvents`

- stable GitHub event identifiers
- normalized event type
- repo / PR references
- timestamps
- minimal metadata needed for audit and dedupe

### `pullRequests`

- repo / PR identifiers
- current known head SHA
- workflow ID
- summarized status

### `prRuns`

- reconciliation cycles
- started/ended timestamps
- phase summaries
- resulting status

### `reviewThreads`

- Code Rabbit thread identifiers
- current unresolved/resolved state
- latest summary metadata

### `threadDecisions`

- thread key
- disposition
- reasoning summary
- related artifact refs

### `reviewerRuns`

- reviewer identity
- matched files or reason for invocation
- target SHA
- resulting artifacts

### `artifacts`

- commit SHAs
- GitHub comment IDs
- Linear issue IDs
- correlation keys

### `workflowErrors`

- error type
- latest occurrence
- retry state
- blocked/unblocked status

## Security And Trust Boundaries

- Temporal remains private on the home network.
- The poller runs locally and communicates outbound to GitHub, Convex, and Linear.
- Convex stores reasoning summaries and metadata, not raw code excerpts by default.
- Public-repo untrusted code should not execute on infrastructure that has privileged access to the private orchestration system.

## AI Execution Design

Code Rabbit handling should be executed by a spawned AI agent rather than by narrow helper logic inside the Temporal worker.

### Provider Strategy

- Default provider: Codex via the Vercel AI SDK Codex CLI provider.
- Future provider override: specialized reviewers may choose a different provider later, such as Claude Code.
- The implementation owner should still explicitly brainstorm the OpenClaw integration with Jackson before using it elsewhere in the system.

### Workspace Strategy

- Use a managed disposable clone per active PR rather than git worktrees.
- The runtime prepares the clone before each agent run by refreshing from origin and resetting to the PR branch head.
- The workspace root should live under `WORKSPACE_ROOT`.
- Stale workspace cleanup can be handled later by a janitor process, but the runtime should already structure the directories so that safe deletion is trivial.

### Code Rabbit Batch Handling

- One agent run handles the full unresolved Code Rabbit batch for a PR reconciliation pass.
- The batch must be fully addressed, but mixed outcomes are allowed across threads.
- Allowed per-thread outcomes:
  - `fix`
  - `false_positive`
  - `defer`
- If code is changed, the agent should push exactly once at the end of the run.
- The agent should not comment on threads that were fixed in code.
- The agent should only post GitHub replies for:
  - `false_positive`
  - `defer`
- For deferred items, the agent should create one Linear ticket per deferred thread and include that ticket in the GitHub reply.

### Agent Trust Boundary

- The agent process receives GitHub and Linear credentials directly in its environment.
- The agent owns the external side effects for Code Rabbit handling:
  - code edits
  - git commit/push
  - GitHub replies
  - Linear ticket creation
- Temporal should treat the agent as a side-effecting external actor and reconcile from observed reality afterward instead of assuming retries are safe.

### Expected Agent Result

The agent should return a structured summary suitable for persistence in Convex:

- per-thread dispositions
- reasoning summary text
- optional commit SHA
- GitHub reply/comment IDs for false positives and deferrals
- Linear issue IDs for deferred threads
- overall success/failure and retryability hint

This preserves a durable audit trail while still allowing the agent to act autonomously.

## Initial Execution Slice

The first implementation slice should focus on the `handle_code_rabbit` action and leave specialized reviewers deferred until the main AI runtime path is proven.

- Wire the long-running PR workflow so a `handle_code_rabbit` reconciliation result invokes the agent runtime.
- Use Codex CLI through the Vercel AI SDK in process-per-call mode first.
- Prepare and refresh a PR clone before each Code Rabbit run.
- Persist per-thread decisions and artifact references into Convex after the run completes.
- Treat missing local AI runtime configuration as a blocked/skipped execution state rather than trying to fake completion.

## Recommended Next Step

The next phase should be a compact implementation plan covering:

1. poller and ingestion foundation
2. workflow skeleton and signal model
3. GitHub snapshot + decision Activities
4. Convex schema and audit records
5. agent execution and artifact recording
6. repo policy and specialized reviewer registry
7. end-to-end simulation and failure-path testing
