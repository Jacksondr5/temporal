import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitHubRuntimeConfig } from '../config.js';
import type { PullRequestRef } from '../domain/github.js';
import type { PreparedPullRequestWorkspace } from '../domain/agentRuntime.js';

const execFileAsync = promisify(execFile);

export interface WorkspaceManager {
  preparePullRequestWorkspace(
    pr: PullRequestRef,
  ): Promise<PreparedPullRequestWorkspace>;
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

export function createWorkspaceManager(options: {
  workspaceRoot: string;
  github: GitHubRuntimeConfig;
}): WorkspaceManager {
  return {
    preparePullRequestWorkspace: async (pr) => {
      const workspacePath = getWorkspacePath(options.workspaceRoot, pr);
      const remoteUrl = formatRepositoryUrl(pr, options.github.token);
      const exists = await pathExists(workspacePath);

      if (!exists) {
        await cloneWorkspace(workspacePath, remoteUrl);
      }

      await runGit(['remote', 'set-url', 'origin', remoteUrl], workspacePath);
      await runGit(['fetch', 'origin', pr.branchName, '--prune'], workspacePath);
      await runGit(
        ['checkout', '-B', pr.branchName, `origin/${pr.branchName}`],
        workspacePath,
      );
      await runGit(['reset', '--hard', `origin/${pr.branchName}`], workspacePath);
      await runGit(['clean', '-fd'], workspacePath);

      const head = (
        await runGit(['rev-parse', 'HEAD'], workspacePath)
      ).stdout.trim();
      if (head !== pr.headSha) {
        console.warn(
          [
            'Prepared workspace head did not match expected SHA',
            `repo=${pr.repository.owner}/${pr.repository.name}`,
            `pr=${pr.number}`,
            `expected=${pr.headSha}`,
            `actual=${head}`,
          ].join(' | '),
        );
      }

      return {
        path: workspacePath,
        repoSlug: `${pr.repository.owner}/${pr.repository.name}`,
        branchName: pr.branchName,
        headSha: head,
        reusedExistingClone: exists,
      };
    },
    removePullRequestWorkspace: async (pr) => {
      await rm(getWorkspacePath(options.workspaceRoot, pr), {
        recursive: true,
        force: true,
      });
    },
  };
}
