import { WorkflowNotFoundError } from '@temporalio/client';
import {
  signalPullRequestActivity,
  signalPullRequestTerminalState,
} from '../client.js';
import { loadRuntimeConfig } from '../config.js';
import { parseRepositorySlug } from '../domain/policy.js';
import { createConvexClient } from '../integrations/convex.js';
import { createGitHubClient } from '../integrations/github.js';
import { discoverEventsForPullRequest } from './discoverEvents.js';
import { discoverPullRequests } from './discoverPullRequests.js';
import { discoverAllowedRepositories } from './discoverRepos.js';

export interface PollerRunSummary {
  repositories: number;
  events: number;
  signals: number;
}

const MANUAL_EVENT_CURSOR_REPO = '__manual__';
const MANUAL_EVENT_CURSOR_KEY = 'last_manual_event_id';
const MANUAL_EVENT_BATCH_SIZE = 100;

function buildTerminalSignalFallbackSummary(
  lifecycleState: 'closed' | 'merged',
): string {
  return lifecycleState === 'merged'
    ? 'PR merged. Terminal state recorded without a live workflow.'
    : 'PR closed. Terminal state recorded without a live workflow.';
}

async function drainManualEvents(
  convex: ReturnType<typeof createConvexClient>,
): Promise<{
  processedEvents: number;
  signals: number;
}> {
  const cursor = await convex.getPollCursor(
    MANUAL_EVENT_CURSOR_REPO,
    MANUAL_EVENT_CURSOR_KEY,
  );

  let cursorValue =
    cursor !== null &&
    typeof cursor === 'object' &&
    'cursorValue' in cursor &&
    typeof cursor.cursorValue === 'string'
      ? cursor.cursorValue
      : null;
  let processedEvents = 0;
  let signals = 0;

  while (true) {
    const manualEvents = await convex.listManualEventsSince({
      limit: MANUAL_EVENT_BATCH_SIZE,
    });

    if (manualEvents.length === 0) {
      break;
    }

    for (const event of manualEvents) {
      const claimResult = await convex.claimManualEvent(event.eventId);
      if (!claimResult.claimed) {
        if (claimResult.alreadyProcessed) {
          cursorValue = event.eventId;
        }
        continue;
      }

      const pullRequest = await convex.getPullRequest(event.repoSlug, event.prNumber);
      if (pullRequest === null) {
        throw new Error(
          `Tracked pull request not found for manual event ${event.eventId}.`,
        );
      }

      const repository = parseRepositorySlug(event.repoSlug);
      await signalPullRequestActivity(
        {
          pr: {
            repository,
            number: pullRequest.prNumber,
            branchName: pullRequest.branchName,
            headSha: pullRequest.headSha,
          },
          triggeredBy: 'manual-signal',
        },
        {
          event: {
            id: event.eventId,
            kind: 'manual',
            pr: {
              repository,
              number: pullRequest.prNumber,
              branchName: pullRequest.branchName,
              headSha: pullRequest.headSha,
            },
            observedAt: event.observedAt,
            actor: event.actorLogin ? { login: event.actorLogin } : null,
            headSha: event.headSha,
            reviewId: event.reviewId ?? undefined,
            commentId: event.commentId ?? undefined,
            checkName: event.checkName ?? undefined,
          },
        },
      );

      cursorValue = event.eventId;
      processedEvents += 1;
      signals += 1;

      await convex.markManualEventProcessed(event.eventId);

      await convex.setPollCursor({
        repoSlug: MANUAL_EVENT_CURSOR_REPO,
        source: 'operator',
        cursorKey: MANUAL_EVENT_CURSOR_KEY,
        cursorValue,
        lastObservedAt: event.observedAt,
      });
    }

    if (manualEvents.length < MANUAL_EVENT_BATCH_SIZE) {
      break;
    }
  }

  return {
    processedEvents,
    signals,
  };
}

export async function runPoller(): Promise<PollerRunSummary> {
  const config = loadRuntimeConfig();
  const github = createGitHubClient(config.github);
  const convex = createConvexClient(config.convex);

  console.info(
    [
      'Poller scaffold starting',
      `interval=${config.poller.intervalSeconds}s`,
      `allowedRepos=${config.poller.allowedRepos.length}`,
      `allowedAuthor=${config.poller.allowedAuthor ?? 'unset'}`,
    ].join(' | '),
  );

  const manualDrainResult = await drainManualEvents(convex);
  let discoveredEventCount = manualDrainResult.processedEvents;
  let signaledWorkflowCount = manualDrainResult.signals;

  const repositories = discoverAllowedRepositories(config.poller.allowedRepos);

  for (const repository of repositories) {
    const repoSlug = `${repository.owner}/${repository.name}`;

    // Ensure the repo and an empty policy exist in Convex so they are
    // immediately visible in the operator UI, even before any PRs appear.
    await convex.ensureRepoWithPolicy(repository.owner, repository.name);

    const trackedOpenPullRequests = await convex.listTrackedOpenPullRequests(repoSlug);
    const pullRequests = await discoverPullRequests(
      github,
      repository,
      config.poller.allowedAuthor,
    );
    const openPrNumbers = new Set(pullRequests.map((pullRequest) => pullRequest.pr.number));

    for (const pullRequest of pullRequests) {
      await convex.upsertPullRequest(pullRequest.pr);

      const events = await discoverEventsForPullRequest(
        github,
        convex,
        pullRequest,
      );
      discoveredEventCount += events.length;

      for (const event of events) {
        const recordResult = await convex.recordGitHubEvent(event);
        if (!recordResult.inserted) {
          continue;
        }

        await signalPullRequestActivity(
          {
            pr: pullRequest.pr,
            triggeredBy: 'poller',
          },
          {
            event,
          },
        );
        signaledWorkflowCount += 1;
      }
    }

    for (const trackedPullRequest of trackedOpenPullRequests) {
      if (openPrNumbers.has(trackedPullRequest.prNumber)) {
        continue;
      }

      const lifecycle = await github.fetchPullRequestLifecycle({
        repository: parseRepositorySlug(repoSlug),
        number: trackedPullRequest.prNumber,
        branchName: trackedPullRequest.branchName,
        headSha: trackedPullRequest.headSha,
      });

      if (lifecycle.lifecycleState === 'open') {
        continue;
      }

      console.info(
        [
          'GitHub PR terminal detection',
          `repo=${repoSlug}`,
          `pr=${trackedPullRequest.prNumber}`,
          `lifecycle=${lifecycle.lifecycleState}`,
        ].join(' | '),
      );

      try {
        await signalPullRequestTerminalState({
          pr: lifecycle.pr,
          lifecycleState: lifecycle.lifecycleState,
          observedAt: new Date().toISOString(),
          headSha: lifecycle.pr.headSha,
        });
        signaledWorkflowCount += 1;
      } catch (error) {
        if (!(error instanceof WorkflowNotFoundError)) {
          throw error;
        }

        const workflowId = trackedPullRequest.workflowId;
        const summary = buildTerminalSignalFallbackSummary(
          lifecycle.lifecycleState,
        );
        const errorMessage =
          `Terminal cleanup signal skipped because workflow ${workflowId} was not found. ` +
          'Convex lifecycle state was updated directly, and workspace cleanup did not run.';

        console.warn(
          [
            'GitHub PR terminal detection fallback',
            `repo=${repoSlug}`,
            `pr=${trackedPullRequest.prNumber}`,
            `workflowId=${workflowId}`,
            `lifecycle=${lifecycle.lifecycleState}`,
            'reason=workflow_not_found',
          ].join(' | '),
        );

        await convex.insertWorkflowError({
          repoSlug,
          prNumber: trackedPullRequest.prNumber,
          workflowId,
          errorType: 'terminal_signal_workflow_not_found',
          errorMessage,
          phase: 'terminal_cleanup',
          retryable: false,
          blocked: false,
        });

        await convex.syncPullRequestStatus(lifecycle.pr, {
          workflowId,
          branchName: lifecycle.pr.branchName,
          headSha: lifecycle.pr.headSha,
          lifecycleState: lifecycle.lifecycleState,
          currentPhase: 'terminal_cleanup',
          dirty: false,
          statusSummary: summary,
          blockedReason: null,
        });
      }
    }

    await convex.setPollCursor({
      repoSlug,
      source: 'github',
      cursorKey: 'last_poll_completed_at',
      cursorValue: new Date().toISOString(),
      lastObservedAt: new Date().toISOString(),
    });
  }

  console.info(
    [
      'Poller run complete',
      `repositories=${repositories.length}`,
      `events=${discoveredEventCount}`,
      `signals=${signaledWorkflowCount}`,
      `manualEvents=${manualDrainResult.processedEvents}`,
    ].join(' | '),
  );

  return {
    repositories: repositories.length,
    events: discoveredEventCount,
    signals: signaledWorkflowCount,
  };
}
