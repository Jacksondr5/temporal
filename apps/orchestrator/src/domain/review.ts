import type { GitHubReviewThread, GitHubReviewThreadRef } from './github';

export type ReviewDisposition = 'fix' | 'false_positive' | 'defer';

export interface ReviewArtifactRef {
  kind: 'commit' | 'github_comment' | 'linear_issue';
  id: string;
}

export interface CodeRabbitReviewItem {
  threadKey: string;
  threadRef: GitHubReviewThreadRef;
  body: string;
  path: string | null;
  line: number | null;
  updatedAt: string;
}

export interface SpecializedReviewerRun {
  reviewerId: string;
  targetHeadSha: string;
  matchedFiles: string[];
}

export interface SpecializedReviewerFinding {
  title: string;
  actionSummary: string;
  evidenceSummary: string;
}

export interface SpecializedReviewerHandoffItem {
  targetReviewerId: string | null;
  summary: string;
}

export interface ReviewDecisionSummary {
  disposition: ReviewDisposition;
  reasoningSummary: string;
  artifacts: ReviewArtifactRef[];
}

export interface ReviewDecisionRecord extends ReviewDecisionSummary {
  threadKey: string;
  targetHeadSha: string;
}

export function toCodeRabbitReviewItem(
  thread: GitHubReviewThread,
): CodeRabbitReviewItem {
  return {
    threadKey: thread.key,
    threadRef: thread.threadRef,
    body: thread.body,
    path: thread.path,
    line: thread.line,
    updatedAt: thread.updatedAt,
  };
}
