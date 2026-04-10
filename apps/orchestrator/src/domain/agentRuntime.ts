import type { LanguageModelUsage, ProviderMetadata } from 'ai';
import { z } from 'zod';
import type { GitHubCheckRun, PullRequestSnapshot } from './github.js';
import type {
  CodeRabbitReviewItem,
  ReviewDisposition,
  SpecializedReviewerFinding,
  SpecializedReviewerHandoffItem,
} from './review.js';

export type AgentProvider = 'codex' | 'claude_code';

export interface PreparedPullRequestWorkspace {
  path: string;
  repoSlug: string;
  branchName: string;
  headSha: string;
  reusedExistingClone: boolean;
}

export interface PreparedMergeConflictWorkspace extends PreparedPullRequestWorkspace {
  baseBranchName: string;
  baseSha: string;
  mergeAttemptStatus: 'clean_merge' | 'conflicted';
  mergeOutput: string;
  conflictedFiles: string[];
}

export type AgentExecutionStatus = 'completed' | 'skipped' | 'blocked';

export interface MergeConflictAgentRunInput {
  snapshot: PullRequestSnapshot;
  baseBranchName: string;
  baseSha: string;
  provider?: AgentProvider;
}

export interface CodeRabbitAgentRunInput {
  snapshot: PullRequestSnapshot;
  items: CodeRabbitReviewItem[];
  contextNote?: string | null;
  provider?: AgentProvider;
}

export interface FixChecksAgentRunInput {
  snapshot: PullRequestSnapshot;
  checks: GitHubCheckRun[];
  provider?: AgentProvider;
}

export interface SpecializedReviewerAgentRunInput {
  snapshot: PullRequestSnapshot;
  reviewer: {
    id: string;
    description: string;
    matchedFiles: string[];
  };
  reviewerPack: {
    repoPath: string;
    repoCommitSha: string | null;
    entrypointPath: string;
    knowledgeFilePaths: string[];
  };
  priorReviewerSummaries: Array<{
    reviewerId: string;
    summary: string;
    handoffItems: SpecializedReviewerHandoffItem[];
  }>;
  laterReviewers: Array<{
    reviewerId: string;
    description: string;
  }>;
  provider?: AgentProvider;
}

export const codeRabbitThreadOutcomeSchema = z.object({
  threadKey: z.string(),
  disposition: z.enum(['fix', 'false_positive', 'defer']),
  reasoningSummary: z.string().min(1),
  actionSummary: z.string().min(1),
  evidenceSummary: z.string().min(1),
  githubCommentId: z.string().nullable(),
  linearIssueId: z.string().nullable(),
});

export const mergeConflictResultSchema = z.object({
  overallSummary: z.string().min(1),
  investigationSummary: z.string().min(1),
  finalAssessment: z.string().min(1),
  whyNoCommit: z.string().nullable(),
  commandsSummary: z.array(z.string()),
  didModifyCode: z.boolean(),
  didCommitCode: z.boolean(),
  observedCommitSha: z.string().nullable().optional(),
});

export type MergeConflictAgentResult = z.infer<typeof mergeConflictResultSchema>;

export interface MergeConflictAgentExecution {
  status: AgentExecutionStatus;
  provider: AgentProvider;
  workspace: PreparedMergeConflictWorkspace | null;
  logFilePath: string | null;
  startingHeadSha: string | null;
  localHeadAfter: string | null;
  remoteHeadAfter: string | null;
  summary: string;
  blockedReason: string | null;
  usage: LanguageModelUsage | null;
  providerMetadata: ProviderMetadata | null;
  result: MergeConflictAgentResult | null;
}

export const codeRabbitBatchResultSchema = z.object({
  overallSummary: z.string().min(1),
  investigationSummary: z.string().min(1),
  finalAssessment: z.string().min(1),
  whyNoCommit: z.string().nullable(),
  commandsSummary: z.array(z.string()),
  didModifyCode: z.boolean(),
  didCommitCode: z.boolean(),
  observedCommitSha: z.string().nullable().optional(),
  outcomes: z.array(codeRabbitThreadOutcomeSchema).min(1),
});

export type CodeRabbitThreadOutcome = z.infer<typeof codeRabbitThreadOutcomeSchema>;
export type CodeRabbitBatchResult = z.infer<typeof codeRabbitBatchResultSchema>;

export interface AgentUsageDetails {
  usage: LanguageModelUsage | null;
  providerMetadata: ProviderMetadata | null;
}

export interface CodeRabbitAgentExecution {
  status: 'completed' | 'skipped';
  provider: AgentProvider;
  workspace: PreparedPullRequestWorkspace | null;
  logFilePath: string | null;
  startingHeadSha: string | null;
  localHeadAfter: string | null;
  remoteHeadAfter: string | null;
  summary: string;
  blockedReason: string | null;
  usage: LanguageModelUsage | null;
  providerMetadata: ProviderMetadata | null;
  result: CodeRabbitBatchResult | null;
}

export const fixCheckOutcomeSchema = z.object({
  checkName: z.string(),
  reasoningSummary: z.string().min(1),
  actionSummary: z.string().min(1),
  evidenceSummary: z.string().min(1),
});

export const fixChecksBatchResultSchema = z.object({
  overallSummary: z.string().min(1),
  investigationSummary: z.string().min(1),
  finalAssessment: z.string().min(1),
  whyNoCommit: z.string().nullable(),
  commandsSummary: z.array(z.string()),
  didModifyCode: z.boolean(),
  didCommitCode: z.boolean(),
  observedCommitSha: z.string().nullable().optional(),
  checks: z.array(fixCheckOutcomeSchema).min(1),
});

export type FixCheckOutcome = z.infer<typeof fixCheckOutcomeSchema>;
export type FixChecksBatchResult = z.infer<typeof fixChecksBatchResultSchema>;

export interface FixChecksAgentExecution {
  status: 'completed' | 'skipped';
  provider: AgentProvider;
  workspace: PreparedPullRequestWorkspace | null;
  logFilePath: string | null;
  startingHeadSha: string | null;
  localHeadAfter: string | null;
  remoteHeadAfter: string | null;
  summary: string;
  blockedReason: string | null;
  usage: LanguageModelUsage | null;
  providerMetadata: ProviderMetadata | null;
  result: FixChecksBatchResult | null;
}

export const specializedReviewerFindingSchema = z.object({
  title: z.string().min(1),
  actionSummary: z.string().min(1),
  evidenceSummary: z.string().min(1),
});

export const specializedReviewerHandoffItemSchema = z.object({
  targetReviewerId: z.string().nullable(),
  summary: z.string().min(1),
});

export const specializedReviewerResultSchema = z.object({
  reviewerId: z.string().min(1),
  matchedFiles: z.array(z.string()),
  overallSummary: z.string().min(1),
  investigationSummary: z.string().min(1),
  finalAssessment: z.string().min(1),
  whyNoCommit: z.string().nullable(),
  commandsSummary: z.array(z.string()),
  didModifyCode: z.boolean(),
  didCommitCode: z.boolean(),
  observedCommitSha: z.string().nullable().optional(),
  findings: z.array(specializedReviewerFindingSchema),
  handoffItems: z.array(specializedReviewerHandoffItemSchema),
});

export type SpecializedReviewerResult = z.infer<typeof specializedReviewerResultSchema>;

export interface SpecializedReviewerExecution {
  status: 'completed' | 'skipped';
  provider: AgentProvider;
  workspace: PreparedPullRequestWorkspace | null;
  logFilePath: string | null;
  startingHeadSha: string | null;
  localHeadAfter: string | null;
  remoteHeadAfter: string | null;
  summary: string;
  blockedReason: string | null;
  usage: LanguageModelUsage | null;
  providerMetadata: ProviderMetadata | null;
  result: SpecializedReviewerResult | null;
}

export interface NormalizedCodeRabbitThreadOutcome {
  threadKey: string;
  disposition: ReviewDisposition;
  reasoningSummary: string;
  githubCommentId: string | null;
  linearIssueId: string | null;
}

export function normalizeCodeRabbitOutcomes(
  items: CodeRabbitReviewItem[],
  result: CodeRabbitBatchResult,
): NormalizedCodeRabbitThreadOutcome[] {
  if (result.didCommitCode && !result.didModifyCode) {
    throw new Error('Code Rabbit agent reported didCommitCode=true while didModifyCode=false.');
  }

  if (!result.didCommitCode && result.whyNoCommit === null) {
    throw new Error('Code Rabbit agent must explain why no commit was created when didCommitCode=false.');
  }

  const expectedThreadKeys = new Set(items.map((item) => item.threadKey));
  const seenThreadKeys = new Set<string>();

  for (const outcome of result.outcomes) {
    if (!expectedThreadKeys.has(outcome.threadKey)) {
      throw new Error(
        `Agent returned outcome for unexpected thread "${outcome.threadKey}".`,
      );
    }

    if (seenThreadKeys.has(outcome.threadKey)) {
      throw new Error(
        `Agent returned duplicate outcome for thread "${outcome.threadKey}".`,
      );
    }

    seenThreadKeys.add(outcome.threadKey);
  }

  const missingThreadKeys = [...expectedThreadKeys].filter(
    (threadKey) => !seenThreadKeys.has(threadKey),
  );
  if (missingThreadKeys.length > 0) {
    throw new Error(
      `Agent did not address all Code Rabbit threads. Missing: ${missingThreadKeys.join(', ')}`,
    );
  }

  return result.outcomes;
}

export function normalizeMergeConflictResult(
  result: MergeConflictAgentResult,
): MergeConflictAgentResult {
  if (result.didCommitCode && !result.didModifyCode) {
    throw new Error(
      'Merge-conflict agent reported didCommitCode=true while didModifyCode=false.',
    );
  }

  if (!result.didCommitCode && result.whyNoCommit === null) {
    throw new Error(
      'Merge-conflict agent must explain why no commit was created when didCommitCode=false.',
    );
  }

  return result;
}

export function normalizeFixCheckOutcomes(
  checks: GitHubCheckRun[],
  result: FixChecksBatchResult,
): FixCheckOutcome[] {
  if (result.didCommitCode && !result.didModifyCode) {
    throw new Error('Fix-check agent reported didCommitCode=true while didModifyCode=false.');
  }

  if (!result.didCommitCode && result.whyNoCommit === null) {
    throw new Error('Fix-check agent must explain why no commit was created when didCommitCode=false.');
  }

  const expectedCheckNames = new Set(checks.map((check) => check.name));
  const seenCheckNames = new Set<string>();

  for (const outcome of result.checks) {
    if (!expectedCheckNames.has(outcome.checkName)) {
      throw new Error(
        `Agent returned outcome for unexpected check "${outcome.checkName}".`,
      );
    }

    if (seenCheckNames.has(outcome.checkName)) {
      throw new Error(
        `Agent returned duplicate outcome for check "${outcome.checkName}".`,
      );
    }

    seenCheckNames.add(outcome.checkName);
  }

  const missingCheckNames = [...expectedCheckNames].filter(
    (checkName) => !seenCheckNames.has(checkName),
  );
  if (missingCheckNames.length > 0) {
    throw new Error(
      `Agent did not address all fixable checks. Missing: ${missingCheckNames.join(', ')}`,
    );
  }

  return result.checks;
}

export function normalizeSpecializedReviewerResult(
  input: SpecializedReviewerAgentRunInput,
  result: SpecializedReviewerResult,
): {
  findings: SpecializedReviewerFinding[];
  handoffItems: SpecializedReviewerHandoffItem[];
} {
  if (result.reviewerId !== input.reviewer.id) {
    throw new Error(
      `Specialized reviewer returned reviewerId "${result.reviewerId}" but expected "${input.reviewer.id}".`,
    );
  }

  if (result.didCommitCode && !result.didModifyCode) {
    throw new Error(
      `Specialized reviewer "${input.reviewer.id}" reported didCommitCode=true while didModifyCode=false.`,
    );
  }

  if (!result.didCommitCode && result.whyNoCommit === null) {
    throw new Error(
      `Specialized reviewer "${input.reviewer.id}" must explain why no commit was created when didCommitCode=false.`,
    );
  }

  return {
    findings: result.findings,
    handoffItems: result.handoffItems,
  };
}
