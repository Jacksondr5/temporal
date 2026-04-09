import type {
  PrReviewWorkflowInput,
  PrReviewWorkflowState,
} from '../domain/workflow.js';
import { createInitialWorkflowState } from '../domain/workflow.js';

export async function initializePrReviewWorkflow(
  input: PrReviewWorkflowInput,
): Promise<PrReviewWorkflowState> {
  return createInitialWorkflowState(input);
}
