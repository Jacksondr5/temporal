import { loadRuntimeConfig } from '../config';
import type { PullRequestRef, PullRequestSnapshot } from '../domain/github';
import { createGitHubClient } from '../integrations/github';

export async function fetchPullRequestSnapshot(
  pr: PullRequestRef,
): Promise<PullRequestSnapshot> {
  const runtimeConfig = loadRuntimeConfig();
  const github = createGitHubClient(runtimeConfig.github);
  return await github.fetchPullRequestSnapshot(pr);
}
