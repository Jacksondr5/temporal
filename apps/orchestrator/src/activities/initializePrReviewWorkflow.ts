import type {
  PrReviewWorkflowInput,
  PrReviewWorkflowState,
} from '../domain/workflow';
import { createInitialWorkflowState } from '../domain/workflow';

export async function initializePrReviewWorkflow(
  input: PrReviewWorkflowInput,
): Promise<PrReviewWorkflowState> {
  return createInitialWorkflowState(input);
}
