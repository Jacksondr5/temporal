import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientConnectConfig } from '@temporalio/envconfig';
import { createEnv } from '@t3-oss/env-core';
import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return process.cwd();
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(currentDir);

loadDotEnv({ path: resolve(repoRoot, '.env') });
loadDotEnv({ path: resolve(repoRoot, '.env.local'), override: true });

export interface TemporalRuntimeConfig {
  connectionOptions: ReturnType<typeof loadClientConnectConfig>['connectionOptions'];
  namespace: string;
  taskQueue: string;
}

export interface PollerRuntimeConfig {
  intervalSeconds: number;
  allowedRepos: string[];
  allowedAuthor: string | null;
}

export interface GitHubRuntimeConfig {
  token: string;
  apiUrl: string;
}

export interface ConvexRuntimeConfig {
  url: string;
  deployKey: string;
}

export interface LinearRuntimeConfig {
  apiKey: string;
  teamId: string;
  defaultProjectId: string;
}

export interface CodexRuntimeConfig {
  model: string;
  allowNpx: boolean;
}

export interface ClaudeCodeRuntimeConfig {
  model: string;
}

export interface AiRuntimeConfig {
  defaultProvider: 'codex';
  codex: CodexRuntimeConfig;
  claudeCode: ClaudeCodeRuntimeConfig;
}

export interface RuntimeConfig {
  temporal: TemporalRuntimeConfig;
  poller: PollerRuntimeConfig;
  github: GitHubRuntimeConfig;
  convex: ConvexRuntimeConfig;
  linear: LinearRuntimeConfig;
  ai: AiRuntimeConfig;
  logLevel: string;
  workspaceRoot: string;
  reviewerPacksRepoPath: string;
  reviewerPacksRepoUrl: string;
}

const DEFAULT_TEMPORAL_ADDRESS = 'temporal.j5:7233';
const DEFAULT_TEMPORAL_NAMESPACE = 'pr-review';
const DEFAULT_TEMPORAL_TASK_QUEUE = 'pr-review-orchestrator';
const DEFAULT_GITHUB_API_URL = 'https://api.github.com';
const DEFAULT_POLL_INTERVAL_SECONDS = 60;
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_CODEX_MODEL = 'gpt-5.3-codex';
const DEFAULT_CLAUDE_CODE_MODEL = 'sonnet';

function trimString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseCsv(value: unknown): string[] | undefined {
  const trimmed = trimString(value);
  if (trimmed === undefined) {
    return undefined;
  }

  return trimmed
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = trimString(value)?.toLowerCase();
  switch (normalized) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return undefined;
  }
}

function toNullableString(value: string | undefined): string | null {
  return value ?? null;
}

const env = createEnv({
  server: {
    TEMPORAL_ADDRESS: z.preprocess(
      trimString,
      z.string().default(DEFAULT_TEMPORAL_ADDRESS),
    ),
    TEMPORAL_NAMESPACE: z.preprocess(
      trimString,
      z.string().default(DEFAULT_TEMPORAL_NAMESPACE),
    ),
    TEMPORAL_TASK_QUEUE: z.preprocess(
      trimString,
      z.string().default(DEFAULT_TEMPORAL_TASK_QUEUE),
    ),
    POLL_INTERVAL_SECONDS: z.preprocess(
      parseInteger,
      z.number().int().positive().default(DEFAULT_POLL_INTERVAL_SECONDS),
    ),
    GITHUB_ALLOWED_REPOS: z.preprocess(parseCsv, z.array(z.string()).default([])),
    GITHUB_ALLOWED_AUTHOR: z.preprocess(trimString, z.string().optional()),
    GITHUB_TOKEN: z.preprocess(trimString, z.string()),
    GITHUB_API_URL: z.preprocess(
      trimString,
      z.string().url().default(DEFAULT_GITHUB_API_URL),
    ),
    CONVEX_URL: z.preprocess(trimString, z.string()),
    CONVEX_DEPLOY_KEY: z.preprocess(trimString, z.string()),
    LINEAR_API_KEY: z.preprocess(trimString, z.string()),
    LINEAR_TEAM_ID: z.preprocess(trimString, z.string()),
    LINEAR_DEFAULT_PROJECT_ID: z.preprocess(trimString, z.string()),
    AI_DEFAULT_PROVIDER: z.literal('codex').default('codex'),
    CODEX_MODEL: z.preprocess(trimString, z.string().default(DEFAULT_CODEX_MODEL)),
    CODEX_ALLOW_NPX: z.preprocess(parseBoolean, z.boolean().default(true)),
    CLAUDE_CODE_MODEL: z.preprocess(
      trimString,
      z.string().default(DEFAULT_CLAUDE_CODE_MODEL),
    ),
    LOG_LEVEL: z.preprocess(trimString, z.string().default(DEFAULT_LOG_LEVEL)),
    WORKSPACE_ROOT: z.preprocess(trimString, z.string()),
    REVIEWER_PACKS_REPO_PATH: z.preprocess(trimString, z.string()),
    REVIEWER_PACKS_REPO_URL: z.preprocess(trimString, z.string()),
  },
  runtimeEnv: process.env,
});

export function loadTemporalRuntimeConfig(): TemporalRuntimeConfig {
  process.env.TEMPORAL_ADDRESS = env.TEMPORAL_ADDRESS;
  process.env.TEMPORAL_NAMESPACE = env.TEMPORAL_NAMESPACE;

  const config = loadClientConnectConfig();

  return {
    connectionOptions: config.connectionOptions,
    namespace: config.namespace ?? env.TEMPORAL_NAMESPACE,
    taskQueue: env.TEMPORAL_TASK_QUEUE,
  };
}

export function loadRuntimeConfig(): RuntimeConfig {
  return {
    temporal: loadTemporalRuntimeConfig(),
    poller: {
      intervalSeconds: env.POLL_INTERVAL_SECONDS,
      allowedRepos: env.GITHUB_ALLOWED_REPOS,
      allowedAuthor: toNullableString(env.GITHUB_ALLOWED_AUTHOR),
    },
    github: {
      token: env.GITHUB_TOKEN,
      apiUrl: env.GITHUB_API_URL,
    },
    convex: {
      url: env.CONVEX_URL,
      deployKey: env.CONVEX_DEPLOY_KEY,
    },
    linear: {
      apiKey: env.LINEAR_API_KEY,
      teamId: env.LINEAR_TEAM_ID,
      defaultProjectId: env.LINEAR_DEFAULT_PROJECT_ID,
    },
    ai: {
      defaultProvider: env.AI_DEFAULT_PROVIDER,
      codex: {
        model: env.CODEX_MODEL,
        allowNpx: env.CODEX_ALLOW_NPX,
      },
      claudeCode: {
        model: env.CLAUDE_CODE_MODEL,
      },
    },
    logLevel: env.LOG_LEVEL,
    workspaceRoot: env.WORKSPACE_ROOT,
    reviewerPacksRepoPath: env.REVIEWER_PACKS_REPO_PATH,
    reviewerPacksRepoUrl: env.REVIEWER_PACKS_REPO_URL,
  };
}
