import { defineQuery, defineSignal } from '@temporalio/workflow';
import type {
  PrReviewWorkflowSignal,
  PrReviewWorkflowState,
  PrReviewWorkflowTerminalSignal,
} from '../domain/workflow.js';

export const prActivityObservedSignal = defineSignal<[PrReviewWorkflowSignal]>(
  'prActivityObserved',
);

export const prWorkflowStateQuery = defineQuery<PrReviewWorkflowState>(
  'prWorkflowState',
);

export const prWorkflowShutdownSignal = defineSignal<[PrReviewWorkflowTerminalSignal]>(
  'prWorkflowShutdown',
);
