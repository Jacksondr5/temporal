import { loadRuntimeConfig } from '../config';
import type { FixChecksAgentExecution } from '../domain/agentRuntime';
import type { PullRequestRef } from '../domain/github';
import { createConvexClient } from '../integrations/convex';

export async function persistFixChecksExecution(input: {
  pr: PullRequestRef;
  execution: FixChecksAgentExecution;
}): Promise<void> {
  if (input.execution.status !== 'completed' || input.execution.result === null) {
    return;
  }

  const config = loadRuntimeConfig();
  const convex = createConvexClient(config.convex);
  const repoSlug = `${input.pr.repository.owner}/${input.pr.repository.name}`;
  const commitSha = input.execution.result.observedCommitSha?.trim() || null;

  if (commitSha === null) {
    return;
  }

  await convex.upsertArtifact({
    repoSlug,
    prNumber: input.pr.number,
    artifactKind: 'commit',
    externalId: commitSha,
    correlationKey: `${repoSlug}:pr:${input.pr.number}:fix-checks:${commitSha}`,
    summary: input.execution.result.overallSummary,
  });
}
