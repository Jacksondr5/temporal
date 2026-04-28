import type { PullRequestSnapshot } from '../domain/github.js';
import type {
  CheckClassificationResult,
  RepositoryPolicy,
} from '../domain/policy.js';

export async function classifyChecks(
  snapshot: PullRequestSnapshot,
  policy: RepositoryPolicy | null,
): Promise<CheckClassificationResult[]> {
  return snapshot.checks.map((check) => {
    const isFixablePolicyMatch =
      policy !== null && policy.enabledStatusChecks.includes(check.name);
    const isFailing =
      check.conclusion === 'failure' ||
      check.conclusion === 'timed_out' ||
      check.conclusion === 'cancelled' ||
      check.conclusion === 'startup_failure';

    const classification =
      policy === null
        ? 'informational'
        : isFixablePolicyMatch && isFailing
          ? 'fixable_blocking'
          : 'informational';

    return {
      name: check.name,
      classification,
    };
  });
}
