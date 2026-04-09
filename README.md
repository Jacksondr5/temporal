# PR Review Orchestrator

This repo is the foundation for an AI-driven pull request review system built on Temporal. A local poller detects GitHub pull request activity, signals one long-running workflow per PR, and the workflow coordinates follow-up actions such as failing-check remediation, Code Rabbit review handling, specialized reviewer passes, and Linear deferrals.

Temporal remains private on the home network. Convex is the control-plane store for repo policy, dedupe state, decisions, reasoning summaries, and artifact references.

## Repo Structure

This is a pnpm monorepo with two apps and a shared packages directory.

```
/
  apps/
    orchestrator/        Temporal worker, poller, and AI agent runtime
    web/                 Next.js operator dashboard
  convex/                Convex backend (schema, queries, mutations)
  packages/
    domain/              Shared TypeScript types (extract when needed)
  docs/
    plans/               Design documents and implementation plans
```

### `apps/orchestrator`

The Temporal worker and local GitHub poller logic. The worker runs continuously on the home network; the poller can be run manually or via a Temporal Schedule.

### `apps/web`

Next.js 16 operator UI with Tailwind CSS and shadcn/ui. Provides real-time visibility into PR workflows, review thread decisions, artifacts, errors, and repo policy management.

### `convex/`

Shared Convex backend at the repo root. Both apps connect to the same Convex deployment. Contains the schema and all query/mutation functions.

### `packages/domain`

Placeholder for shared TypeScript contracts. Types should only be extracted here when actual duplication pressure appears between apps.

## Runtime Defaults

- Temporal address: `temporal.j5:7233`
- Temporal namespace: `pr-review`
- Main task queue: `pr-review-orchestrator`

## Local Development

1. Install dependencies.

```bash
pnpm install
```

2. Copy the env template and fill in secrets.

```bash
cp .env.example .env.local
```

3. Start Convex dev server.

```bash
pnpm convex:dev
```

4. Start the operator UI.

```bash
pnpm web:dev
```

The UI will be available at `http://localhost:3000`.

5. Start the Temporal worker.

```bash
pnpm worker
```

6. Run a one-off GitHub poller pass if you want to test polling manually.

```bash
pnpm poller
```

7. Or, create/update the recurring Temporal Schedule that runs the poller every minute.

```bash
pnpm ensure-poller-schedule
```

8. Optionally run the smoke test.

```bash
pnpm smoke
```

## Environment

The orchestrator loads `.env` first and then `.env.local`, with `.env.local` taking precedence, and validates the resulting values through `t3-env`. Real secrets should stay in `.env.local` or the deployment environment and should not be committed.

The web app uses `NEXT_PUBLIC_CONVEX_URL` from `apps/web/.env.local`.

Primary settings:

- `TEMPORAL_ADDRESS`
- `TEMPORAL_NAMESPACE`
- `TEMPORAL_TASK_QUEUE`
- `GITHUB_TOKEN`
- `CONVEX_URL`
- `CONVEX_DEPLOY_KEY`
- `LINEAR_API_KEY`
- `NEXT_PUBLIC_CONVEX_URL` (for the web app)

## Docker Worker Image

The repo includes a worker-only Docker image. The container builds the compiled `apps/orchestrator` runtime and starts the Temporal worker by default.

### Build And Push To Docker Hub

1. Log in to Docker Hub.

```bash
docker login
```

2. Build and push the worker image.

```bash
scripts/build-and-push.sh your-dockerhub-user/pr-review-orchestrator
```

You can also pass a full image reference with the version tag included:

```bash
scripts/build-and-push.sh your-dockerhub-user/pr-review-orchestrator:0.0.2
```

The script uses `docker buildx` and publishes a multi-platform image for:

- `linux/amd64`
- `linux/arm64`

It pushes two tags:

- `latest`
- `sha-<git-sha>` by default, or a custom tag if you pass one either in the first argument or as the second argument

You can optionally override the platform list:

```bash
PLATFORMS=linux/amd64 scripts/build-and-push.sh your-dockerhub-user/pr-review-orchestrator
```

### Pull And Run Later

Pull the image:

```bash
docker pull your-dockerhub-user/pr-review-orchestrator:latest
```

Run the worker with environment variables from a local file:

```bash
docker run --rm \
  --name pr-review-worker \
  --env-file /absolute/path/to/orchestrator.env \
  your-dockerhub-user/pr-review-orchestrator:latest
```

At minimum, the worker needs the runtime settings already used by `apps/orchestrator/src/config.ts`, especially:

- `TEMPORAL_ADDRESS`
- `TEMPORAL_NAMESPACE`
- `TEMPORAL_TASK_QUEUE`
- `GITHUB_TOKEN`
- `CONVEX_URL`
- `CONVEX_DEPLOY_KEY`

If you want the worker to clone PR workspaces or load reviewer packs from the host, mount those directories and point the runtime at the in-container paths:

```bash
docker run --rm \
  --name pr-review-worker \
  --env-file /absolute/path/to/orchestrator.env \
  -e WORKSPACE_ROOT=/var/orchestrator/workspaces \
  -e REVIEWER_PACKS_REPO_PATH=/opt/reviewer-packs \
  -v /absolute/path/to/workspaces:/var/orchestrator/workspaces \
  -v /absolute/path/to/reviewer-packs:/opt/reviewer-packs \
  your-dockerhub-user/pr-review-orchestrator:latest
```

Notes:

- The container runs the Temporal worker only. The GitHub poller is still a separate process.
- The image includes `git` and `gh` because worker activities rely on them.
- `TEMPORAL_ADDRESS` must be reachable from inside the container. If `temporal.j5` only resolves on your home network, run the container on that network or use a reachable address.
- Secrets stay in the runtime environment or env file and are not baked into the image.

## Source Layout

### Orchestrator (`apps/orchestrator/src/`)

- `config.ts` - Runtime config loading and defaults
- `domain/` - Shared types for GitHub, workflow, policy, and review concepts
- `workflows/` - PR workflow implementations
- `activities/` - Activity implementations and exported activity surface
- `poller/` - Local polling entrypoints
- `ensurePollerSchedule.ts` - Creates or updates the recurring Temporal Schedule for polling
- `integrations/` - External service integration boundaries
- `testing/` - Test scaffolding and future simulation helpers

### Web UI (`apps/web/`)

- `app/page.tsx` - PR list (home page)
- `app/pr/[repoSlug]/[prNumber]/page.tsx` - PR detail with tabs
- `app/policies/page.tsx` - Repo policy list
- `app/policies/[repoSlug]/page.tsx` - Policy editor
- `components/` - Shared UI components

### Convex (`convex/`)

- `schema.ts` - Database schema (11 tables)
- `ui.ts` - UI-optimized read-model queries
- `repos.ts`, `repoPolicies.ts`, etc. - Per-table query and mutation functions

## TODO

- [ ] Authentication for the operator UI (currently open, suitable for private network only)
- [ ] Policy editing admin workflows
- [ ] Rich operator UI for error recovery and manual re-drives

## Deployment Shape

For deployed operation, the preferred model is:

- run `pnpm worker` continuously
- run `pnpm ensure-poller-schedule` once at startup/deploy time
- let Temporal Schedules trigger the one-shot poller workflow every minute

The standalone `pnpm poller` command remains useful for manual local testing and debugging.

## Design Documents

- [Architecture Design](docs/plans/2026-04-03-ai-code-review-design.md)
- [Implementation Plan](docs/plans/2026-04-03-ai-code-review-implementation-plan.md)
- [Operator UI Repo Structure](docs/plans/2026-04-04-operator-ui-repo-structure-design.md)
