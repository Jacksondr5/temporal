import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitHubRuntimeConfig } from '../config.js';
import type { PullRequestRef } from '../domain/github.js';
import type {
  PreparedMergeConflictWorkspace,
  PreparedPullRequestWorkspace,
} from '../domain/agentRuntime.js';

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

function formatRepositoryUrl(pr: PullRequestRef, token: string): string {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${pr.repository.owner}/${pr.repository.name}.git`;
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

async function runGit(
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync('git', args, {
    cwd,
    maxBuffer: 1024 * 1024 * 10,
    env: process.env,
  });
}

async function cloneWorkspace(path: string, remoteUrl: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await runGit(['clone', remoteUrl, path]);
}

async function listConflictedFiles(workspacePath: string): Promise<string[]> {
  const output = (
    await runGit(['diff', '--name-only', '--diff-filter=U'], workspacePath)
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

async function preparePullRequestWorkspace(input: {
  workspaceRoot: string;
  github: GitHubRuntimeConfig;
  pr: PullRequestRef;
}): Promise<PreparedPullRequestWorkspace> {
  const workspacePath = getWorkspacePath(input.workspaceRoot, input.pr);
  const remoteUrl = formatRepositoryUrl(input.pr, input.github.token);
  const exists = await pathExists(workspacePath);

  if (!exists) {
    await cloneWorkspace(workspacePath, remoteUrl);
  }

  await runGit(['remote', 'set-url', 'origin', remoteUrl], workspacePath);
  await runGit(['fetch', 'origin', input.pr.branchName, '--prune'], workspacePath);
  await runGit(
    ['checkout', '-B', input.pr.branchName, `origin/${input.pr.branchName}`],
    workspacePath,
  );
  await runGit(['reset', '--hard', `origin/${input.pr.branchName}`], workspacePath);
  await runGit(['clean', '-fd'], workspacePath);

  const head = (
    await runGit(['rev-parse', 'HEAD'], workspacePath)
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
}): WorkspaceManager {
  return {
    preparePullRequestWorkspace: async (pr) => {
      return await preparePullRequestWorkspace({
        workspaceRoot: options.workspaceRoot,
        github: options.github,
        pr,
      });
    },
    prepareMergeConflictWorkspace: async (input) => {
      const workspace = await preparePullRequestWorkspace({
        workspaceRoot: options.workspaceRoot,
        github: options.github,
        pr: input.pr,
      });

      await runGit(['fetch', 'origin', input.baseBranchName, '--prune'], workspace.path);

      try {
        const result = await runGit(
          ['merge', '--no-ff', '--no-edit', `origin/${input.baseBranchName}`],
          workspace.path,
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
