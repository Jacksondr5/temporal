import { signalPullRequestActivity } from '../client';
import { formatPrWorkflowId } from '../domain/workflow';
import { loadRuntimeConfig } from '../config';
import { createAgentRuntimeClient } from '../integrations/agentRuntime';
import { createConvexClient } from '../integrations/convex';
import { createGitHubClient } from '../integrations/github';
import { createLinearClient } from '../integrations/linear';
import { createWorkspaceManager } from '../integrations/workspace';
import { discoverEventsForPullRequest } from './discoverEvents';
import { discoverPullRequests } from './discoverPullRequests';
import { discoverAllowedRepositories } from './discoverRepos';

export async function runPoller(): Promise<void> {
  const config = loadRuntimeConfig();
  const github = createGitHubClient(config.github);
  const convex = createConvexClient(config.convex);
  const linear = createLinearClient(config.linear);
  const workspaceManager =
    config.workspaceRoot === null
      ? null
      : createWorkspaceManager({
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
      `githubConfigured=${github.hasToken}`,
      `convexConfigured=${convex.isConfigured}`,
      `linearConfigured=${linear.hasApiKey}`,
      `agentConfigured=${agentRuntime.configured}`,
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
}
