import { loadRuntimeConfig } from '../config.js';
import { createConvexClient } from '../integrations/convex.js';

export async function recordPrRun(input: {
  repoSlug: string;
  prNumber: number;
  workflowId: string;
  runKey: string;
  phase: string;
  status: string;
  targetHeadSha: string;
  startedAt?: string | null;
  completedAt?: string | null;
  summary: string | null;
  detailsJson?: string | null;
}): Promise<void> {
  const runtimeConfig = loadRuntimeConfig();
  const convex = createConvexClient(runtimeConfig.convex);
  await convex.upsertPrRun(input);
}
