import { loadRuntimeConfig } from '../config.js';
import type {
  PrReviewWorkflowInput,
  PrReviewWorkflowStatusRecord,
} from '../domain/workflow.js';
import { createConvexClient } from '../integrations/convex.js';

export async function recordWorkflowState(
  input: PrReviewWorkflowInput,
  status: PrReviewWorkflowStatusRecord,
): Promise<void> {
  const runtimeConfig = loadRuntimeConfig();
  const convex = createConvexClient(runtimeConfig.convex);
  await convex.syncPullRequestStatus(input.pr, status);
}
