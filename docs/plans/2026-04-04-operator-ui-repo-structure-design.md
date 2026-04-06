# Operator UI Repo Structure Design

## Status

Approved direction based on follow-up discussion on April 4, 2026.

## Goal

Add an operator UI for the PR review system without splitting the product across multiple repositories or weakening the existing Convex and Temporal boundaries.

The UI should make it easy to inspect:

- PR workflow state
- Code Rabbit decisions
- artifacts such as commits, GitHub replies, and Linear issues
- blocked/error states
- policy and reviewer configuration later

## Recommendation

Use a `pnpm` monorepo with:

- `Next.js` as the operator UI
- the current Temporal worker/poller code moved into its own app
- `Convex` kept at the repository root

This gives the UI direct access to the same Convex backend while keeping the long-running orchestrator runtime separate from the web app runtime.

## Proposed Repo Layout

```text
/
  apps/
    orchestrator/
      src/
      package.json
    web/
      app/
      components/
      package.json
  convex/
    schema.ts
    ...
  packages/
    domain/
      src/
      package.json
  docs/
    plans/
  package.json
  pnpm-workspace.yaml
```

## Responsibilities

### `apps/orchestrator`

Owns:

- Temporal worker
- local poller
- GitHub integration
- Linear integration
- AI runtime integration
- workspace preparation and agent execution

This app should remain a server-only operational process and should not be coupled to the Next.js runtime.

### `apps/web`

Owns:

- operator-facing UI
- PR list and PR detail screens
- workflow status views
- decision and artifact inspection
- error and blocked-state visibility
- lightweight admin surfaces later

This app should primarily read from Convex and expose operator workflows, not orchestrate PR handling directly.

### `convex/`

Owns:

- operational source of truth used by both apps
- query and mutation APIs for workflow summaries, decisions, artifacts, and policies
- UI-facing read models as they become necessary

Convex should remain at the root because its tooling and generated code are simpler to manage there than inside a nested workspace app.

### `packages/domain`

Owns:

- shared TypeScript contracts that are safe to reuse across apps
- normalized domain types for PR summaries, decisions, workflow state, and artifacts

This package should stay small and should not become a dumping ground for implementation logic.

## Why This Structure

### Benefits

- Keeps one repository for the whole product.
- Lets the UI and orchestrator share the same Convex backend cleanly.
- Separates web runtime concerns from worker/poller runtime concerns.
- Makes future deployment cleaner because the UI and orchestrator can be built and shipped independently.
- Creates a clear place for shared types without forcing the entire codebase into one app.

### Why Not Put Next.js At The Root

That would blur the boundary between:

- long-running infrastructure processes
- build-time and request-time web code
- Convex backend code

It would work initially, but it would become messy once the operator UI, orchestrator runtime, and shared code all grow.

### Why Not Split Into Separate Repos

That would add friction too early:

- duplicated config and tooling
- harder shared-type management
- more moving pieces during local development

For this project, one repo with multiple apps is the better trade-off.

## Migration Strategy

Recommended order:

1. Convert the repo into a `pnpm` workspace.
2. Move the current Temporal app into `apps/orchestrator`.
3. Keep `convex/` at the root.
4. Add `apps/web` as a new Next.js app.
5. Extract shared domain contracts into `packages/domain` only where duplication is actually appearing.

This keeps the transition incremental and avoids forcing a large refactor before the UI exists.

## Initial UI Scope

The first version of the Next.js app should focus on read-only operational visibility:

- list PRs
- inspect a PR’s workflow phase and status
- inspect Code Rabbit thread decisions
- inspect commits, GitHub replies, and Linear issue links
- inspect blocked reasons and recent workflow errors

Policy editing and more advanced admin workflows can come later.

## Non-Goals

- Do not move Convex into `apps/web`.
- Do not embed the orchestrator into the Next.js app.
- Do not make the UI responsible for running Temporal workflows.
- Do not over-extract shared packages before there is clear duplication pressure.

## Next Step

When we choose to build the UI, the next design should focus on:

- the exact workspace migration plan
- the initial Convex read models needed by the UI
- the first operator screens and navigation structure
