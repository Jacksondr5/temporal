import type {
  GitHubCheckRun,
  GitHubCheckState,
  GitHubPrEvent,
  GitHubReviewSummary,
  GitHubReviewThread,
  PullRequestRef,
} from '../domain/github.js';
import type { DiscoveredPullRequest } from './discoverPullRequests.js';

export function normalizeHeadEvent(
  pullRequest: DiscoveredPullRequest,
): GitHubPrEvent {
  return {
    id: `head:${pullRequest.repoSlug}:${pullRequest.pr.number}:${pullRequest.pr.headSha}`,
    kind: 'pull_request_synchronized',
    pr: pullRequest.pr,
    observedAt: pullRequest.updatedAt,
    actor: pullRequest.author,
    headSha: pullRequest.pr.headSha,
  };
}

export function normalizeReviewEvent(
  pullRequest: DiscoveredPullRequest,
  review: GitHubReviewSummary,
): GitHubPrEvent {
  return {
    id: `review:${pullRequest.repoSlug}:${pullRequest.pr.number}:${review.reviewId}`,
    kind: 'pull_request_review_submitted',
    pr: pullRequest.pr,
    observedAt: review.submittedAt,
    actor: review.author,
    headSha: pullRequest.pr.headSha,
    reviewId: review.reviewId,
  };
}

export function normalizeReviewCommentEvent(
  pullRequest: DiscoveredPullRequest,
  thread: GitHubReviewThread,
): GitHubPrEvent {
  return {
    id: `comment:${pullRequest.repoSlug}:${pullRequest.pr.number}:${thread.threadRef.commentId}`,
    kind: 'pull_request_review_comment',
    pr: pullRequest.pr,
    observedAt: thread.updatedAt,
    actor: thread.author,
    headSha: pullRequest.pr.headSha,
    reviewId: thread.threadRef.reviewId ?? undefined,
    commentId: thread.threadRef.commentId,
  };
}

export function normalizeCheckEvent(
  pullRequest: DiscoveredPullRequest,
  checkRun: GitHubCheckRun,
  input: {
    observedAt: string;
    currentState: GitHubCheckState;
    previousState: GitHubCheckState | null;
  },
): GitHubPrEvent {
  return {
    id: `check:${pullRequest.repoSlug}:${pullRequest.pr.number}:${pullRequest.pr.headSha}:${checkRun.name}:${input.previousState ?? 'none'}:${input.currentState}:${input.observedAt}`,
    kind: 'pull_request_checks_changed',
    pr: pullRequest.pr,
    observedAt: input.observedAt,
    actor: null,
    headSha: pullRequest.pr.headSha,
    checkName: checkRun.name,
    checkState: input.currentState,
    previousCheckState: input.previousState,
  };
}

export function normalizeTerminalEvent(input: {
  repoSlug: string;
  pr: PullRequestRef;
  author: GitHubPrEvent['actor'];
  observedAt: string;
}): GitHubPrEvent {
  if (input.pr.lifecycleState === 'open') {
    throw new Error(
      'Cannot normalize a terminal event for an open pull request.',
    );
  }

  return {
    id: `terminal:${input.repoSlug}:${input.pr.number}:${input.pr.lifecycleState}:${input.observedAt}`,
    kind:
      input.pr.lifecycleState === 'merged'
        ? 'pull_request_merged'
        : 'pull_request_closed',
    pr: input.pr,
    observedAt: input.observedAt,
    actor: input.author,
    headSha: input.pr.headSha,
  };
}
