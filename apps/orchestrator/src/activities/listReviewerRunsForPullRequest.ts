import { loadRuntimeConfig } from '../config.js';
import type { PullRequestRef } from '../domain/github.js';
import { createConvexClient } from '../integrations/convex.js';

export async function listReviewerRunsForPullRequest(
  pr: PullRequestRef,
): Promise<
  Array<{
    reviewerId: string;
    targetHeadSha: string;
    matchedFiles: string[];
    status: string;
    summary: string | null;
    detailsJson: string | null;
    createdAt: string;
  }>
> {
  const config = loadRuntimeConfig();
  const convex = createConvexClient(config.convex);

  return await convex.listReviewerRunsForPullRequest({
    repoSlug: `${pr.repository.owner}/${pr.repository.name}`,
    prNumber: pr.number,
  });
}
