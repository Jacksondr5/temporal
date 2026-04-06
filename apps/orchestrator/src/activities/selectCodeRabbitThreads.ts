import { loadRuntimeConfig } from '../config';
import type { PullRequestSnapshot } from '../domain/github';
import type { CodeRabbitReviewItem } from '../domain/review';
import { toCodeRabbitReviewItem } from '../domain/review';
import { createConvexClient } from '../integrations/convex';

function isCodeRabbitAuthor(login: string | null | undefined): boolean {
  if (!login) {
    return false;
  }

  return login.toLowerCase().includes('coderabbit');
}

export async function selectCodeRabbitThreads(
  snapshot: PullRequestSnapshot,
): Promise<CodeRabbitReviewItem[]> {
  const candidateThreads = snapshot.unresolvedThreads
    .filter((thread) => !thread.isResolved)
    .filter((thread) => !thread.isOutdated)
    .filter((thread) => isCodeRabbitAuthor(thread.author?.login));

  if (candidateThreads.length === 0) {
    return [];
  }

  const runtimeConfig = loadRuntimeConfig();
  const convex = createConvexClient(runtimeConfig.convex);
  const repoSlug = `${snapshot.pr.repository.owner}/${snapshot.pr.repository.name}`;
  const latestDecisions = convex.isConfigured
    ? await convex.getLatestThreadDecisions({
        repoSlug,
        prNumber: snapshot.pr.number,
        threadKeys: candidateThreads.map((thread) => thread.key),
      })
    : [];
  const decisionByThreadKey = new Map(
    latestDecisions.map((decision) => [decision.threadKey, decision]),
  );

  return candidateThreads
    .filter((thread) => {
      const latestDecision = decisionByThreadKey.get(thread.key);
      if (!latestDecision) {
        return true;
      }

      return new Date(thread.updatedAt).getTime() > new Date(latestDecision.createdAt).getTime();
    })
    .map(toCodeRabbitReviewItem);
}
