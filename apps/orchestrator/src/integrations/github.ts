import type { GitHubRuntimeConfig } from '../config.js';
import type {
  GitHubActor,
  GitHubCheckRun,
  GitHubReviewSummary,
  GitHubReviewThread,
  PullRequestSnapshot,
  PullRequestRef,
  RepositoryRef,
} from '../domain/github.js';

export interface GitHubPullRequestListItem {
  pr: PullRequestRef;
  title: string;
  body: string | null;
  author: GitHubActor | null;
  updatedAt: string;
}

interface GitHubApiPullRequest {
  number: number;
  title: string;
  body: string | null;
  head: {
    ref: string;
    sha: string;
  };
  user: {
    login: string;
  } | null;
  updated_at: string;
}

interface GitHubApiPullRequestFile {
  filename: string;
}

interface GitHubApiReview {
  id: number;
  submitted_at: string | null;
  state: string;
  body: string | null;
  user: {
    login: string;
  } | null;
}

interface GitHubApiReviewComment {
  id: number;
  pull_request_review_id: number | null;
  path: string | null;
  line: number | null;
  body: string;
  user: {
    login: string;
  } | null;
  updated_at: string;
}

interface GitHubApiCheckRun {
  name: string;
  conclusion: string | null;
  status: string;
  details_url: string | null;
  html_url: string | null;
  app: {
    name: string | null;
    slug: string | null;
  } | null;
}

interface GitHubApiCheckRunsResponse {
  check_runs: GitHubApiCheckRun[];
}

interface GitHubApiCommitStatus {
  context: string;
  state: 'error' | 'failure' | 'pending' | 'success';
  description: string | null;
  target_url: string | null;
  creator: {
    login: string;
  } | null;
}

interface GitHubApiCombinedStatusResponse {
  statuses: GitHubApiCommitStatus[];
}

interface GitHubGraphQlReviewThreadCommentNode {
  databaseId: number | null;
  body: string;
  updatedAt: string;
  author: {
    login: string;
  } | null;
  pullRequestReview: {
    databaseId: number | null;
  } | null;
}

interface GitHubGraphQlReviewThreadNode {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string | null;
  line: number | null;
  originalLine: number | null;
  resolvedBy: {
    login: string;
  } | null;
  comments: {
    nodes: GitHubGraphQlReviewThreadCommentNode[];
  };
}

interface GitHubGraphQlReviewThreadsResponse {
  repository: {
    pullRequest: {
      reviewThreads: {
        nodes: GitHubGraphQlReviewThreadNode[];
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
      };
    } | null;
  } | null;
}

interface GitHubGraphQlPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface GitHubClient {
  readonly apiUrl: string;
  readonly hasToken: boolean;
  listOpenPullRequests(
    repository: RepositoryRef,
    allowedAuthor: string | null,
  ): Promise<GitHubPullRequestListItem[]>;
  listPullRequestReviews(pr: PullRequestRef): Promise<GitHubReviewSummary[]>;
  listPullRequestReviewThreads(pr: PullRequestRef): Promise<GitHubReviewThread[]>;
  listPullRequestFiles(pr: PullRequestRef): Promise<string[]>;
  listCheckRuns(pr: PullRequestRef): Promise<GitHubCheckRun[]>;
  listCommitStatuses(pr: PullRequestRef): Promise<GitHubCheckRun[]>;
  fetchPullRequestSnapshot(pr: PullRequestRef): Promise<PullRequestSnapshot>;
}

function matchesAllowedAuthor(
  pullAuthorLogin: string | null | undefined,
  allowedAuthor: string | null,
): boolean {
  if (allowedAuthor === null) {
    return true;
  }

  if (!pullAuthorLogin) {
    return false;
  }

  return pullAuthorLogin.toLowerCase() === allowedAuthor.toLowerCase();
}

function toActor(
  user: {
    login: string;
  } | null,
): GitHubActor | null {
  return user ? { login: user.login } : null;
}

async function requestGitHub<TResponse>(
  config: GitHubRuntimeConfig,
  path: string,
  query: Record<string, string | number> = {},
): Promise<TResponse> {
  if (config.token === null) {
    throw new Error('GITHUB_TOKEN is required for GitHub polling.');
  }

  const url = new URL(path, config.apiUrl.endsWith('/') ? config.apiUrl : `${config.apiUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub request failed for ${url.pathname}: ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

async function requestGitHubGraphQl<TResponse>(
  config: GitHubRuntimeConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<TResponse> {
  if (config.token === null) {
    throw new Error('GITHUB_TOKEN is required for GitHub polling.');
  }

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: TResponse;
    errors?: Array<{ message: string }>;
  };

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(
      `GitHub GraphQL request failed: ${payload.errors.map((error) => error.message).join('; ')}`,
    );
  }

  if (!payload.data) {
    throw new Error('GitHub GraphQL request returned no data.');
  }

  return payload.data;
}

function toReviewThread(
  thread: GitHubGraphQlReviewThreadNode,
): GitHubReviewThread | null {
  const rootComment = thread.comments.nodes[0];
  if (!rootComment || rootComment.databaseId === null) {
    return null;
  }

  const latestComment =
    thread.comments.nodes[thread.comments.nodes.length - 1] ?? rootComment;

  return {
    key: `comment:${rootComment.databaseId}`,
    threadRef: {
      reviewId: rootComment.pullRequestReview?.databaseId ?? null,
      commentId: rootComment.databaseId,
    },
    path: thread.path,
    line: thread.line ?? thread.originalLine,
    body: rootComment.body,
    isResolved: thread.isResolved,
    isOutdated: thread.isOutdated,
    author: toActor(rootComment.author),
    updatedAt: latestComment.updatedAt,
  };
}

export function createGitHubClient(config: GitHubRuntimeConfig): GitHubClient {
  return {
    apiUrl: config.apiUrl,
    hasToken: config.token !== null,
    listOpenPullRequests: async (repository, allowedAuthor) => {
      const pulls = await requestGitHub<GitHubApiPullRequest[]>(
        config,
        `/repos/${repository.owner}/${repository.name}/pulls`,
        {
          state: 'open',
          per_page: 100,
        },
      );

      const matchingPulls = pulls.filter((pull) =>
        matchesAllowedAuthor(pull.user?.login, allowedAuthor),
      );

      console.info(
        [
          'GitHub PR discovery',
          `repo=${repository.owner}/${repository.name}`,
          `totalOpenPulls=${pulls.length}`,
          `matchingPulls=${matchingPulls.length}`,
          `authorFilter=${allowedAuthor ?? 'unset'}`,
        ].join(' | '),
      );

      return matchingPulls
        .map((pull) => ({
          pr: {
            repository,
            number: pull.number,
            branchName: pull.head.ref,
            headSha: pull.head.sha,
          },
          title: pull.title,
          body: pull.body,
          author: toActor(pull.user),
          updatedAt: pull.updated_at,
        }));
    },
    listPullRequestReviews: async (pr) => {
      const reviews = await requestGitHub<GitHubApiReview[]>(
        config,
        `/repos/${pr.repository.owner}/${pr.repository.name}/pulls/${pr.number}/reviews`,
        {
          per_page: 100,
        },
      );

      return reviews.map((review) => ({
        reviewId: review.id,
        submittedAt: review.submitted_at ?? new Date(0).toISOString(),
        state: review.state,
        body: review.body,
        author: toActor(review.user),
      }));
    },
    listPullRequestReviewThreads: async (pr) => {
      const query = `
        query PullRequestReviewThreads(
          $owner: String!
          $name: String!
          $number: Int!
          $cursor: String
        ) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $number) {
              reviewThreads(first: 100, after: $cursor) {
                nodes {
                  id
                  isResolved
                  isOutdated
                  path
                  line
                  originalLine
                  resolvedBy {
                    login
                  }
                  comments(first: 100) {
                    nodes {
                      databaseId
                      body
                      updatedAt
                      author {
                        login
                      }
                      pullRequestReview {
                        databaseId
                      }
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      `;

      const threads: GitHubReviewThread[] = [];
      let cursor: string | null = null;

      while (true) {
        const data: GitHubGraphQlReviewThreadsResponse =
          await requestGitHubGraphQl<GitHubGraphQlReviewThreadsResponse>(
          config,
          query,
          {
            owner: pr.repository.owner,
            name: pr.repository.name,
            number: pr.number,
            cursor,
          },
        );

        const reviewThreads =
          data.repository?.pullRequest?.reviewThreads.nodes ?? [];
        for (const thread of reviewThreads) {
          const normalized = toReviewThread(thread);
          if (normalized) {
            threads.push(normalized);
          }
        }

        const pageInfo: GitHubGraphQlPageInfo | undefined =
          data.repository?.pullRequest?.reviewThreads.pageInfo;
        if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
          break;
        }

        cursor = pageInfo.endCursor;
      }

      return threads;
    },
    listPullRequestFiles: async (pr) => {
      const files = await requestGitHub<GitHubApiPullRequestFile[]>(
        config,
        `/repos/${pr.repository.owner}/${pr.repository.name}/pulls/${pr.number}/files`,
        {
          per_page: 100,
        },
      );

      return files.map((file) => file.filename);
    },
    listCheckRuns: async (pr) => {
      const response = await requestGitHub<GitHubApiCheckRunsResponse>(
        config,
        `/repos/${pr.repository.owner}/${pr.repository.name}/commits/${pr.headSha}/check-runs`,
        {
          per_page: 100,
        },
      );

      return response.check_runs.map((checkRun) => ({
        name: checkRun.name,
        conclusion: checkRun.conclusion,
        status: checkRun.status,
        detailsUrl: checkRun.details_url ?? checkRun.html_url ?? null,
        appName: checkRun.app?.name ?? null,
        appSlug: checkRun.app?.slug ?? null,
      }));
    },
    listCommitStatuses: async (pr) => {
      const response = await requestGitHub<GitHubApiCombinedStatusResponse>(
        config,
        `/repos/${pr.repository.owner}/${pr.repository.name}/commits/${pr.headSha}/status`,
      );

      // Map commit statuses into the same GitHubCheckRun shape so the
      // rest of the system (classifyChecks, policy matching) treats them
      // uniformly.
      return response.statuses.map((status) => ({
        name: status.context,
        conclusion: status.state === 'pending' ? null : status.state,
        status: status.state === 'pending' ? 'in_progress' : 'completed',
        detailsUrl: status.target_url,
        appName: status.creator?.login ?? null,
        appSlug: null,
      }));
    },
    fetchPullRequestSnapshot: async (pr) => {
      const pullRequest = await requestGitHub<GitHubApiPullRequest>(
        config,
        `/repos/${pr.repository.owner}/${pr.repository.name}/pulls/${pr.number}`,
      );

      const currentPrRef: PullRequestRef = {
        repository: pr.repository,
        number: pullRequest.number,
        branchName: pullRequest.head.ref,
        headSha: pullRequest.head.sha,
      };

      const client = createGitHubClient(config);

      const [reviews, unresolvedThreads, checkRuns, commitStatuses, changedFiles] =
        await Promise.all([
          (async () => await client.listPullRequestReviews(currentPrRef))(),
          (async () => await client.listPullRequestReviewThreads(currentPrRef))(),
          (async () => await client.listCheckRuns(currentPrRef))(),
          (async () => await client.listCommitStatuses(currentPrRef))(),
          (async () => await client.listPullRequestFiles(currentPrRef))(),
        ]);

      // Merge check runs and commit statuses into a single list.
      // Dedupe by name in case a check run and a commit status share
      // the same name (check runs take precedence).
      const checksByName = new Map(checkRuns.map((c) => [c.name, c]));
      for (const status of commitStatuses) {
        if (!checksByName.has(status.name)) {
          checksByName.set(status.name, status);
        }
      }

      return {
        pr: currentPrRef,
        author: toActor(pullRequest.user),
        title: pullRequest.title,
        body: pullRequest.body,
        changedFiles,
        checks: Array.from(checksByName.values()),
        reviewSummaries: reviews,
        unresolvedThreads,
      };
    },
  };
}
