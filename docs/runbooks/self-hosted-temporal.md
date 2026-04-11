# Self-Hosted Temporal Runbook

This runbook covers how to connect to the self-hosted Temporal deployment, inspect the Docker containers, and interrogate workflows and task queues safely.

## Access

- SSH host: `jacksondr5@10.0.10.80`
- Hostname: `openclaw`
- Temporal frontend address: `temporal.j5:7233`
- Temporal namespace: `pr-review`
- Main worker task queue: `pr-review-orchestrator`

Connect to the server with:

```bash
ssh jacksondr5@10.0.10.80
```

## Deployment Layout

The Temporal stack is managed with Docker Compose on the host.

- Compose file: `/etc/homelab/workflows/temporal/compose.yaml`
- Temporal env file: `/etc/homelab/workflows/temporal/temporal.env`
- Orchestrator env file: `/etc/homelab/workflows/pr-review-orchestrator/orchestrator.env`

Typical containers:

- `temporal-temporal-1`
- `temporal-temporal-postgres-1`
- `temporal-temporal-ui-1`
- `temporal-pr-review-orchestrator-1`
- `temporal-traefik-1`

## Safe Docker Checks

List the running containers:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

Show the compose projects:

```bash
docker compose ls
```

Inspect the orchestrator logs:

```bash
docker logs --tail=200 temporal-pr-review-orchestrator-1
```

Follow the orchestrator logs live:

```bash
docker logs -f temporal-pr-review-orchestrator-1
```

Inspect container state:

```bash
docker inspect temporal-pr-review-orchestrator-1 \
  --format '{{.State.Status}} {{.State.ExitCode}} {{.State.Error}}'
```

Inspect bind mounts and whether they are writable:

```bash
docker inspect temporal-pr-review-orchestrator-1 \
  --format '{{range .Mounts}}{{println .Type .Source .Destination .RW}}{{end}}'
```

If you need to verify a writable Codex mount from inside the container:

```bash
docker exec temporal-pr-review-orchestrator-1 \
  sh -lc 'touch "$CODEX_HOME_DIR/.codex/.write-test" && rm "$CODEX_HOME_DIR/.codex/.write-test"'
```

## Temporal CLI Checks

These commands can be run from a local machine that has the `temporal` CLI installed and network access to `temporal.j5:7233`.

List recent workflows:

```bash
temporal workflow list \
  --address temporal.j5:7233 \
  --namespace pr-review \
  --limit 50
```

Describe a workflow:

```bash
temporal workflow describe \
  --address temporal.j5:7233 \
  --namespace pr-review \
  --workflow-id 'pr:Jacksondr5/temporal:4'
```

Dump workflow history as JSON:

```bash
temporal workflow show \
  --address temporal.j5:7233 \
  --namespace pr-review \
  --workflow-id 'pr:Jacksondr5/temporal:4' \
  --output json
```

Inspect the worker task queue and pollers:

```bash
temporal task-queue describe \
  --address temporal.j5:7233 \
  --namespace pr-review \
  --task-queue pr-review-orchestrator
```

The task queue output is the fastest way to confirm whether the worker is actually polling. If no pollers are shown, the worker container is down, misconfigured, or pointed at the wrong task queue or namespace.

## Workflow ID Notes

Workflow IDs use this shape:

```text
pr:Owner/repo:number
```

Example:

```text
pr:Jacksondr5/temporal:4
```

Use the exact casing stored in Temporal. If the workflow lookup fails, verify the owner and repo casing with `temporal workflow list` first.

## Compose Warning

When recreating services from `/etc/homelab/workflows/temporal`, always provide the Temporal env file explicitly:

```bash
docker compose \
  --env-file /etc/homelab/workflows/temporal/temporal.env \
  up -d --force-recreate temporal
```

Do not rely on Compose to discover the right env file implicitly. We already hit a case where recreating services without `--env-file` caused `POSTGRES_PASSWORD` interpolation to fall back to blank values, which broke Temporal/Postgres authentication.

If you need to recreate the whole stack, run the command from the compose directory and still include the explicit env file.

## Orchestrator-Specific Checks

The orchestrator service has its own env file outside the Temporal compose directory:

```text
/etc/homelab/workflows/pr-review-orchestrator/orchestrator.env
```

Useful checks:

- Verify the container is using the expected image tag.
- Check that `CODEX_HOME_DIR` matches the bind mount destination if Codex auth is mounted in.
- Check that GitHub and OpenAI-related runtime auth is being supplied through env vars or mounted config, not embedded in remote URLs or command lines.

To inspect selected environment values without dumping secrets, prefer targeted output:

```bash
docker exec temporal-pr-review-orchestrator-1 \
  sh -lc 'printf "HOME=%s\nCODEX_HOME_DIR=%s\n" "$HOME" "$CODEX_HOME_DIR"'
```

## Common Debug Pattern

When a workflow appears stuck or an activity is failing:

1. Use `temporal task-queue describe` to confirm whether the worker is polling.
2. Use `temporal workflow describe` or `temporal workflow show --output json` to identify the failing activity and error.
3. Check `docker logs --tail=200 temporal-pr-review-orchestrator-1`.
4. If the failure looks filesystem-related, inspect mounts with `docker inspect ... .Mounts`.
5. If the failure looks like config drift, inspect the relevant env file on the host and compare it against the running container configuration.

## Secret Handling

- Do not paste full tokens, PATs, or auth files into logs, docs, or workflow comments.
- Temporal activity failures may persist command arguments into workflow history.
- Avoid command lines that embed credentials into URLs.
- Prefer environment variables, mounted auth directories, or credential helpers.
