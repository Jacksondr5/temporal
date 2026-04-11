import { execFile } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type {
  GitHubRuntimeConfig,
  GitIdentityRuntimeConfig,
} from '../config.js';
import type {
  PreparedMergeConflictWorkspace,
  PreparedPullRequestWorkspace,
} from '../domain/agentRuntime.js';
import type { PullRequestRef } from '../domain/github.js';

const execFileAsync = promisify(execFile);

export interface WorkspaceManager {
  preparePullRequestWorkspace(
    pr: PullRequestRef,
  ): Promise<PreparedPullRequestWorkspace>;
  prepareMergeConflictWorkspace(input: {
    pr: PullRequestRef;
    baseBranchName: string;
    baseSha: string;
  }): Promise<PreparedMergeConflictWorkspace>;
  removePullRequestWorkspace(pr: PullRequestRef): Promise<void>;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

function resolveGitHostFromApiUrl(apiUrl: string): string {
  try {
    return new URL(apiUrl).host;
  } catch {
    return 'github.com';
  }
}

function formatRepositoryUrl(pr: PullRequestRef, gitHost: string): string {
  return `https://${gitHost}/${pr.repository.owner}/${pr.repository.name}.git`;
}

function getWorkspacePath(workspaceRoot: string, pr: PullRequestRef): string {
  return join(
    workspaceRoot,
    sanitizePathSegment(pr.repository.owner),
    sanitizePathSegment(pr.repository.name),
    `pr-${pr.number}`,
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function createGitEnv(githubToken?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
  };

  if (githubToken) {
    env.GH_TOKEN = githubToken;
    env.GITHUB_TOKEN = githubToken;
  }

  return env;
}

async function runGit(
  args: string[],
  options?: {
    cwd?: string;
    githubToken?: string;
  },
): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync('git', args, {
    cwd: options?.cwd,
    maxBuffer: 1024 * 1024 * 10,
    env: createGitEnv(options?.githubToken),
  });
}

async function cloneWorkspace(
  path: string,
  remoteUrl: string,
  branchName: string,
  githubToken: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await runGit(['clone', '--branch', branchName, '--single-branch', remoteUrl, path], {
    githubToken,
  });
}

async function configureGitIdentity(
  workspacePath: string,
  gitIdentity: GitIdentityRuntimeConfig,
): Promise<void> {
  if (gitIdentity.userName !== null) {
    await runGit(['config', 'user.name', gitIdentity.userName], {
      cwd: workspacePath,
    });
  } else {
    try {
      await runGit(['config', '--unset', 'user.name'], {
        cwd: workspacePath,
      });
    } catch (error) {
      if (!isGitConfigMissingError(error)) {
        throw error;
      }
    }
  }

  if (gitIdentity.userEmail !== null) {
    await runGit(['config', 'user.email', gitIdentity.userEmail], {
      cwd: workspacePath,
    });
  } else {
    try {
      await runGit(['config', '--unset', 'user.email'], {
        cwd: workspacePath,
      });
    } catch (error) {
      if (!isGitConfigMissingError(error)) {
        throw error;
      }
    }
  }
}

async function listConflictedFiles(workspacePath: string): Promise<string[]> {
  const output = (
    await runGit(['diff', '--name-only', '--diff-filter=U'], {
      cwd: workspacePath,
    })
  ).stdout.trim();
  return output.length === 0 ? [] : output.split('\n');
}

function getGitErrorOutput(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    const processError = error as { stdout?: unknown; stderr?: unknown };
    const output = [
      typeof processError.stdout === 'string' ? processError.stdout : '',
      typeof processError.stderr === 'string' ? processError.stderr : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (output.length > 0) {
      return output;
    }
  }

  return error instanceof Error ? error.message : 'git merge failed';
}

function isGitConfigMissingError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  const processError = error as { stdout?: unknown; stderr?: unknown };
  const output = [
    typeof processError.stdout === 'string' ? processError.stdout : '',
    typeof processError.stderr === 'string' ? processError.stderr : '',
  ]
    .join('\n')
    .toLowerCase();

  return output.includes('no such section or key');
}

async function preparePullRequestWorkspace(input: {
  workspaceRoot: string;
  github: GitHubRuntimeConfig;
  gitIdentity: GitIdentityRuntimeConfig;
  pr: PullRequestRef;
}): Promise<PreparedPullRequestWorkspace> {
  const workspacePath = getWorkspacePath(input.workspaceRoot, input.pr);
  const remoteUrl = formatRepositoryUrl(
    input.pr,
    resolveGitHostFromApiUrl(input.github.apiUrl),
  );
  const exists = await pathExists(workspacePath);

  if (!exists) {
    await cloneWorkspace(
      workspacePath,
      remoteUrl,
      input.pr.branchName,
      input.github.token,
    );
    await configureGitIdentity(workspacePath, input.gitIdentity);
  } else {
    await runGit(['fetch', 'origin', input.pr.branchName, '--prune'], {
      cwd: workspacePath,
      githubToken: input.github.token,
    });
    await runGit(['reset', '--hard', `origin/${input.pr.branchName}`], {
      cwd: workspacePath,
    });
  }

  await runGit(['clean', '-fd'], { cwd: workspacePath });

  const head = (
    await runGit(['rev-parse', 'HEAD'], { cwd: workspacePath })
  ).stdout.trim();
  if (head !== input.pr.headSha) {
    console.warn(
      [
        'Prepared workspace head did not match expected SHA',
        `repo=${input.pr.repository.owner}/${input.pr.repository.name}`,
        `pr=${input.pr.number}`,
        `expected=${input.pr.headSha}`,
        `actual=${head}`,
      ].join(' | '),
    );
  }

  return {
    path: workspacePath,
    repoSlug: `${input.pr.repository.owner}/${input.pr.repository.name}`,
    branchName: input.pr.branchName,
    headSha: head,
    reusedExistingClone: exists,
  };
}

export function createWorkspaceManager(options: {
  workspaceRoot: string;
  github: GitHubRuntimeConfig;
  gitIdentity: GitIdentityRuntimeConfig;
}): WorkspaceManager {
  return {
    preparePullRequestWorkspace: async (pr) => {
      return await preparePullRequestWorkspace({
        workspaceRoot: options.workspaceRoot,
        github: options.github,
        gitIdentity: options.gitIdentity,
        pr,
      });
    },
    prepareMergeConflictWorkspace: async (input) => {
      const workspace = await preparePullRequestWorkspace({
        workspaceRoot: options.workspaceRoot,
        github: options.github,
        gitIdentity: options.gitIdentity,
        pr: input.pr,
      });

      await runGit(['fetch', 'origin', input.baseBranchName, '--prune'], {
        cwd: workspace.path,
        githubToken: options.github.token,
      });

      try {
        const result = await runGit(
          ['merge', '--no-ff', '--no-edit', `origin/${input.baseBranchName}`],
          {
            cwd: workspace.path,
          },
        );
        return {
          ...workspace,
          baseBranchName: input.baseBranchName,
          baseSha: input.baseSha,
          mergeAttemptStatus: 'clean_merge',
          mergeOutput: [result.stdout, result.stderr].filter(Boolean).join('\n'),
          conflictedFiles: [],
        };
      } catch (error) {
        return {
          ...workspace,
          baseBranchName: input.baseBranchName,
          baseSha: input.baseSha,
          mergeAttemptStatus: 'conflicted',
          mergeOutput: getGitErrorOutput(error),
          conflictedFiles: await listConflictedFiles(workspace.path),
        };
      }
    },
    removePullRequestWorkspace: async (pr) => {
      await rm(getWorkspacePath(options.workspaceRoot, pr), {
        recursive: true,
        force: true,
      });
    },
  };
}
