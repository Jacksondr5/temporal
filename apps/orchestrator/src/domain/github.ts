export interface RepositoryRef {
  owner: string;
  name: string;
}

export function formatRepositoryName(repository: RepositoryRef): string {
  return `${repository.owner}/${repository.name}`;
}

export interface PullRequestRef {
  repository: RepositoryRef;
  number: number;
  branchName: string;
  headSha: string;
}

export interface GitHubActor {
  login: string;
}

export interface GitHubCheckRun {
  name: string;
  conclusion: string | null;
  status: string;
  detailsUrl: string | null;
  appName: string | null;
  appSlug: string | null;
}

export type GitHubCheckState =
  | 'failing'
  | 'passing'
  | 'pending'
  | 'other';

export interface GitHubReviewSummary {
  reviewId: number;
  submittedAt: string;
  state: string;
  body: string | null;
  author: GitHubActor | null;
}

export interface GitHubReviewThreadRef {
  reviewId: number | null;
  commentId: number;
}

export interface GitHubReviewThread {
  key: string;
  threadRef: GitHubReviewThreadRef;
  path: string | null;
  line: number | null;
  body: string;
  isResolved: boolean;
  isOutdated: boolean;
  author: GitHubActor | null;
  updatedAt: string;
}

export interface PullRequestSnapshot {
  pr: PullRequestRef;
  author: GitHubActor | null;
  title: string;
  body: string | null;
  changedFiles: string[];
  checks: GitHubCheckRun[];
  reviewSummaries: GitHubReviewSummary[];
  unresolvedThreads: GitHubReviewThread[];
}

export type GitHubPrEventKind =
  | 'manual'
  | 'pull_request_synchronized'
  | 'pull_request_review_submitted'
  | 'pull_request_review_comment'
  | 'pull_request_checks_changed';

export interface GitHubPrEvent {
  id: string;
  kind: GitHubPrEventKind;
  pr: PullRequestRef;
  observedAt: string;
  actor: GitHubActor | null;
  headSha: string;
  reviewId?: number;
  commentId?: number;
  checkName?: string;
  checkState?: GitHubCheckState;
  previousCheckState?: GitHubCheckState | null;
}
