import { loadRuntimeConfig } from '../config';
import { createConvexClient } from '../integrations/convex';

export async function insertReviewerRun(input: {
  repoSlug: string;
  prNumber: number;
  reviewerId: string;
  targetHeadSha: string;
  matchedFiles: string[];
  status: string;
  summary: string | null;
  detailsJson?: string | null;
}): Promise<void> {
  const config = loadRuntimeConfig();
  const convex = createConvexClient(config.convex);

  await convex.insertReviewerRun(input);
}
