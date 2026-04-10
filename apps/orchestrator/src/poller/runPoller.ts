import { signalPullRequestActivity } from '../client.js';
import { formatPrWorkflowId } from '../domain/workflow.js';
import { loadRuntimeConfig } from '../config.js';
import { createAgentRuntimeClient } from '../integrations/agentRuntime.js';
import { createConvexClient } from '../integrations/convex.js';
import { createGitHubClient } from '../integrations/github.js';
import { createWorkspaceManager } from '../integrations/workspace.js';
import { discoverEventsForPullRequest } from './discoverEvents.js';
import { discoverPullRequests } from './discoverPullRequests.js';
import { discoverAllowedRepositories } from './discoverRepos.js';
import { normalizeTerminalEvent } from './normalizeEvent.js';

export interface PollerRunSummary {
  repositories: number;
  events: number;
  signals: number;
}

export async function runPoller(): Promise<PollerRunSummary> {
  const config = loadRuntimeConfig();
  const github = createGitHubClient(config.github);
  const convex = createConvexClient(config.convex);
  const workspaceManager = createWorkspaceManager({
    workspaceRoot: config.workspaceRoot,
    github: config.github,
  });
  const agentRuntime = createAgentRuntimeClient({
    ai: config.ai,
    github: config.github,
    linear: config.linear,
    workspaceManager,
  });

  console.info(
    [
      'Poller scaffold starting',
      `interval=${config.poller.intervalSeconds}s`,
      `allowedRepos=${config.poller.allowedRepos.length}`,
      `allowedAuthor=${config.poller.allowedAuthor ?? 'unset'}`,
    ].join(' | '),
  );

  const repositories = discoverAllowedRepositories(config.poller.allowedRepos);
  let discoveredEventCount = 0;
  let signaledWorkflowCount = 0;

  for (const repository of repositories) {
    const repoSlug = `${repository.owner}/${repository.name}`;

    // Ensure the repo and an empty policy exist in Convex so they are
    // immediately visible in the operator UI, even before any PRs appear.
    await convex.ensureRepoWithPolicy(repository.owner, repository.name);

    const pullRequests = await discoverPullRequests(
      github,
      repository,
      config.poller.allowedAuthor,
    );
    const openPullRequestNumbers = new Set(
      pullRequests.map((pullRequest) => pullRequest.pr.number),
    );

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

    const trackedPullRequests = await convex.listTrackedNonTerminalPullRequests(
      {
        repoSlug,
        limit: 200,
      },
    );

    for (const trackedPullRequest of trackedPullRequests) {
      if (openPullRequestNumbers.has(trackedPullRequest.number)) {
        continue;
      }

      const currentPullRequest = await github.getPullRequest(
        repository,
        trackedPullRequest.number,
      );

      await convex.upsertPullRequest(currentPullRequest.pr);

      if (currentPullRequest.pr.lifecycleState === 'open') {
        continue;
      }

      const event = normalizeTerminalEvent({
        repoSlug,
        pr: currentPullRequest.pr,
        author: currentPullRequest.author,
        observedAt: currentPullRequest.updatedAt,
      });
      const recordResult = await convex.recordGitHubEvent(event);
      if (!recordResult.inserted) {
        continue;
      }

      await signalPullRequestActivity(
        {
          pr: currentPullRequest.pr,
          triggeredBy: 'poller',
        },
        {
          event,
        },
      );
      signaledWorkflowCount += 1;
      discoveredEventCount += 1;
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
    ].join(' | '),
  );

  return {
    repositories: repositories.length,
    events: discoveredEventCount,
    signals: signaledWorkflowCount,
  };
}
