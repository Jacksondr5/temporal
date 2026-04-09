import { loadRuntimeConfig } from '../config.js';
import type { PullRequestRef, PullRequestSnapshot } from '../domain/github.js';
import { createGitHubClient } from '../integrations/github.js';

export async function fetchPullRequestSnapshot(
  pr: PullRequestRef,
): Promise<PullRequestSnapshot> {
  const runtimeConfig = loadRuntimeConfig();
  const github = createGitHubClient(runtimeConfig.github);
  return await github.fetchPullRequestSnapshot(pr);
}
