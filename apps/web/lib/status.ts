/**
 * Canonical status vocabulary for the operator UI redesign.
 *
 * Every status concept (lifecycle, phase, run status, disposition, error)
 * maps into one of the eight `StatusKind`s defined here. Each kind owns
 * exactly one color and one shape (rendered by `<StatusMark />`) and one
 * canonical rail treatment (rendered by `<StatusRail />`). See
 * `docs/design/status-vocabulary.md` for the source of truth.
 *
 * Internal state-machine labels (`handling_code_rabbit`,
 * `running_special_reviewers`, etc.) translate to operator-friendly prose
 * here too — Operator-mode rendering should never surface a raw enum.
 * Inspector-mode rendering still shows the underlying value verbatim.
 */

export type StatusKind =
  | "live"
  | "healthy"
  | "idle"
  | "caution"
  | "blocked"
  | "deferred"
  | "reviewer"
  | "skipped";

/** All `StatusKind` values, ordered for gallery display in the playground. */
export const STATUS_KINDS: readonly StatusKind[] = [
  "live",
  "healthy",
  "idle",
  "caution",
  "blocked",
  "deferred",
  "reviewer",
  "skipped",
] as const;

/* ──────────────────────────────────────────────────────────────────────────
   Phase mapping (`pullRequests.currentPhase`, `prRuns.phase`)
   ────────────────────────────────────────────────────────────────────── */

const PHASE_TO_STATUS: Record<string, StatusKind> = {
  idle: "idle",
  refreshing: "live",
  fixing_checks: "live",
  handling_code_rabbit: "live",
  running_special_reviewers: "live",
  resolving_merge_conflicts: "live",
  // The orchestrator emits both spellings historically; treat them the same.
  resolve_merge_conflicts: "live",
  recording_results: "live",
  terminal_cleanup: "live",
};

const PHASE_LABELS: Record<string, string> = {
  idle: "Idle",
  refreshing: "Checking GitHub",
  fixing_checks: "Fixing failing checks",
  handling_code_rabbit: "Reviewing CodeRabbit feedback",
  running_special_reviewers: "Running specialized reviewers",
  resolving_merge_conflicts: "Resolving merge conflicts",
  resolve_merge_conflicts: "Resolving merge conflicts",
  recording_results: "Recording results",
  terminal_cleanup: "Cleaning up",
};

/**
 * Past-tense operator verb for a completed phase. The activity-stream cards
 * read more naturally with past tense ("Reviewed CodeRabbit feedback")
 * versus the present participle exposed by `operatorPhaseLabel`
 * ("Reviewing CodeRabbit feedback"). Falls back to the participle form when
 * we don't have an explicit past-tense translation, which keeps Operator
 * mode honest for new orchestrator phases.
 */
const PHASE_PAST_LABELS: Record<string, string> = {
  idle: "Idle",
  refreshing: "Checked GitHub",
  fixing_checks: "Fixed failing checks",
  handling_code_rabbit: "Reviewed CodeRabbit feedback",
  running_special_reviewers: "Ran specialized reviewers",
  resolving_merge_conflicts: "Resolved merge conflicts",
  resolve_merge_conflicts: "Resolved merge conflicts",
  recording_results: "Recorded results",
  terminal_cleanup: "Cleaned up",
};

export function operatorPhasePastLabel(
  phase: string | null | undefined,
): string {
  if (!phase) return "Unknown";
  return PHASE_PAST_LABELS[phase] ?? PHASE_LABELS[phase] ?? phase;
}

/**
 * Translate an internal phase enum into the canonical status vocabulary.
 * Unknown phases fall back to `idle` so a new orchestrator state never
 * crashes the UI; pair the resulting mark with the verbatim phase string
 * if you need the operator to see the unfamiliar value.
 */
export function mapPhaseToStatus(phase: string | null | undefined): StatusKind {
  if (!phase) return "idle";
  return PHASE_TO_STATUS[phase] ?? "idle";
}

/**
 * Operator-language label for a phase, e.g. `handling_code_rabbit` →
 * "Reviewing CodeRabbit feedback". Falls back to the raw value when the
 * phase is not in the translation table, which keeps Operator mode honest
 * while still rendering something readable.
 */
export function operatorPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return "Unknown";
  return PHASE_LABELS[phase] ?? phase;
}

/* ──────────────────────────────────────────────────────────────────────────
   Run-status mapping (`prRuns.status`, `reviewerRuns.status`)
   ────────────────────────────────────────────────────────────────────── */

const RUN_STATUS_TO_STATUS: Record<string, StatusKind> = {
  running: "live",
  success: "healthy",
  completed: "healthy",
  noop: "skipped",
  skipped: "skipped",
  failed: "blocked",
  blocked: "blocked",
};

const RUN_STATUS_LABELS: Record<string, string> = {
  running: "Running",
  success: "Completed",
  completed: "Completed",
  noop: "No-op reconciliation",
  skipped: "Skipped",
  failed: "Failed",
  blocked: "Blocked",
};

/** Map a Convex `prRuns.status` / `reviewerRuns.status` to a canonical kind. */
export function mapRunStatusToStatus(
  status: string | null | undefined,
): StatusKind {
  if (!status) return "idle";
  return RUN_STATUS_TO_STATUS[status] ?? "idle";
}

export function operatorRunStatusLabel(
  status: string | null | undefined,
): string {
  if (!status) return "Unknown";
  return RUN_STATUS_LABELS[status] ?? status;
}

/* ──────────────────────────────────────────────────────────────────────────
   Disposition mapping (`threadDecisions.disposition`)
   ────────────────────────────────────────────────────────────────────── */

const DISPOSITION_TO_STATUS: Record<string, StatusKind> = {
  fix: "healthy",
  false_positive: "caution",
  defer: "deferred",
};

const DISPOSITION_LABELS: Record<string, string> = {
  fix: "Fixed",
  false_positive: "Marked as false positive",
  defer: "Deferred to Linear",
};

/**
 * Map a thread-decision disposition. A null disposition (e.g. an unresolved
 * thread the agent has not visited) maps to `idle` — there is no decision
 * yet, but the surface is still healthy.
 */
export function mapDispositionToStatus(
  disposition: string | null | undefined,
): StatusKind {
  if (!disposition) return "idle";
  return DISPOSITION_TO_STATUS[disposition] ?? "idle";
}

export function operatorDispositionLabel(
  disposition: string | null | undefined,
): string {
  if (!disposition) return "Pending";
  return DISPOSITION_LABELS[disposition] ?? disposition;
}

/* ──────────────────────────────────────────────────────────────────────────
   Error mapping (`workflowErrors.{blocked,retryable}`)
   ────────────────────────────────────────────────────────────────────── */

export interface ErrorStatusInput {
  blocked: boolean;
  retryable: boolean;
}

/**
 * Map a `workflowErrors` row to a canonical kind:
 *   - `blocked: true`            → `blocked` (hard fail, needs operator)
 *   - `retryable: true`          → `caution` (transient, will retry)
 *   - everything else            → `blocked` (still a hard fail per the doc)
 */
export function mapErrorToStatus(error: ErrorStatusInput): StatusKind {
  if (error.blocked) return "blocked";
  if (error.retryable) return "caution";
  return "blocked";
}

/* ──────────────────────────────────────────────────────────────────────────
   Activity-stream event mapping
   ────────────────────────────────────────────────────────────────────── */

/**
 * Canonical status for a top-level activity-stream event. Reviewer runs use
 * the dedicated `reviewer` kind regardless of their underlying run status,
 * so the station-blue small square reads as "this is a specialized reviewer event"
 * even when the reviewer is currently running. Failure and blocking states
 * still override that classification — a failed reviewer reads as a blocked
 * bar, matching the operator's expectation that errors look the same
 * across event sources.
 */
export function mapAgentRunStatusToEventStatus(
  status: string | null | undefined,
): StatusKind {
  return mapRunStatusToStatus(status);
}

export function mapReviewerRunStatusToEventStatus(
  status: string | null | undefined,
): StatusKind {
  const base = mapRunStatusToStatus(status);
  // Failures and blocks override — operators read those as the same shape
  // across all event sources.
  if (base === "blocked" || base === "caution") return base;
  return "reviewer";
}
