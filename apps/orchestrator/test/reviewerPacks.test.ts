import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureReviewerPacksRepo } from '../src/integrations/reviewerPacks.ts';

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd, env: process.env });
}

async function createReviewerPacksSourceRepo(root: string): Promise<string> {
  const sourcePath = join(root, 'source');
  await mkdir(sourcePath);
  await git(['init', '--initial-branch=main'], sourcePath);
  await writeFile(
    join(sourcePath, 'reviewers.json'),
    JSON.stringify({ reviewers: [] }, null, 2),
  );
  await git(['add', 'reviewers.json'], sourcePath);
  await git(
    [
      '-c',
      'user.name=Test User',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-m',
      'Add reviewer registry',
    ],
    sourcePath,
  );

  return sourcePath;
}

test('ensureReviewerPacksRepo clones into an empty existing directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reviewer-packs-test-'));
  try {
    const sourcePath = await createReviewerPacksSourceRepo(root);
    const targetPath = join(root, 'target');
    await mkdir(targetPath);

    const result = await ensureReviewerPacksRepo({
      repoPath: targetPath,
      repoUrl: sourcePath,
    });

    assert.equal(result.repoPath, targetPath);
    assert.match(result.repoCommitSha ?? '', /^[0-9a-f]{40}$/);
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: targetPath,
      env: process.env,
    });
    assert.equal(stdout.trim(), '');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ensureReviewerPacksRepo rejects a non-empty path that is not a Git worktree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reviewer-packs-test-'));
  try {
    const sourcePath = await createReviewerPacksSourceRepo(root);
    const targetPath = join(root, 'target');
    await mkdir(targetPath);
    await writeFile(join(targetPath, 'placeholder.txt'), 'not a checkout');

    await assert.rejects(
      ensureReviewerPacksRepo({
        repoPath: targetPath,
        repoUrl: sourcePath,
      }),
      /exists but is not a Git worktree/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
