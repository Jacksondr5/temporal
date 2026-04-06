import { loadRuntimeConfig } from '../config';
import type { PullRequestRef } from '../domain/github';
import { createConvexClient } from '../integrations/convex';

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
