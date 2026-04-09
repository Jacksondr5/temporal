import type { GitHubPrEvent, PullRequestSnapshot } from './github.js';
import type { CodeRabbitAgentExecution } from './agentRuntime.js';
import type {
  CheckClassificationResult,
  RepositoryPolicy,
  SpecializedReviewerDefinition,
} from './policy.js';
import type {
  CodeRabbitReviewItem,
  ReviewDecisionRecord,
  ReviewDecisionSummary,
  SpecializedReviewerRun,
} from './review.js';

const WORKFLOW_EVENT_HISTORY_LIMIT = 200;

export type PrWorkflowDirtyReason =
  | 'manual'
  | 'head_changed'
  | 'reviews_changed'
  | 'checks_changed';

export type PrWorkflowPhase =
  | 'idle'
  | 'refreshing'
  | 'fixing_checks'
  | 'handling_code_rabbit'
  | 'running_special_reviewers'
  | 'recording_results';

export interface PrReviewWorkflowInput {
  pr: GitHubPrEvent['pr'];
  triggeredBy: string;
  maxReconciliationPasses?: number;
}

export interface PrReviewWorkflowSignal {
  event: GitHubPrEvent;
}

export interface PrReviewWorkflowArtifact {
  kind: 'commit' | 'github_reply' | 'linear_issue';
  id: string;
}

export interface PrReviewWorkflowStatusRecord {
  workflowId: string;
  branchName: string;
  headSha: string;
  currentPhase: PrWorkflowPhase;
  dirty: boolean;
  statusSummary: string | null;
  blockedReason: string | null;
}

export interface PrReviewActionContext {
  snapshot: PullRequestSnapshot;
  policy: RepositoryPolicy | null;
  dirtyReasons: PrWorkflowDirtyReason[];
}

export type PrReviewNextAction =
  | {
      type: 'fix_checks';
      failingChecks: string[];
    }
  | {
      type: 'handle_code_rabbit';
      items: CodeRabbitReviewItem[];
    }
  | {
      type: 'run_specialized_reviewers';
      reviewers: SpecializedReviewerDefinition[];
    }
  | {
      type: 'noop';
      reason: string;
    };

export interface PrReviewReconciliationResult {
  action: PrReviewNextAction;
  snapshotHeadSha: string;
}

export interface PrReviewDecisionInputs {
  snapshot: PullRequestSnapshot;
  checkClassifications: CheckClassificationResult[];
  codeRabbitItems: CodeRabbitReviewItem[];
  specializedReviewers: SpecializedReviewerDefinition[];
}

export interface PrReviewWorkflowState {
  pr: GitHubPrEvent['pr'];
  phase: PrWorkflowPhase;
  dirty: boolean;
  blockedReason: string | null;
  dirtyReasons: PrWorkflowDirtyReason[];
  latestKnownHeadSha: string;
  reconciliationCount: number;
  processedEventIds: string[];
  absorbedEvents: GitHubPrEvent[];
  latestDecision: ReviewDecisionSummary | null;
  latestReconciliation: PrReviewReconciliationResult | null;
  reviewerRuns: SpecializedReviewerRun[];
  artifacts: PrReviewWorkflowArtifact[];
}

export function formatPrWorkflowId(pr: GitHubPrEvent['pr']): string {
  return `pr:${pr.repository.owner}/${pr.repository.name}:${pr.number}`;
}

export function formatPrRunKey(input: {
  workflowId: string;
  passNumber: number;
  phase: string;
  targetHeadSha: string;
}): string {
  return `${input.workflowId}:pass:${input.passNumber}:${input.phase}:${input.targetHeadSha}`;
}

export function createInitialWorkflowState(
  input: PrReviewWorkflowInput,
): PrReviewWorkflowState {
  return {
    pr: input.pr,
    phase: 'idle',
    dirty: false,
    blockedReason: null,
    dirtyReasons: [],
    latestKnownHeadSha: input.pr.headSha,
    reconciliationCount: 0,
    processedEventIds: [],
    absorbedEvents: [],
    latestDecision: null,
    latestReconciliation: null,
    reviewerRuns: [],
    artifacts: [],
  };
}

export function mapEventKindToDirtyReason(
  event: GitHubPrEvent,
): PrWorkflowDirtyReason {
  switch (event.kind) {
    case 'pull_request_synchronized':
      return 'head_changed';
    case 'pull_request_review_submitted':
    case 'pull_request_review_comment':
      return 'reviews_changed';
    case 'pull_request_checks_changed':
      return 'checks_changed';
    case 'manual':
      return 'manual';
  }
}

export function recordWorkflowSignal(
  state: PrReviewWorkflowState,
  signal: PrReviewWorkflowSignal,
): PrReviewWorkflowState {
  if (state.processedEventIds.includes(signal.event.id)) {
    return state;
  }

  const dirtyReason = mapEventKindToDirtyReason(signal.event);

  return {
    ...state,
    dirty: true,
    latestKnownHeadSha: signal.event.headSha,
    dirtyReasons: state.dirtyReasons.includes(dirtyReason)
      ? state.dirtyReasons
      : [...state.dirtyReasons, dirtyReason],
    processedEventIds: [
      ...state.processedEventIds,
      signal.event.id,
    ].slice(-WORKFLOW_EVENT_HISTORY_LIMIT),
    absorbedEvents: [...state.absorbedEvents, signal.event].slice(
      -WORKFLOW_EVENT_HISTORY_LIMIT,
    ),
  };
}

export function mapActionToPhase(action: PrReviewNextAction): PrWorkflowPhase {
  switch (action.type) {
    case 'fix_checks':
      return 'fixing_checks';
    case 'handle_code_rabbit':
      return 'handling_code_rabbit';
    case 'run_specialized_reviewers':
      return 'running_special_reviewers';
    case 'noop':
      return 'recording_results';
  }
}

export function withWorkflowPhase(
  state: PrReviewWorkflowState,
  phase: PrWorkflowPhase,
): PrReviewWorkflowState {
  return {
    ...state,
    phase,
  };
}

export function finalizeWorkflowPass(
  state: PrReviewWorkflowState,
  reconciliation: PrReviewReconciliationResult,
  baselineProcessedEventCount: number,
): PrReviewWorkflowState {
  const receivedSignalsDuringPass =
    state.processedEventIds.length > baselineProcessedEventCount;
  const remainsDirty = receivedSignalsDuringPass || state.dirty;

  return {
    ...state,
    phase: 'idle',
    dirty: remainsDirty,
    blockedReason: state.blockedReason,
    dirtyReasons: remainsDirty ? state.dirtyReasons : [],
    reconciliationCount: state.reconciliationCount + 1,
    latestReconciliation: reconciliation,
  };
}

export function withWorkflowDecision(
  state: PrReviewWorkflowState,
  decision: ReviewDecisionRecord,
): PrReviewWorkflowState {
  return {
    ...state,
    latestDecision: decision,
  };
}

export function buildReconciliationResult(
  inputs: PrReviewDecisionInputs,
): PrReviewReconciliationResult {
  const failingFixableChecks = inputs.checkClassifications
    .filter((check) => check.classification === 'fixable_blocking')
    .map((check) => check.name);

  if (failingFixableChecks.length > 0) {
    return {
      action: {
        type: 'fix_checks',
        failingChecks: failingFixableChecks,
      },
      snapshotHeadSha: inputs.snapshot.pr.headSha,
    };
  }

  if (inputs.codeRabbitItems.length > 0) {
    return {
      action: {
        type: 'handle_code_rabbit',
        items: inputs.codeRabbitItems,
      },
      snapshotHeadSha: inputs.snapshot.pr.headSha,
    };
  }

  if (inputs.specializedReviewers.length > 0) {
    return {
      action: {
        type: 'run_specialized_reviewers',
        reviewers: inputs.specializedReviewers,
      },
      snapshotHeadSha: inputs.snapshot.pr.headSha,
    };
  }

  return {
    action: {
      type: 'noop',
      reason: 'No actionable checks, Code Rabbit threads, or specialized reviewers.',
    },
    snapshotHeadSha: inputs.snapshot.pr.headSha,
  };
}

export function withWorkflowBlockedReason(
  state: PrReviewWorkflowState,
  blockedReason: string | null,
): PrReviewWorkflowState {
  return {
    ...state,
    blockedReason,
  };
}

export function withCodeRabbitExecution(
  state: PrReviewWorkflowState,
  execution: CodeRabbitAgentExecution,
): PrReviewWorkflowState {
  return {
    ...state,
    blockedReason: execution.blockedReason,
  };
}

export function markWorkflowDirtyForHead(
  state: PrReviewWorkflowState,
  headSha: string,
): PrReviewWorkflowState {
  return {
    ...state,
    dirty: true,
    latestKnownHeadSha: headSha,
    dirtyReasons: state.dirtyReasons.includes('head_changed')
      ? state.dirtyReasons
      : [...state.dirtyReasons, 'head_changed'],
  };
}

export function toWorkflowStatusRecord(
  state: PrReviewWorkflowState,
): PrReviewWorkflowStatusRecord {
  const latestAction = state.latestReconciliation?.action;
  const latestActionSummary =
    latestAction === undefined
      ? null
      : latestAction.type === 'noop'
        ? latestAction.reason
        : latestAction.type;

  return {
    workflowId: formatPrWorkflowId(state.pr),
    branchName: state.pr.branchName,
    headSha: state.latestKnownHeadSha,
    currentPhase: state.phase,
    dirty: state.dirty,
    statusSummary: latestActionSummary,
    blockedReason: state.blockedReason,
  };
}
