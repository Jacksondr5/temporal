import { loadRuntimeConfig } from '../config';
import type { CodeRabbitAgentExecution } from '../domain/agentRuntime';
import type { PullRequestRef } from '../domain/github';
import type { ReviewDecisionRecord } from '../domain/review';
import { createConvexClient } from '../integrations/convex';

export async function persistCodeRabbitExecution(input: {
  pr: PullRequestRef;
  execution: CodeRabbitAgentExecution;
}): Promise<void> {
  if (input.execution.status !== 'completed' || input.execution.result === null) {
    return;
  }

  const config = loadRuntimeConfig();
  const convex = createConvexClient(config.convex);
  const repoSlug = `${input.pr.repository.owner}/${input.pr.repository.name}`;
  const commitSha = input.execution.result.observedCommitSha?.trim() || null;

  if (commitSha !== null) {
    await convex.upsertArtifact({
      repoSlug,
      prNumber: input.pr.number,
      artifactKind: 'commit',
      externalId: commitSha,
      correlationKey: `${repoSlug}:pr:${input.pr.number}:commit:${commitSha}`,
      summary: input.execution.result.overallSummary,
    });
  }

  for (const outcome of input.execution.result.outcomes) {
    const artifacts = [];
    if (outcome.githubCommentId !== null) {
      await convex.upsertArtifact({
        repoSlug,
        prNumber: input.pr.number,
        artifactKind: 'github_comment',
        externalId: outcome.githubCommentId,
        correlationKey: `${repoSlug}:pr:${input.pr.number}:thread:${outcome.threadKey}:github_comment:${outcome.githubCommentId}`,
        summary: outcome.reasoningSummary,
      });
      artifacts.push({
        kind: 'github_comment' as const,
        id: outcome.githubCommentId,
      });
    }

    if (outcome.linearIssueId !== null) {
      await convex.upsertArtifact({
        repoSlug,
        prNumber: input.pr.number,
        artifactKind: 'linear_issue',
        externalId: outcome.linearIssueId,
        correlationKey: `${repoSlug}:pr:${input.pr.number}:thread:${outcome.threadKey}:linear_issue:${outcome.linearIssueId}`,
        summary: outcome.reasoningSummary,
      });
      artifacts.push({
        kind: 'linear_issue' as const,
        id: outcome.linearIssueId,
      });
    }

    if (outcome.disposition === 'fix' && commitSha !== null) {
      artifacts.push({
        kind: 'commit' as const,
        id: commitSha,
      });
    }

    const decision: ReviewDecisionRecord = {
      threadKey: outcome.threadKey,
      disposition: outcome.disposition,
      reasoningSummary: outcome.reasoningSummary,
      targetHeadSha: input.pr.headSha,
      artifacts,
    };

    await convex.insertThreadDecision(repoSlug, input.pr.number, decision);
  }
}
