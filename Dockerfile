# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/orchestrator/package.json apps/orchestrator/package.json
COPY packages/domain/package.json packages/domain/package.json

RUN pnpm install --frozen-lockfile

COPY apps/orchestrator ./apps/orchestrator
COPY packages ./packages

RUN pnpm --filter orchestrator build

FROM base AS prod-deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/orchestrator/package.json apps/orchestrator/package.json
COPY packages/domain/package.json packages/domain/package.json

RUN pnpm install --frozen-lockfile --prod --filter orchestrator...

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends git gh \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./
COPY apps/orchestrator/package.json ./apps/orchestrator/package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/orchestrator/node_modules ./apps/orchestrator/node_modules
COPY --from=build /app/apps/orchestrator/lib ./apps/orchestrator/lib

RUN groupadd --system appgroup \
  && useradd --system --gid appgroup --create-home --home-dir /home/appuser appuser \
  && chown -R appuser:appgroup /app

USER appuser

CMD ["node", "apps/orchestrator/lib/worker.js"]
