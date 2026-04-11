import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  GitHubRuntimeConfig,
  GitIdentityRuntimeConfig,
} from '../config.js';
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

function formatRepositoryUrl(pr: PullRequestRef): string {
  return `https://github.com/${pr.repository.owner}/${pr.repository.name}.git`;
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

async function runGit(args: string[], options?: {
  cwd?: string;
  githubToken?: string;
}): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync('git', args, {
    cwd: options?.cwd,
    maxBuffer: 1024 * 1024 * 10,
    env: createGitEnv(options?.githubToken),
  });
}

async function cloneWorkspace(
  path: string,
  remoteUrl: string,
  githubToken: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await runGit(['clone', remoteUrl, path], { githubToken });
}

async function configureGitIdentity(
  workspacePath: string,
  gitIdentity: GitIdentityRuntimeConfig,
): Promise<void> {
  if (gitIdentity.userName === null || gitIdentity.userEmail === null) {
    return;
  }

  await runGit(['config', 'user.name', gitIdentity.userName], {
    cwd: workspacePath,
  });
  await runGit(['config', 'user.email', gitIdentity.userEmail], {
    cwd: workspacePath,
  });
}

export function createWorkspaceManager(options: {
  workspaceRoot: string;
  github: GitHubRuntimeConfig;
  gitIdentity: GitIdentityRuntimeConfig;
}): WorkspaceManager {
  return {
    preparePullRequestWorkspace: async (pr) => {
      const workspacePath = getWorkspacePath(options.workspaceRoot, pr);
      const remoteUrl = formatRepositoryUrl(pr);
      const exists = await pathExists(workspacePath);

      if (!exists) {
        await cloneWorkspace(workspacePath, remoteUrl, options.github.token);
      }

      await runGit(['remote', 'set-url', 'origin', remoteUrl], {
        cwd: workspacePath,
      });
      await configureGitIdentity(workspacePath, options.gitIdentity);
      await runGit(['fetch', 'origin', pr.branchName, '--prune'], {
        cwd: workspacePath,
        githubToken: options.github.token,
      });
      await runGit(
        ['checkout', '-B', pr.branchName, `origin/${pr.branchName}`],
        { cwd: workspacePath },
      );
      await runGit(['reset', '--hard', `origin/${pr.branchName}`], {
        cwd: workspacePath,
      });
      await runGit(['clean', '-fd'], { cwd: workspacePath });

      const head = (
        await runGit(['rev-parse', 'HEAD'], { cwd: workspacePath })
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
