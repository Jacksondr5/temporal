import { loadRuntimeConfig } from '../config.js';
import { fileMatchesGlobs } from '../domain/glob.js';
import type { PullRequestSnapshot } from '../domain/github.js';
import type {
  RepositoryPolicy,
  SpecializedReviewerDefinition,
} from '../domain/policy.js';
import { createConvexClient } from '../integrations/convex.js';

export async function selectSpecializedReviewers(
  snapshot: PullRequestSnapshot,
  policy: RepositoryPolicy | null,
): Promise<SpecializedReviewerDefinition[]> {
  if (policy === null) {
    return [];
  }

  const matchedReviewers = policy.specializedReviewers.filter((reviewer) =>
    snapshot.changedFiles.some((filePath) =>
      fileMatchesGlobs(filePath, reviewer.fileGlobs),
    ),
  );

  if (matchedReviewers.length === 0) {
    return [];
  }

  const config = loadRuntimeConfig();
  const convex = createConvexClient(config.convex);
  const existingRuns = await convex.listReviewerRunsForPullRequest({
    repoSlug: `${snapshot.pr.repository.owner}/${snapshot.pr.repository.name}`,
    prNumber: snapshot.pr.number,
  });

  return matchedReviewers.filter((reviewer) => {
    const priorSuccessfulRuns = existingRuns.filter(
      (run) => run.reviewerId === reviewer.id && run.status === 'completed',
    );

    if (reviewer.runPolicy === 'once_per_pr') {
      return priorSuccessfulRuns.length === 0;
    }

    return !priorSuccessfulRuns.some(
      (run) => run.targetHeadSha === snapshot.pr.headSha,
    );
  });
}
