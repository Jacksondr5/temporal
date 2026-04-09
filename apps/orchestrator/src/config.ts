import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { config as loadDotEnv } from 'dotenv';
import { loadClientConnectConfig } from '@temporalio/envconfig';

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

const repoRoot = findRepoRoot(__dirname);
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
  token: string | null;
  apiUrl: string;
}

export interface ConvexRuntimeConfig {
  url: string | null;
}

export interface LinearRuntimeConfig {
  apiKey: string | null;
  teamId: string | null;
  defaultProjectId: string | null;
}

export interface CodexRuntimeConfig {
  model: string | null;
  allowNpx: boolean;
}

export interface ClaudeCodeRuntimeConfig {
  model: string | null;
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
  workspaceRoot: string | null;
  reviewerPacksRepoPath: string;
  reviewerPacksRepoUrl: string | null;
}

const DEFAULT_TEMPORAL_ADDRESS = 'temporal.j5:7233';
const DEFAULT_TEMPORAL_NAMESPACE = 'pr-review';
const DEFAULT_TEMPORAL_TASK_QUEUE = 'pr-review-orchestrator';
const DEFAULT_GITHUB_API_URL = 'https://api.github.com';
const DEFAULT_POLL_INTERVAL_SECONDS = 60;
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_CODEX_MODEL = 'gpt-5.3-codex';
const DEFAULT_CLAUDE_CODE_MODEL = 'sonnet';
const DEFAULT_REVIEWER_PACKS_REPO_PATH = resolve(repoRoot, '..', 'reviewer-packs');

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  switch (value.trim().toLowerCase()) {
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
      return fallback;
  }
}

export function loadTemporalRuntimeConfig(): TemporalRuntimeConfig {
  process.env.TEMPORAL_ADDRESS ??= DEFAULT_TEMPORAL_ADDRESS;
  process.env.TEMPORAL_NAMESPACE ??= DEFAULT_TEMPORAL_NAMESPACE;

  const config = loadClientConnectConfig();

  return {
    connectionOptions: config.connectionOptions,
    namespace: config.namespace ?? DEFAULT_TEMPORAL_NAMESPACE,
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? DEFAULT_TEMPORAL_TASK_QUEUE,
  };
}

export function loadRuntimeConfig(): RuntimeConfig {
  return {
    temporal: loadTemporalRuntimeConfig(),
    poller: {
      intervalSeconds: parseInteger(
        process.env.POLL_INTERVAL_SECONDS,
        DEFAULT_POLL_INTERVAL_SECONDS,
      ),
      allowedRepos: parseCsv(process.env.GITHUB_ALLOWED_REPOS),
      allowedAuthor: readOptionalEnv('GITHUB_ALLOWED_AUTHOR'),
    },
    github: {
      token: readOptionalEnv('GITHUB_TOKEN'),
      apiUrl: process.env.GITHUB_API_URL ?? DEFAULT_GITHUB_API_URL,
    },
    convex: {
      url: readOptionalEnv('CONVEX_URL'),
    },
    linear: {
      apiKey: readOptionalEnv('LINEAR_API_KEY'),
      teamId: readOptionalEnv('LINEAR_TEAM_ID'),
      defaultProjectId: readOptionalEnv('LINEAR_DEFAULT_PROJECT_ID'),
    },
    ai: {
      defaultProvider:
        readOptionalEnv('AI_DEFAULT_PROVIDER') === 'codex' ? 'codex' : 'codex',
      codex: {
        model: readOptionalEnv('CODEX_MODEL') ?? DEFAULT_CODEX_MODEL,
        allowNpx: parseBoolean(process.env.CODEX_ALLOW_NPX, true),
      },
      claudeCode: {
        model: readOptionalEnv('CLAUDE_CODE_MODEL') ?? DEFAULT_CLAUDE_CODE_MODEL,
      },
    },
    logLevel: process.env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL,
    workspaceRoot: readOptionalEnv('WORKSPACE_ROOT'),
    reviewerPacksRepoPath:
      readOptionalEnv('REVIEWER_PACKS_REPO_PATH') ?? DEFAULT_REVIEWER_PACKS_REPO_PATH,
    reviewerPacksRepoUrl: readOptionalEnv('REVIEWER_PACKS_REPO_URL'),
  };
}
