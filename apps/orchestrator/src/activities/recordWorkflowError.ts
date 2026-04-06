import { loadRuntimeConfig } from '../config';
import { createConvexClient } from '../integrations/convex';

export async function recordWorkflowError(input: {
  repoSlug: string;
  prNumber: number;
  workflowId: string;
  errorType: string;
  errorMessage: string;
  phase: string | null;
  retryable: boolean;
  blocked: boolean;
}): Promise<void> {
  const runtimeConfig = loadRuntimeConfig();
  const convex = createConvexClient(runtimeConfig.convex);
  await convex.insertWorkflowError(input);
}
