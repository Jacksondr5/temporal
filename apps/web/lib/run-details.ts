/**
 * Typed parsers for prRun.detailsJson and reviewerRun.detailsJson.
 *
 * The orchestrator writes different shapes depending on the run phase
 * and outcome. This module normalises them into discriminated unions
 * so components can render structured views without inline JSON wrangling.
 */

// ── Per-check outcome (fix_checks) ──────────────────────────────────────────

export interface CheckOutcome {
  checkName: string;
  reasoningSummary: string;
  actionSummary: string;
  evidenceSummary: string;
}

// ── Per-thread outcome (handle_code_rabbit) ─────────────────────────────────

export interface ThreadOutcome {
  threadKey: string;
  disposition: "fix" | "false_positive" | "defer";
  reasoningSummary: string;
  actionSummary: string;
  evidenceSummary: string;
  githubCommentId?: string | null;
  linearIssueId?: string | null;
}

// ── Specialized reviewer finding ────────────────────────────────────────────

export interface ReviewerFinding {
  title: string;
  actionSummary: string;
  evidenceSummary: string;
}

// ── Specialized reviewer handoff item ───────────────────────────────────────

export interface HandoffItem {
  targetReviewerId: string | null;
  summary: string;
}

// ── Reviewer pack metadata ──────────────────────────────────────────────────

export interface ReviewerPack {
  repoPath: string;
  repoCommitSha: string | null;
  entrypointPath: string;
  knowledgeFilePaths: string[];
}

// ── AI usage data ───────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number | null;
}

// ── Agent execution result (shared inner shape for fix_checks / code_rabbit)

export interface AgentResult {
  overallSummary: string;
  investigationSummary: string;
  finalAssessment: string;
  whyNoCommit: string | null;
  commandsSummary: string[];
  didModifyCode: boolean;
  didCommitCode: boolean;
  observedCommitSha: string | null;
  checks?: CheckOutcome[];
  threads?: ThreadOutcome[];
}

export interface MergeConflictDetails {
  baseBranchName: string | null;
  baseSha: string | null;
  conflictedFiles: string[];
  mergeOutput: string | null;
}

// ── Specialized reviewer result ─────────────────────────────────────────────

export interface ReviewerResult {
  reviewerId: string;
  matchedFiles: string[];
  overallSummary: string;
  investigationSummary: string;
  finalAssessment: string;
  whyNoCommit: string | null;
  commandsSummary: string[];
  didModifyCode: boolean;
  didCommitCode: boolean;
  observedCommitSha: string | null;
  findings: ReviewerFinding[];
  handoffItems: HandoffItem[];
}

// ── Discriminated union of all known details shapes ─────────────────────────

export interface SuccessRunDetails {
  kind: "success";
  provider: string;
  workspacePath: string | null;
  logFilePath: string | null;
  startingHeadSha: string | null;
  localHeadAfter: string | null;
  remoteHeadAfter: string | null;
  blockedReason: string | null;
  reusedExistingClone: boolean | null;
  usage: TokenUsage | null;
  providerMetadata: Record<string, unknown> | null;
  mergeConflict: MergeConflictDetails | null;
  result: AgentResult;
}

export interface ReviewerSuccessDetails {
  kind: "reviewer_success";
  reviewerId: string;
  provider: string;
  workspacePath: string | null;
  logFilePath: string | null;
  startingHeadSha: string | null;
  localHeadAfter: string | null;
  remoteHeadAfter: string | null;
  blockedReason: string | null;
  reusedExistingClone: boolean | null;
  usage: TokenUsage | null;
  providerMetadata: Record<string, unknown> | null;
  reviewerPack: ReviewerPack | null;
  result: ReviewerResult;
}

export interface FailedRunDetails {
  kind: "failed";
  errorType: string;
  errorMessage: string;
  startingHeadSha: string | null;
  baseBranchName: string | null;
  baseSha: string | null;
  checkNames: string[];
  threadKeys: string[];
}

export interface BlockedRunDetails {
  kind: "blocked";
  provider: string;
  workspacePath: string | null;
  startingHeadSha: string | null;
  localHeadAfter: string | null;
  remoteHeadAfter: string | null;
  blockedReason: string;
  mergeConflict: MergeConflictDetails | null;
}

export interface NoopRunDetails {
  kind: "noop";
  reason: string;
  snapshotHeadSha: string | null;
}

export interface LegacyRunDetails {
  kind: "legacy";
  summary: string;
}

export interface UnknownRunDetails {
  kind: "unknown";
  raw: Record<string, unknown>;
}

export type RunDetails =
  | SuccessRunDetails
  | ReviewerSuccessDetails
  | FailedRunDetails
  | BlockedRunDetails
  | NoopRunDetails
  | LegacyRunDetails
  | UnknownRunDetails;

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseUsage(raw: Record<string, unknown>): TokenUsage | null {
  const u = raw.usage;
  if (!u || typeof u !== "object") return null;
  const usage = u as Record<string, unknown>;
  const inputTokens =
    typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
  const outputTokens =
    typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
  const totalTokens =
    typeof usage.totalTokens === "number"
      ? usage.totalTokens
      : inputTokens + outputTokens;
  const cachedInputTokens =
    typeof usage.cachedInputTokens === "number"
      ? usage.cachedInputTokens
      : null;
  return { inputTokens, outputTokens, totalTokens, cachedInputTokens };
}

function parseProviderMetadata(
  raw: Record<string, unknown>,
): Record<string, unknown> | null {
  const pm = raw.providerMetadata;
  if (!pm || typeof pm !== "object") return null;
  return pm as Record<string, unknown>;
}

function parseReviewerPack(
  raw: Record<string, unknown>,
): ReviewerPack | null {
  const rp = raw.reviewerPack;
  if (!rp || typeof rp !== "object") return null;
  const pack = rp as Record<string, unknown>;
  return {
    repoPath: (pack.repoPath as string) ?? "",
    repoCommitSha: (pack.repoCommitSha as string) ?? null,
    entrypointPath: (pack.entrypointPath as string) ?? "",
    knowledgeFilePaths: Array.isArray(pack.knowledgeFilePaths)
      ? (pack.knowledgeFilePaths as string[])
      : [],
  };
}

function parseMergeConflictDetails(
  raw: Record<string, unknown>,
): MergeConflictDetails | null {
  const hasMergeConflictFields =
    typeof raw.baseBranchName === "string" ||
    typeof raw.baseSha === "string" ||
    Array.isArray(raw.conflictedFiles) ||
    typeof raw.mergeOutput === "string";

  if (!hasMergeConflictFields) {
    return null;
  }

  return {
    baseBranchName: (raw.baseBranchName as string) ?? null,
    baseSha: (raw.baseSha as string) ?? null,
    conflictedFiles: Array.isArray(raw.conflictedFiles)
      ? (raw.conflictedFiles as string[])
      : [],
    mergeOutput: (raw.mergeOutput as string) ?? null,
  };
}

/** Detect whether the branch moved by comparing starting and after SHAs. */
export function didBranchMove(
  details: SuccessRunDetails | ReviewerSuccessDetails,
): boolean {
  const observedCommitSha =
    details.kind === "reviewer_success"
      ? details.result.observedCommitSha
      : details.result.observedCommitSha;
  if (observedCommitSha) return true;
  if (
    details.startingHeadSha &&
    details.remoteHeadAfter &&
    details.startingHeadSha !== details.remoteHeadAfter
  ) {
    return true;
  }
  return false;
}

/** Format large token numbers compactly: 569576 → "570k" */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

// ── Parser (prRuns) ─────────────────────────────────────────────────────────

export function parseRunDetails(detailsJson: string): RunDetails {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(detailsJson);
  } catch {
    return { kind: "legacy", summary: detailsJson };
  }

  // Legacy backfill
  if (raw.status === "legacy_backfill") {
    return {
      kind: "legacy",
      summary: (raw.summary as string) ?? "No details available.",
    };
  }

  // Noop reconciliation (has reason field, no result or errorType)
  if (typeof raw.reason === "string" && !raw.result && !raw.errorType) {
    return {
      kind: "noop",
      reason: raw.reason,
      snapshotHeadSha: (raw.snapshotHeadSha as string) ?? null,
    };
  }

  if (
    typeof raw.blockedReason === "string" &&
    raw.blockedReason.length > 0 &&
    !raw.result &&
    !raw.errorType
  ) {
    return {
      kind: "blocked",
      provider: (raw.provider as string) ?? "unknown",
      workspacePath: (raw.workspacePath as string) ?? null,
      startingHeadSha: (raw.startingHeadSha as string) ?? null,
      localHeadAfter: (raw.localHeadAfter as string) ?? null,
      remoteHeadAfter: (raw.remoteHeadAfter as string) ?? null,
      blockedReason: raw.blockedReason,
      mergeConflict: parseMergeConflictDetails(raw),
    };
  }

  // Specialized reviewer success (has reviewerId at top level + result with findings)
  if (
    raw.result &&
    typeof raw.result === "object" &&
    typeof raw.reviewerId === "string"
  ) {
    const result = raw.result as Record<string, unknown>;
    return {
      kind: "reviewer_success",
      reviewerId: raw.reviewerId as string,
      provider: (raw.provider as string) ?? "unknown",
      workspacePath: (raw.workspacePath as string) ?? null,
      logFilePath: (raw.logFilePath as string) ?? null,
      startingHeadSha: (raw.startingHeadSha as string) ?? null,
      localHeadAfter: (raw.localHeadAfter as string) ?? null,
      remoteHeadAfter: (raw.remoteHeadAfter as string) ?? null,
      blockedReason: (raw.blockedReason as string) ?? null,
      reusedExistingClone: (raw.reusedExistingClone as boolean) ?? null,
      usage: parseUsage(raw),
      providerMetadata: parseProviderMetadata(raw),
      reviewerPack: parseReviewerPack(raw),
      result: {
        reviewerId: (result.reviewerId as string) ?? "",
        matchedFiles: Array.isArray(result.matchedFiles)
          ? (result.matchedFiles as string[])
          : [],
        overallSummary: (result.overallSummary as string) ?? "",
        investigationSummary: (result.investigationSummary as string) ?? "",
        finalAssessment: (result.finalAssessment as string) ?? "",
        whyNoCommit: (result.whyNoCommit as string) ?? null,
        commandsSummary: Array.isArray(result.commandsSummary)
          ? (result.commandsSummary as string[])
          : [],
        didModifyCode: Boolean(result.didModifyCode),
        didCommitCode: Boolean(result.didCommitCode),
        observedCommitSha:
          (result.observedCommitSha as string) ??
          (result.commitSha as string) ??
          null,
        findings: Array.isArray(result.findings)
          ? (result.findings as ReviewerFinding[])
          : [],
        handoffItems: Array.isArray(result.handoffItems)
          ? (result.handoffItems as HandoffItem[])
          : [],
      },
    };
  }

  // Successful agent execution (has result object, no reviewerId)
  if (raw.result && typeof raw.result === "object") {
    const result = raw.result as Record<string, unknown>;
    return {
      kind: "success",
      provider: (raw.provider as string) ?? "unknown",
      workspacePath: (raw.workspacePath as string) ?? null,
      logFilePath: (raw.logFilePath as string) ?? null,
      startingHeadSha: (raw.startingHeadSha as string) ?? null,
      localHeadAfter: (raw.localHeadAfter as string) ?? null,
      remoteHeadAfter: (raw.remoteHeadAfter as string) ?? null,
      blockedReason: (raw.blockedReason as string) ?? null,
      reusedExistingClone: (raw.reusedExistingClone as boolean) ?? null,
      usage: parseUsage(raw),
      providerMetadata: parseProviderMetadata(raw),
      mergeConflict: parseMergeConflictDetails(raw),
      result: {
        overallSummary: (result.overallSummary as string) ?? "",
        investigationSummary: (result.investigationSummary as string) ?? "",
        finalAssessment: (result.finalAssessment as string) ?? "",
        whyNoCommit: (result.whyNoCommit as string) ?? null,
        commandsSummary: Array.isArray(result.commandsSummary)
          ? (result.commandsSummary as string[])
          : [],
        didModifyCode: Boolean(result.didModifyCode),
        didCommitCode: Boolean(result.didCommitCode),
        observedCommitSha:
          (result.observedCommitSha as string) ??
          (result.commitSha as string) ??
          null,
        checks: Array.isArray(result.checks)
          ? (result.checks as CheckOutcome[])
          : undefined,
        threads: Array.isArray(result.threads)
          ? (result.threads as ThreadOutcome[])
          : undefined,
      },
    };
  }

  // Failed run (has errorType)
  if (typeof raw.errorType === "string") {
    return {
      kind: "failed",
      errorType: raw.errorType,
      errorMessage: (raw.errorMessage as string) ?? "",
      startingHeadSha: (raw.startingHeadSha as string) ?? null,
      baseBranchName: (raw.baseBranchName as string) ?? null,
      baseSha: (raw.baseSha as string) ?? null,
      checkNames: Array.isArray(raw.checkNames)
        ? (raw.checkNames as string[])
        : [],
      threadKeys: Array.isArray(raw.threadKeys)
        ? (raw.threadKeys as string[])
        : [],
    };
  }

  // Anything else
  return { kind: "unknown", raw };
}

// ── Parser (reviewerRuns — same detailsJson format, nullable) ───────────────

export function parseReviewerRunDetails(
  detailsJson: string | null,
): RunDetails {
  if (!detailsJson) {
    return { kind: "unknown", raw: {} };
  }
  return parseRunDetails(detailsJson);
}
