import type {
  GitHubCheckRun,
  GitHubCheckState,
  GitHubPrEvent,
} from '../domain/github.js';
import type { ConvexClient } from '../integrations/convex.js';
import type { GitHubClient } from '../integrations/github.js';
import type { DiscoveredPullRequest } from './discoverPullRequests.js';
import {
  normalizeCheckEvent,
  normalizeHeadEvent,
  normalizeMergeabilityEvent,
  normalizeReviewCommentEvent,
  normalizeReviewEvent,
} from './normalizeEvent.js';

export async function discoverEventsForPullRequest(
  github: GitHubClient,
  convex: ConvexClient,
  pullRequest: DiscoveredPullRequest,
): Promise<GitHubPrEvent[]> {
  const [reviews, threads, checkRuns, commitStatuses, mergeability] = await Promise.all([
    github.listPullRequestReviews(pullRequest.pr),
    github.listPullRequestReviewThreads(pullRequest.pr),
    github.listCheckRuns(pullRequest.pr),
    github.listCommitStatuses(pullRequest.pr),
    github.fetchPullRequestMergeability(pullRequest.pr),
  ]);

  const checksByName = new Map(checkRuns.map((check) => [check.name, check]));
  for (const status of commitStatuses) {
    if (!checksByName.has(status.name)) {
      checksByName.set(status.name, status);
    }
  }

  const events: GitHubPrEvent[] = [normalizeHeadEvent(pullRequest)];
  const mergeabilityObservedAt = new Date().toISOString();
  const mergeabilityCursorKey = [
    'mergeability',
    pullRequest.pr.number,
    pullRequest.pr.headSha,
    mergeability.base.sha,
  ].join(':');
  const previousMergeabilityRecord = (await convex.getPollCursor(
    pullRequest.repoSlug,
    mergeabilityCursorKey,
  )) as { cursorValue?: string | null } | null;
  const previousMergeabilityState =
    previousMergeabilityRecord?.cursorValue ?? null;

  if (
    previousMergeabilityState !== mergeability.mergeabilityState &&
    mergeability.mergeabilityState === 'conflicting'
  ) {
    events.push(
      normalizeMergeabilityEvent(pullRequest, {
        observedAt: mergeabilityObservedAt,
        baseSha: mergeability.base.sha,
        mergeabilityState: mergeability.mergeabilityState,
      }),
    );
  }

  for (const review of reviews) {
    events.push(normalizeReviewEvent(pullRequest, review));
  }

  for (const thread of threads) {
    events.push(normalizeReviewCommentEvent(pullRequest, thread));
  }

  for (const checkRun of checksByName.values()) {
    const observedAt = new Date().toISOString();
    const currentState = normalizeCheckState(checkRun);
    const observation = await convex.recordCheckObservation({
      repoSlug: pullRequest.repoSlug,
      prNumber: pullRequest.pr.number,
      headSha: pullRequest.pr.headSha,
      checkName: checkRun.name,
      state: currentState,
      status: checkRun.status,
      conclusion: checkRun.conclusion,
      lastObservedAt: observedAt,
    });

    if (!observation.changed) {
      continue;
    }

    if (!isSignalWorthyCheckTransition(observation.previousState, observation.currentState)) {
      continue;
    }

    events.push(
      normalizeCheckEvent(pullRequest, checkRun, {
        observedAt,
        currentState: observation.currentState,
        previousState: observation.previousState,
      }),
    );
  }

  await convex.setPollCursor({
    repoSlug: pullRequest.repoSlug,
    source: 'github_mergeability',
    cursorKey: mergeabilityCursorKey,
    cursorValue: mergeability.mergeabilityState,
    lastObservedAt: mergeabilityObservedAt,
  });

  return events.sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}

function normalizeCheckState(checkRun: GitHubCheckRun): GitHubCheckState {
  if (checkRun.status !== 'completed' || checkRun.conclusion === null) {
    return 'pending';
  }

  switch (checkRun.conclusion) {
    case 'success':
      return 'passing';
    case 'failure':
    case 'timed_out':
    case 'cancelled':
    case 'startup_failure':
    case 'action_required':
      return 'failing';
    default:
      return 'other';
  }
}

function isSignalWorthyCheckTransition(
  previousState: GitHubCheckState | null,
  currentState: GitHubCheckState,
): boolean {
  if (previousState === currentState) {
    return false;
  }

  return currentState === 'failing' || currentState === 'passing';
}
