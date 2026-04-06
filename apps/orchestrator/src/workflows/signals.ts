import { defineQuery, defineSignal } from '@temporalio/workflow';
import type { PrReviewWorkflowSignal, PrReviewWorkflowState } from '../domain/workflow';

export const prActivityObservedSignal = defineSignal<[PrReviewWorkflowSignal]>(
  'prActivityObserved',
);

export const prWorkflowStateQuery = defineQuery<PrReviewWorkflowState>(
  'prWorkflowState',
);

export const prWorkflowShutdownSignal = defineSignal('prWorkflowShutdown');
