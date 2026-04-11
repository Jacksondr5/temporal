import { loadRuntimeConfig } from '../config.js';
import type { RepositoryRef } from '../domain/github.js';
import { createGitHubClient } from '../integrations/github.js';

export async function postPullRequestComment(input: {
  repository: RepositoryRef;
  prNumber: number;
  body: string;
}): Promise<{ commentId: number; htmlUrl: string | null }> {
  const runtimeConfig = loadRuntimeConfig();
  const github = createGitHubClient(runtimeConfig.github);
  return await github.postPullRequestComment(input);
}
