import type { ConvexRuntimeConfig } from '../config.js';
import type {
  GitHubCheckState,
  GitHubPrEvent,
  PullRequestLifecycleState,
  PullRequestRef,
} from '../domain/github.js';
import type {
  RepositoryPolicy,
  SpecializedReviewerDefinition,
} from '../domain/policy.js';
import type { ReviewDecisionRecord } from '../domain/review.js';
import type { PrReviewWorkflowStatusRecord } from '../domain/workflow.js';
import { formatPrWorkflowId } from '../domain/workflow.js';
import { parseRepositorySlug } from '../domain/policy.js';

interface ConvexFunctionSuccess<TValue> {
  status: 'success';
  value: TValue;
  logLines: string[];
}

interface ConvexFunctionError {
  status: 'error';
  errorMessage: string;
  logLines: string[];
}

type ConvexFunctionResponse<TValue> =
  | ConvexFunctionSuccess<TValue>
  | ConvexFunctionError;

interface ConvexRepoPolicyRecord {
  repoSlug: string;
  fixableChecks: string[];
  ignoredChecks: string[];
  specializedReviewers: SpecializedReviewerDefinition[];
}

interface ConvexThreadDecisionRecord {
  threadKey: string;
  disposition: ReviewDecisionRecord['disposition'];
  reasoningSummary: string;
  targetHeadSha: string;
  artifactIds: string[];
  linearIssueId: string | null;
  githubCommentId: string | null;
  createdAt: string;
}

interface ConvexReviewerRunRecord {
  reviewerId: string;
  targetHeadSha: string;
  matchedFiles: string[];
  status: string;
  summary: string | null;
  detailsJson: string | null;
  createdAt: string;
}

interface ConvexPullRequestRecord {
  repoSlug: string;
  prNumber: number;
  workflowId: string;
  branchName: string;
  headSha: string;
  lifecycleState?: PullRequestLifecycleState;
  statusSummary: string | null;
  currentPhase: string;
  dirty: boolean;
  blockedReason: string | null;
  lastReconciledAt: string | null;
}

interface ConvexManualEventRecord {
  eventId: string;
  repoSlug: string;
  prNumber: number;
  kind: string;
  observedAt: string;
  headSha: string;
  actorLogin: string | null;
  reviewId: number | null;
  commentId: number | null;
  checkName: string | null;
}

interface ConvexManualClaimResult {
  claimed: boolean;
  alreadyProcessed: boolean;
}

interface ConvexManualProcessedResult {
  processed: boolean;
}

export interface ConvexClient {
  readonly url: string;
  ensureRepoWithPolicy(owner: string, name: string): Promise<unknown>;
  getRepoPolicy(repoSlug: string): Promise<RepositoryPolicy | null>;
  getPollCursor(repoSlug: string, cursorKey: string): Promise<unknown | null>;
  setPollCursor(input: {
    repoSlug: string;
    source: string;
    cursorKey: string;
    cursorValue: string | null;
    lastObservedAt: string | null;
  }): Promise<unknown>;
  recordGitHubEvent(event: GitHubPrEvent): Promise<{
    eventDocumentId: string;
    inserted: boolean;
  }>;
  recordCheckObservation(input: {
    repoSlug: string;
    prNumber: number;
    headSha: string;
    checkName: string;
    state: GitHubCheckState;
    status: string;
    conclusion: string | null;
    lastObservedAt: string;
  }): Promise<{
    documentId: string;
    inserted: boolean;
    changed: boolean;
    previousState: GitHubCheckState | null;
    currentState: GitHubCheckState;
  }>;
  getPullRequest(
    repoSlug: string,
    prNumber: number,
  ): Promise<ConvexPullRequestRecord | null>;
  listManualEventsSince(input: {
    limit: number;
  }): Promise<ConvexManualEventRecord[]>;
  claimManualEvent(eventId: string): Promise<ConvexManualClaimResult>;
  markManualEventProcessed(eventId: string): Promise<ConvexManualProcessedResult>;
  upsertPullRequest(pr: PullRequestRef): Promise<unknown>;
  listTrackedOpenPullRequests(repoSlug: string): Promise<ConvexPullRequestRecord[]>;
  syncPullRequestStatus(
    pr: PullRequestRef,
    status: PrReviewWorkflowStatusRecord,
  ): Promise<unknown>;
  upsertPrRun(input: {
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
  }): Promise<unknown>;
  getLatestThreadDecisions(input: {
    repoSlug: string;
    prNumber: number;
    threadKeys: string[];
  }): Promise<ConvexThreadDecisionRecord[]>;
  insertThreadDecision(
    repoSlug: string,
    prNumber: number,
    decision: ReviewDecisionRecord,
  ): Promise<unknown>;
  upsertArtifact(input: {
    repoSlug: string;
    prNumber: number;
    artifactKind: string;
    externalId: string;
    correlationKey: string;
    summary: string | null;
  }): Promise<unknown>;
  insertWorkflowError(input: {
    repoSlug: string;
    prNumber: number;
    workflowId: string;
    errorType: string;
    errorMessage: string;
    phase: string | null;
    retryable: boolean;
    blocked: boolean;
  }): Promise<unknown>;
  listReviewerRunsForPullRequest(input: {
    repoSlug: string;
    prNumber: number;
  }): Promise<ConvexReviewerRunRecord[]>;
  insertReviewerRun(input: {
    repoSlug: string;
    prNumber: number;
    reviewerId: string;
    targetHeadSha: string;
    matchedFiles: string[];
    status: string;
    summary: string | null;
    detailsJson?: string | null;
  }): Promise<unknown>;
}

async function callConvexFunction<TValue>(
  baseUrl: string,
  kind: 'query' | 'mutation',
  path: string,
  args: Record<string, unknown>,
): Promise<TValue> {
  const response = await fetch(`${baseUrl}/api/${kind}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path,
      args,
      format: 'json',
    }),
  });

  if (!response.ok) {
    throw new Error(`Convex ${kind} failed for ${path}: ${response.status}`);
  }

  const payload = (await response.json()) as ConvexFunctionResponse<TValue>;
  if (payload.status === 'error') {
    throw new Error(payload.errorMessage);
  }

  return payload.value;
}

export function createConvexClient(config: ConvexRuntimeConfig): ConvexClient {
  const baseUrl = config.url;

  return {
    url: baseUrl,
    ensureRepoWithPolicy: async (owner, name) =>
      await callConvexFunction(baseUrl, 'mutation', 'repos:ensureRepoWithPolicy', {
        slug: `${owner}/${name}`,
        owner,
        name,
      }),
    getRepoPolicy: async (repoSlug) => {
      const record = await callConvexFunction<ConvexRepoPolicyRecord | null>(
        baseUrl,
        'query',
        'repoPolicies:getByRepoSlug',
        {
          repoSlug,
        },
      );

      if (record === null) {
        return null;
      }

      return {
        repository: parseRepositorySlug(record.repoSlug),
        fixableChecks: record.fixableChecks,
        ignoredChecks: record.ignoredChecks,
        specializedReviewers: record.specializedReviewers,
      };
    },
    getPollCursor: async (repoSlug, cursorKey) =>
      await callConvexFunction(baseUrl, 'query', 'pollState:getCursor', {
        repoSlug,
        cursorKey,
      }),
    setPollCursor: async (input) =>
      await callConvexFunction(baseUrl, 'mutation', 'pollState:setCursor', input),
    recordGitHubEvent: async (event) =>
      await callConvexFunction(baseUrl, 'mutation', 'githubEvents:record', {
        eventId: event.id,
        repoSlug: `${event.pr.repository.owner}/${event.pr.repository.name}`,
        prNumber: event.pr.number,
        kind: event.kind,
        observedAt: event.observedAt,
        headSha: event.headSha,
        actorLogin: event.actor?.login ?? null,
        reviewId: event.reviewId ?? null,
        commentId: event.commentId ?? null,
        checkName: event.checkName ?? null,
      }),
    recordCheckObservation: async (input) =>
      await callConvexFunction(baseUrl, 'mutation', 'checkObservations:record', {
        repoSlug: input.repoSlug,
        prNumber: input.prNumber,
        headSha: input.headSha,
        checkName: input.checkName,
        state: input.state,
        status: input.status,
        conclusion: input.conclusion,
        lastObservedAt: input.lastObservedAt,
      }),
    getPullRequest: async (repoSlug, prNumber) =>
      await callConvexFunction<ConvexPullRequestRecord | null>(
        baseUrl,
        'query',
        'pullRequests:getByRepoAndNumber',
        {
          repoSlug,
          prNumber,
        },
      ),
    listManualEventsSince: async (input) =>
      await callConvexFunction<ConvexManualEventRecord[]>(
        baseUrl,
        'query',
        'githubEvents:listManualSince',
        {
          limit: input.limit,
        },
      ),
    claimManualEvent: async (eventId) =>
      await callConvexFunction<ConvexManualClaimResult>(
        baseUrl,
        'mutation',
        'githubEvents:claimManual',
        {
          eventId,
        },
      ),
    markManualEventProcessed: async (eventId) =>
      await callConvexFunction<ConvexManualProcessedResult>(
        baseUrl,
        'mutation',
        'githubEvents:markManualProcessed',
        {
          eventId,
        },
      ),
    upsertPullRequest: async (pr) =>
      await callConvexFunction(baseUrl, 'mutation', 'pullRequests:upsertDiscovered', {
        repoSlug: `${pr.repository.owner}/${pr.repository.name}`,
        prNumber: pr.number,
        workflowId: formatPrWorkflowId(pr),
        branchName: pr.branchName,
        headSha: pr.headSha,
      }),
    listTrackedOpenPullRequests: async (repoSlug) =>
      await callConvexFunction<ConvexPullRequestRecord[]>(
        baseUrl,
        'query',
        'pullRequests:listTrackedOpenByRepo',
        {
          repoSlug,
        },
      ),
    syncPullRequestStatus: async (pr, status) =>
      await callConvexFunction(baseUrl, 'mutation', 'pullRequests:upsert', {
        repoSlug: `${pr.repository.owner}/${pr.repository.name}`,
        prNumber: pr.number,
        workflowId: status.workflowId,
        branchName: status.branchName,
        headSha: status.headSha,
        lifecycleState: status.lifecycleState,
        statusSummary: status.statusSummary,
        currentPhase: status.currentPhase,
        dirty: status.dirty,
        blockedReason: status.blockedReason,
        lastReconciledAt:
          status.currentPhase === 'idle' ? new Date().toISOString() : null,
      }),
    upsertPrRun: async (input) =>
      await callConvexFunction(baseUrl, 'mutation', 'prRuns:upsert', {
        repoSlug: input.repoSlug,
        prNumber: input.prNumber,
        workflowId: input.workflowId,
        runKey: input.runKey,
        phase: input.phase,
        status: input.status,
        targetHeadSha: input.targetHeadSha,
        startedAt: input.startedAt ?? null,
        completedAt: input.completedAt ?? null,
        summary: input.summary,
        detailsJson: input.detailsJson ?? null,
      }),
    getLatestThreadDecisions: async (input) =>
      await callConvexFunction<ConvexThreadDecisionRecord[]>(
        baseUrl,
        'query',
        'threadDecisions:getLatestForThreads',
        {
          repoSlug: input.repoSlug,
          prNumber: input.prNumber,
          threadKeys: input.threadKeys,
        },
      ),
    insertThreadDecision: async (repoSlug, prNumber, decision) =>
      await callConvexFunction(baseUrl, 'mutation', 'threadDecisions:insert', {
        repoSlug,
        prNumber,
        threadKey: decision.threadKey,
        disposition: decision.disposition,
        reasoningSummary: decision.reasoningSummary,
        targetHeadSha: decision.targetHeadSha,
        artifactIds: decision.artifacts.map((artifact) => artifact.id),
        linearIssueId:
          decision.artifacts.find((artifact) => artifact.kind === 'linear_issue')?.id ??
          null,
        githubCommentId:
          decision.artifacts.find((artifact) => artifact.kind === 'github_comment')
            ?.id ?? null,
        createdAt: new Date().toISOString(),
      }),
    upsertArtifact: async (input) =>
      await callConvexFunction(baseUrl, 'mutation', 'artifacts:upsert', {
        repoSlug: input.repoSlug,
        prNumber: input.prNumber,
        artifactKind: input.artifactKind,
        externalId: input.externalId,
        correlationKey: input.correlationKey,
        summary: input.summary,
        createdAt: new Date().toISOString(),
      }),
    insertWorkflowError: async (input) =>
      await callConvexFunction(baseUrl, 'mutation', 'workflowErrors:insert', {
        repoSlug: input.repoSlug,
        prNumber: input.prNumber,
        workflowId: input.workflowId,
        errorType: input.errorType,
        errorMessage: input.errorMessage,
        phase: input.phase,
        retryable: input.retryable,
        blocked: input.blocked,
        lastSeenAt: new Date().toISOString(),
      }),
    listReviewerRunsForPullRequest: async (input) =>
      await callConvexFunction(baseUrl, 'query', 'reviewerRuns:listForPullRequest', {
        repoSlug: input.repoSlug,
        prNumber: input.prNumber,
      }),
    insertReviewerRun: async (input) =>
      await callConvexFunction(baseUrl, 'mutation', 'reviewerRuns:insert', {
        repoSlug: input.repoSlug,
        prNumber: input.prNumber,
        reviewerId: input.reviewerId,
        targetHeadSha: input.targetHeadSha,
        matchedFiles: input.matchedFiles,
        status: input.status,
        summary: input.summary,
        detailsJson: input.detailsJson ?? null,
        createdAt: new Date().toISOString(),
      }),
  };
}
