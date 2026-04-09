import { signalPullRequestActivity } from './client.js';
import { loadRuntimeConfig } from './config.js';
import type { GitHubPrEvent } from './domain/github.js';
import type { RepositoryRef } from './domain/github.js';
import { createGitHubClient } from './integrations/github.js';

interface ManualSignalArgs {
  repo: string;
  prNumber: number;
}

function parseArgs(argv: string[]): ManualSignalArgs {
  let repo: string | null = null;
  let prNumber: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--repo') {
      repo = next ?? null;
      index += 1;
      continue;
    }

    if (arg === '--pr') {
      prNumber = next ? Number.parseInt(next, 10) : null;
      index += 1;
      continue;
    }
  }

  if (repo === null || prNumber === null || !Number.isFinite(prNumber)) {
    throw new Error('Usage: pnpm signal-pr --repo owner/name --pr 123');
  }

  return { repo, prNumber };
}

function parseRepositorySlug(slug: string): RepositoryRef {
  const [owner, name] = slug.split('/');
  if (!owner || !name) {
    throw new Error(`Invalid repo slug "${slug}". Expected owner/name.`);
  }

  return { owner, name };
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadRuntimeConfig();
  const github = createGitHubClient(config.github);
  const repository = parseRepositorySlug(args.repo);

  const pullRequests = await github.listOpenPullRequests(repository, null);
  const pullRequest = pullRequests.find((candidate) => candidate.pr.number === args.prNumber);

  if (!pullRequest) {
    throw new Error(
      `Open pull request not found for ${args.repo}#${args.prNumber}.`,
    );
  }

  const observedAt = new Date().toISOString();
  const event: GitHubPrEvent = {
    id: `manual:${args.repo}:${args.prNumber}:${observedAt}`,
    kind: 'manual',
    pr: pullRequest.pr,
    observedAt,
    actor: pullRequest.author,
    headSha: pullRequest.pr.headSha,
  };

  const workflowId = await signalPullRequestActivity(
    {
      pr: pullRequest.pr,
      triggeredBy: 'manual-signal',
    },
    {
      event,
    },
  );

  console.info(
    [
      'Signaled PR workflow',
      `workflowId=${workflowId}`,
      `repo=${args.repo}`,
      `pr=${args.prNumber}`,
      `headSha=${pullRequest.pr.headSha}`,
      `eventId=${event.id}`,
    ].join(' | '),
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
