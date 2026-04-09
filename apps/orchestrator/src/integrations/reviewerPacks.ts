import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ReviewerPackRegistryEntry {
  id: string;
  title: string;
  description: string;
  entrypoint: string;
  knowledgeFiles: string[];
  recommendedTools: string[];
}

interface ReviewerPackRegistryFile {
  reviewers: ReviewerPackRegistryEntry[];
}

export interface LoadedReviewerPack {
  entry: ReviewerPackRegistryEntry;
  repoPath: string;
  entrypointPath: string;
  knowledgeFilePaths: string[];
  repoCommitSha: string | null;
}

async function getGitHead(path: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: path,
      env: process.env,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
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
    env: process.env,
  });
}

async function isCleanGitWorktree(path: string): Promise<boolean> {
  try {
    const { stdout } = await runGit(['status', '--porcelain'], path);
    return stdout.trim().length === 0;
  } catch {
    return false;
  }
}

export async function ensureReviewerPacksRepo(input: {
  repoPath: string;
  repoUrl: string;
}): Promise<{
  repoPath: string;
  repoCommitSha: string | null;
}> {
  const exists = await pathExists(input.repoPath);

  if (!exists) {
    await mkdir(join(input.repoPath, '..'), { recursive: true });
    await runGit(['clone', input.repoUrl, input.repoPath]);

    return {
      repoPath: input.repoPath,
      repoCommitSha: await getGitHead(input.repoPath),
    };
  }

  const clean = await isCleanGitWorktree(input.repoPath);
  if (!clean) {
    console.warn(
      [
        'Reviewer packs repo has local changes; skipping sync',
        `path=${input.repoPath}`,
      ].join(' | '),
    );
    return {
      repoPath: input.repoPath,
      repoCommitSha: await getGitHead(input.repoPath),
    };
  }

  try {
    await runGit(['remote', 'set-url', 'origin', input.repoUrl], input.repoPath);
    await runGit(['pull', '--ff-only'], input.repoPath);
  } catch (error) {
    console.warn(
      [
        'Failed to sync reviewer packs repo; using local checkout as-is',
        `path=${input.repoPath}`,
        `error=${error instanceof Error ? error.message : 'unknown'}`,
      ].join(' | '),
    );
  }

  return {
    repoPath: input.repoPath,
    repoCommitSha: await getGitHead(input.repoPath),
  };
}

export async function loadReviewerRegistry(
  repoPath: string,
): Promise<ReviewerPackRegistryEntry[]> {
  const raw = await readFile(join(repoPath, 'reviewers.json'), 'utf8');
  const parsed = JSON.parse(raw) as ReviewerPackRegistryFile;
  return parsed.reviewers;
}

export async function loadReviewerPack(
  repoPath: string,
  reviewerId: string,
): Promise<LoadedReviewerPack> {
  const reviewers = await loadReviewerRegistry(repoPath);
  const entry = reviewers.find((reviewer) => reviewer.id === reviewerId);
  if (!entry) {
    throw new Error(`Reviewer pack "${reviewerId}" was not found in ${repoPath}.`);
  }

  return {
    entry,
    repoPath,
    entrypointPath: join(repoPath, entry.entrypoint),
    knowledgeFilePaths: entry.knowledgeFiles.map((path) => join(repoPath, path)),
    repoCommitSha: await getGitHead(repoPath),
  };
}
