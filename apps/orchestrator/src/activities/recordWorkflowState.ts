import { loadRuntimeConfig } from '../config';
import type {
  PrReviewWorkflowInput,
  PrReviewWorkflowStatusRecord,
} from '../domain/workflow';
import { createConvexClient } from '../integrations/convex';

export async function recordWorkflowState(
  input: PrReviewWorkflowInput,
  status: PrReviewWorkflowStatusRecord,
): Promise<void> {
  const runtimeConfig = loadRuntimeConfig();
  const convex = createConvexClient(runtimeConfig.convex);
  await convex.syncPullRequestStatus(input.pr, status);
}
