import type { PullRequestSnapshot } from '../domain/github';
import type {
  PrReviewReconciliationResult,
  PrReviewWorkflowState,
} from '../domain/workflow';
import {
  finalizeWorkflowPass,
  mapActionToPhase,
  withWorkflowPhase,
} from '../domain/workflow';

export function withFetchedSnapshot(
  state: PrReviewWorkflowState,
  snapshot: PullRequestSnapshot,
): PrReviewWorkflowState {
  return {
    ...state,
    pr: snapshot.pr,
    latestKnownHeadSha: snapshot.pr.headSha,
  };
}

export function beginWorkflowPass(
  state: PrReviewWorkflowState,
): PrReviewWorkflowState {
  return {
    ...withWorkflowPhase(state, 'refreshing'),
    dirty: false,
    blockedReason: null,
  };
}

export function applyReconciliationActionPhase(
  state: PrReviewWorkflowState,
  reconciliation: PrReviewReconciliationResult,
): PrReviewWorkflowState {
  return withWorkflowPhase(state, mapActionToPhase(reconciliation.action));
}

export function completeWorkflowPass(
  state: PrReviewWorkflowState,
  reconciliation: PrReviewReconciliationResult,
  baselineProcessedEventCount: number,
): PrReviewWorkflowState {
  return finalizeWorkflowPass(
    withWorkflowPhase(state, 'recording_results'),
    reconciliation,
    baselineProcessedEventCount,
  );
}
