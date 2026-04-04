# AI-Driven PR Review Orchestration Implementation Plan

**Goal:** Build a Temporal-based automation system that polls GitHub, orchestrates one workflow per PR, and autonomously handles failing checks, Code Rabbit findings, specialized review passes, and Linear deferrals for allowlisted repos and PRs authored by Jackson.

**Architecture:** A local poller discovers relevant GitHub changes and persists normalized metadata to Convex, then `signalWithStart`s a single long-running Temporal workflow per PR. The workflow serializes all code-changing actions, fetches fresh GitHub state before each phase, and records decisions, reasoning summaries, and artifacts back into Convex.

**Tech Stack:** TypeScript, Temporal TypeScript SDK, Convex, GitHub API, Linear API, local polling process, AI-agent execution layer

---

## Implementation Principles

- Keep one durable Temporal workflow per PR.
- Treat GitHub's current PR state as the source of truth.
- Keep signal handlers small and side-effect-free.
- Allow only one code-changing action at a time per PR.
- Store reasoning as text summaries, not raw code excerpts by default.
- Build around repo policy stored in Convex rather than hardcoded rules.

## Required Infrastructure And External Dependencies

Set up these pieces before implementation is expected to work end to end.

### Required

- Temporal server reachable from the runtime environment
  - server: `temporal.j5`
  - namespace: `pr-review`
  - task queues:
    - `pr-review-orchestrator` for the main workflow worker
    - `pr-review-poller` reserved if polling work is ever moved behind Temporal
    - `pr-review-maintenance` reserved for future background maintenance or backfill tasks
- Convex project and deployment
  - deployment URL
  - deploy token / admin access for schema and function rollout
- GitHub credentials with read/write repo access
  - enough scope to read PRs, reviews, review comments, checks, and push commits back to branches
  - enough scope to post PR replies
- Linear API credentials
  - token plus any team/project defaults needed for deferred issue creation
- AI provider credentials
  - initial preference is OpenClaw
  - implementation owner should explicitly brainstorm OpenClaw integration details with Jackson before locking the provider/runtime contract
- A long-running runtime host on the home network
  - somewhere to keep the poller and Temporal worker running continuously
  - likely Docker-capable if containers are the deployment target
- Secrets/config management for the runtime
  - environment variables, mounted secret files, or another local secret source

### Likely Required In Practice

- A git execution environment for agent-driven code changes
  - local checkout strategy or ephemeral workspace strategy
  - authenticated push back to the PR branch
- Container registry for publish/deploy flow
  - `ghcr.io`, Docker Hub, or another registry
- Runtime supervisor
  - Docker Compose, systemd, Nomad, or another mechanism that restarts the service if it exits

### Optional But Strongly Recommended

- Centralized logs for the poller and worker
- Basic health checks for the long-running process
- A small operator runbook describing secret rotation and failed-run recovery

## Suggested Delivery Order

Deliver the system in eleven medium-level tasks. Each task is intended to be self-contained enough for a capable AI agent to execute with minimal supervision.

### Task 1: Replace the Starter Template With Project Scaffolding

**Objective**

Turn the Temporal hello-world starter into a repo organized around poller, workflow, activities, integrations, and shared domain types.

**Files**

- Modify: `package.json`
- Modify: `README.md`
- Modify: `src/workflows.ts`
- Modify: `src/worker.ts`
- Modify: `src/activities.ts`
- Create: `src/config.ts`
- Create: `src/domain/`
- Create: `src/integrations/`
- Create: `src/poller/`
- Create: `src/testing/`

**Deliverables**

- Remove hello-world naming and task queue assumptions.
- Introduce a coherent directory layout for workflow code, polling code, integrations, and shared types.
- Add environment/config loading for GitHub, Convex, Linear, Temporal, and AI-provider settings.
- Default Temporal configuration to server `temporal.j5`, namespace `pr-review`, and task queue `pr-review-orchestrator`.
- Update the README so the repo explains the actual system being built.

**Validation**

- Project installs and typechecks.
- Worker still boots with the new task queue and workflow registration.
- README explains how the system is supposed to run locally.

### Task 2: Define Shared Domain Types And Workflow Contracts

**Objective**

Create the shared types and workflow interfaces that all later tasks depend on.

**Files**

- Create: `src/domain/github.ts`
- Create: `src/domain/policy.ts`
- Create: `src/domain/review.ts`
- Create: `src/domain/workflow.ts`
- Modify: `src/workflows.ts`

**Deliverables**

- Define PR references, event payloads, dirty reasons, phase enums, check classifications, review decision types, reviewer definitions, and artifact references.
- Define the stable workflow ID format and signal payload shape.
- Define the workflow's internal reconciliation inputs and outputs at the type level.

**Validation**

- Shared type layer compiles cleanly.
- No workflow or poller code uses anonymous ad hoc objects for core domain concepts.

### Task 3: Add Convex Schema And Persistence Layer

**Objective**

Create the Convex-backed control plane for policies, cursors, dedupe records, PR summaries, decisions, artifacts, and workflow errors.

**Files**

- Create: `convex/schema.ts`
- Create: `convex/repos.ts`
- Create: `convex/repoPolicies.ts`
- Create: `convex/pollState.ts`
- Create: `convex/githubEvents.ts`
- Create: `convex/pullRequests.ts`
- Create: `convex/prRuns.ts`
- Create: `convex/reviewThreads.ts`
- Create: `convex/threadDecisions.ts`
- Create: `convex/reviewerRuns.ts`
- Create: `convex/artifacts.ts`
- Create: `convex/workflowErrors.ts`
- Create: `src/integrations/convex.ts`

**Deliverables**

- Define a first-pass schema for the approved control-plane records.
- Add a thin local client wrapper used by the poller and Activities.
- Encode stable lookup keys for repo policies, PRs, deduped GitHub events, and deferred-thread tickets.

**Validation**

- Convex schema deploys locally or in the target environment.
- Basic create/read/update flows work for the main collections.
- Dedupe keys and cursor updates are explicit and testable.

### Task 4: Build The GitHub Poller And Ingestion Loop

**Objective**

Implement a local poller that scans the allowlisted repos, identifies relevant PR activity, persists normalized event metadata, and signals the matching PR workflow.

**Files**

- Create: `src/poller/index.ts`
- Create: `src/poller/runPoller.ts`
- Create: `src/poller/discoverRepos.ts`
- Create: `src/poller/discoverPullRequests.ts`
- Create: `src/poller/discoverEvents.ts`
- Create: `src/poller/normalizeEvent.ts`
- Create: `src/integrations/github.ts`
- Create: `src/client.ts`

**Deliverables**

- Poll only allowlisted repos.
- Restrict processing to open PRs authored by Jackson.
- Detect relevant changes:
  - PR head SHA changes
  - review summaries
  - review comments / threads
  - check failures on the latest SHA
- Persist normalized event metadata to Convex before signaling Temporal.
- Use `signalWithStart` against the stable per-PR workflow ID.

**Validation**

- Polling a repo with no changes produces no duplicate records or signals.
- Re-running the same poll cycle does not re-ingest the same event.
- A changed PR results in exactly one workflow target being signaled.

### Task 5: Implement The Per-PR Temporal Workflow Skeleton

**Objective**

Build the single long-running workflow that absorbs signals, tracks dirty state, and runs a serialized reconciliation loop.

**Files**

- Modify: `src/workflows.ts`
- Create: `src/workflows/prReviewWorkflow.ts`
- Create: `src/workflows/signals.ts`
- Create: `src/workflows/reconcile.ts`

**Deliverables**

- Replace the example workflow with a PR workflow keyed by stable workflow ID.
- Add signal handlers that record dedupe IDs, update dirty reasons, and track the latest known head SHA.
- Implement the phase machine:
  - `idle`
  - `refreshing`
  - `fixing_checks`
  - `handling_code_rabbit`
  - `running_special_reviewers`
  - `recording_results`
- Ensure new signals during in-flight work only mark the workflow dirty for a future pass.

**Validation**

- Repeated signals for one PR do not create concurrent workflow instances.
- The workflow can stay alive while idle and react to later signals.
- The workflow processes one code-changing action at a time.

### Task 6: Add GitHub Snapshot And Decision Activities

**Objective**

Implement the Activities that fetch current PR state from GitHub and reduce it into the next workflow action.

**Files**

- Modify: `src/activities.ts`
- Create: `src/activities/fetchPullRequestSnapshot.ts`
- Create: `src/activities/classifyChecks.ts`
- Create: `src/activities/selectCodeRabbitThreads.ts`
- Create: `src/activities/selectSpecializedReviewers.ts`
- Create: `src/activities/recordWorkflowState.ts`

**Deliverables**

- Fetch a current PR snapshot including:
  - latest head SHA
  - changed files
  - checks on the latest SHA
  - Code Rabbit review summaries
  - unresolved actionable review threads
- Evaluate repo policy against the snapshot.
- Produce a structured next-action decision for the workflow instead of embedding that logic in signal handlers.

**Validation**

- Given the same GitHub snapshot and policy, decision output is deterministic.
- The workflow never makes decisions directly from stale raw event payloads.
- Edge cases like no unresolved threads or no matching reviewers are covered.

### Task 7: Implement Code-Changing Agent Execution And Artifact Recording

**Objective**

Build the execution path for agent-driven code changes and record the resulting external artifacts in Convex.

**Files**

- Create: `src/activities/runCheckFixAgent.ts`
- Create: `src/activities/runCodeRabbitAgent.ts`
- Create: `src/activities/runSpecializedReviewer.ts`
- Create: `src/integrations/agentRuntime.ts`
- Create: `src/integrations/git.ts`
- Create: `src/integrations/artifacts.ts`

**Deliverables**

- Standardize how the system launches an agent task against the repo.
- Record action start context, reasoning summary, outcome, and artifact references.
- Support direct PR-branch updates with commit SHA capture.
- Preserve the invariant that only the parent workflow chooses when an agent is launched.

**Validation**

- A successful code-changing action produces a recorded commit artifact.
- Failed actions distinguish between “no side effects observed” and “must reconcile from external state”.
- Artifact records are linked back to the PR and action phase.

### Task 8: Implement Code Rabbit Decision Outcomes And Linear Deferrals

**Objective**

Support the three approved decision paths for actionable Code Rabbit items: fix, false positive, and defer.

**Files**

- Create: `src/activities/respondToReviewThread.ts`
- Create: `src/activities/createLinearIssue.ts`
- Create: `src/integrations/linear.ts`
- Modify: `src/activities/runCodeRabbitAgent.ts`
- Modify: `src/activities/recordWorkflowState.ts`

**Deliverables**

- Turn Code Rabbit thread evaluation into durable decision records.
- Post concise GitHub replies for false positives and deferred items.
- Create one Linear ticket per stable deferred thread key.
- Record reply IDs, Linear issue IDs, and decision summaries in Convex.

**Validation**

- Re-processing a previously deferred thread does not create duplicate Linear issues.
- False-positive replies are idempotent or safely deduplicated.
- Thread decisions are queryable independently from workflow execution logs.

### Task 9: Add Specialized Reviewer Registry And Repo Policy Controls

**Objective**

Implement policy-driven specialized reviewers selected by changed-file rules and sequenced after Code Rabbit handling.

**Files**

- Modify: `convex/repoPolicies.ts`
- Create: `src/activities/loadRepoPolicy.ts`
- Create: `src/activities/resolveReviewerMatches.ts`
- Modify: `src/activities/selectSpecializedReviewers.ts`
- Modify: `src/activities/runSpecializedReviewer.ts`

**Deliverables**

- Support a registry of reviewer definitions in Convex.
- Match reviewers based on changed-file patterns.
- Encode run policies such as once per head SHA or once per PR.
- Ensure specialized reviewers always run after Code Rabbit handling and one at a time.

**Validation**

- File-pattern matching is deterministic and testable.
- Reviewers are not re-run unnecessarily for unchanged SHAs.
- The workflow honors repo-specific policy rather than global hardcoded reviewer logic.

### Task 10: Add Simulation, Failure-Path Testing, And Operator Documentation

**Objective**

Prove the orchestration behavior under the race conditions and retry cases the design is built around, and document how to operate the system.

**Files**

- Create: `src/testing/fixtures/`
- Create: `src/testing/scenarios/`
- Create: `src/testing/fakeGithub.ts`
- Create: `src/testing/fakeConvex.ts`
- Create: `src/testing/fakeLinear.ts`
- Create: `src/testing/workflowScenarios.test.ts`
- Modify: `README.md`
- Create: `docs/plans/` follow-up notes if needed

**Deliverables**

- Cover scenarios such as:
  - duplicate poll hits
  - a new commit arriving during in-flight work
  - repeated Code Rabbit comments
  - partial external side effects
  - retry after GitHub or Convex failures
- Document local setup, required secrets, poller cadence, and operational expectations.
- Add an operator-oriented explanation of where to inspect workflow progress and failures.

**Validation**

- The core race and retry scenarios are reproducible in tests or deterministic simulations.
- Documentation is sufficient for a fresh engineer to run the system locally.
- Known v1 limitations are written down explicitly.

### Task 11: Containerize The Runtime And Add Build/Publish Automation

**Objective**

Package the long-running application processes for repeatable deployment and add a simple build-and-push flow for updating the runtime on the home network.

**Files**

- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker-compose.yml` or `compose.yaml`
- Create: `scripts/build-and-push.sh`
- Modify: `README.md`

**Deliverables**

- Containerize the application runtime that needs to stay up continuously.
- Decide whether the poller and Temporal worker run in one container or separate services in one compose stack.
- Add a simple build-and-push script that tags and publishes the image to the chosen registry.
- Document the required runtime env vars, mounted secrets, and container startup commands.
- Keep GitHub, Linear, Convex, Temporal, and AI-provider credentials in the runtime environment of the deployed container or host, not in Convex or source control.
- Document how the deployed container connects to the local Temporal server.

**Validation**

- The image builds reproducibly on the target machine.
- The runtime can be started with containerized configuration and can reach Temporal, GitHub, Convex, Linear, and the AI provider.
- The build-and-push script produces an image that can be pulled and started on the home-network host.

## Recommended Agent Handoff Strategy

Use one agent per task, but keep ownership boundaries clean:

- Foundation/scaffolding tasks first
- Persistence and poller work before workflow logic
- Workflow skeleton before agent execution
- Decision-outcome work before specialized reviewer expansion
- Simulation and docs only after the main vertical slice exists

Tasks that can likely run in parallel after the foundation is stable:

- Convex schema work and GitHub integration groundwork
- Workflow skeleton and shared domain types
- Linear integration and artifact-recording groundwork

Tasks that should stay serialized:

- Any work that defines the workflow contract
- Any work that modifies the agent execution path
- Any work that changes idempotency keys or artifact correlation rules

## Suggested Milestone Checks

Stop after these checkpoints and review behavior before proceeding:

1. Poller can discover one changed PR and signal one workflow.
2. Workflow can absorb repeated signals and perform a no-op reconciliation.
3. Workflow can classify a PR into the correct next action.
4. One end-to-end Code Rabbit decision path works with recorded artifacts.
5. Specialized reviewers run in the correct order without conflicting branch writes.
6. Failure and race simulations match the approved design.

## Out Of Scope Until The Core Flow Works

- Public webhook relays
- Multi-repo scaling optimizations
- Concurrent reviewer execution
- Rich operator UI
- Raw code excerpt archival in Convex
