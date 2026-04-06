import type { PullRequestRef, RepositoryRef } from '../domain/github';
import type { GitHubClient, GitHubPullRequestListItem } from '../integrations/github';

export interface DiscoveredPullRequest extends GitHubPullRequestListItem {
  repoSlug: string;
}

export async function discoverPullRequests(
  github: GitHubClient,
  repository: RepositoryRef,
  allowedAuthor: string | null,
): Promise<DiscoveredPullRequest[]> {
  const pullRequests = await github.listOpenPullRequests(repository, allowedAuthor);

  return pullRequests.map((pullRequest) => ({
    ...pullRequest,
    repoSlug: `${repository.owner}/${repository.name}`,
  }));
}

export function getWorkflowTarget(pr: PullRequestRef): string {
  return `${pr.repository.owner}/${pr.repository.name}#${pr.number}`;
}
