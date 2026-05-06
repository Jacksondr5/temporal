"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  Forward,
  RotateCw,
  Zap,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { cn } from "../lib/utils";
import {
  parseRunDetails,
  parseReviewerRunDetails,
  type ReviewerSuccessDetails,
  type SuccessRunDetails,
  type RunDetails,
} from "../lib/run-details";
import {
  mapAgentRunStatusToEventStatus,
  mapErrorToStatus,
  mapReviewerRunStatusToEventStatus,
  operatorPhaseLabel,
  operatorPhasePastLabel,
  type StatusKind,
} from "../lib/status";
import { TimeAgo } from "./time-ago";
import { StatusMark } from "./status-mark";
import { CommitChip, type CommitStats } from "./commit-chip";
import { AgentReasoning } from "./agent-reasoning";

/**
 * Event-card components rendered inside the operator activity stream
 * (`<ActivityStream />`). Each card renders one of the four event types
 * returned by `ui.listActivityStreamEvents` plus a small set of operator-only
 * affordances:
 *
 * - Status mark on the spine + canonical color/shape from `lib/status`
 * - Time verb ("4m ago — Reviewing CodeRabbit feedback")
 * - One-line summary
 * - Inline `<CommitChip />` for runs that pushed a commit
 * - Expand toggle revealing Story-layer agent reasoning
 *
 * These cards intentionally hide Inspector-only fields (token usage, provider
 * metadata, command summaries, raw JSON, internal phase enums). Inspector
 * variants are tracked under JAC-190 and live in their own tree.
 */

type ActivityStreamPage = FunctionReturnType<
  typeof api.ui.listActivityStreamEvents
>["page"];

export type ActivityStreamEvent = ActivityStreamPage[number];

export type AgentRunSource = Extract<
  ActivityStreamEvent,
  { eventType: "agent_run" }
>["source"];
export type ReviewerRunSource = Extract<
  ActivityStreamEvent,
  { eventType: "reviewer_run" }
>["source"];
export type WorkflowErrorSource = Extract<
  ActivityStreamEvent,
  { eventType: "workflow_error" }
>["source"];
export type GithubEventSource = Extract<
  ActivityStreamEvent,
  { eventType: "github_event" }
>["source"];

/**
 * Lightweight commit-artifact shape consumed by event cards. Cards take a
 * lookup function rather than an array so callers can build the index once
 * (e.g. by `externalId`) and avoid an O(events × artifacts) scan.
 */
export interface CommitArtifactInfo {
  message: string | null;
  stats: CommitStats | null;
}

export type CommitArtifactLookup = (
  sha: string,
) => CommitArtifactInfo | undefined;

const MANUAL_EVENT_CLAIM_STALE_MS = 5 * 60 * 1000;

/* ──────────────────────────────────────────────────────────────────────────
   Shared layout
   ────────────────────────────────────────────────────────────────────── */

interface EventCardShellProps {
  status: StatusKind;
  eventTime: string | null;
  /** Operator-language verb, e.g. "Reviewed CodeRabbit feedback". */
  verb: string;
  /** Optional one-line summary rendered next to the verb. */
  summary?: string | null;
  /** Optional collapsed-state extras (e.g. inline `<CommitChip />`). */
  collapsedExtras?: React.ReactNode;
  /** Expanded body (Story layer). When omitted, the card is not expandable. */
  expandedBody?: React.ReactNode;
  /** Used by tests / scrolling, not for visible labelling. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Common shell for every event card: spine dot, time, verb, summary, an
 * optional inline extras row (commit chip) and an expandable body. Centralises
 * the layout so the cards stay visually coherent across event types.
 */
function EventCardShell({
  status,
  eventTime,
  verb,
  summary,
  collapsedExtras,
  expandedBody,
  ariaLabel,
  className,
}: EventCardShellProps) {
  const [expanded, setExpanded] = useState(false);
  const isExpandable = expandedBody !== undefined && expandedBody !== null;

  return (
    <div
      className={cn(
        "relative rounded-md border border-border-hairline bg-surface-panel/60",
        className,
      )}
      aria-label={ariaLabel}
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <span className="mt-0.5 shrink-0">
          <StatusMark status={status} size="md" />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <TimeAgo date={eventTime} className="shrink-0" />
            <span className="text-body font-medium text-foreground">
              {verb}
            </span>
            {summary && (
              <span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">
                {summary}
              </span>
            )}
          </div>

          {collapsedExtras}
        </div>

        {isExpandable && (
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            aria-label={expanded ? "Collapse event" : "Expand event"}
            aria-expanded={expanded}
            className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
      </div>

      {isExpandable && expanded && (
        <div className="border-t border-border-hairline px-3 py-3">
          {expandedBody}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Agent run card (`prRuns`)
   ────────────────────────────────────────────────────────────────────── */

export interface AgentRunEventCardProps {
  run: AgentRunSource;
  eventTime: string | null;
  repoSlug: string;
  lookupCommit?: CommitArtifactLookup;
}

export function AgentRunEventCard({
  run,
  eventTime,
  repoSlug,
  lookupCommit,
}: AgentRunEventCardProps) {
  const details = parseRunDetails(run.detailsJson);
  const status = mapAgentRunStatusToEventStatus(run.status);
  const verb = agentRunVerb(run.phase, run.status, details);

  // Failed runs render the error story (`errorType` + `errorMessage` +
  // `errorStack`) inline by default per JAC-188 and Principle 10:
  // stack traces are not truncated, parsed, or hidden behind an expand
  // gate. The same `<ErrorBody />` powers the workflow-error card so the
  // two surfaces stay visually consistent.
  if (details.kind === "failed") {
    return (
      <EventCardShell
        status={status}
        eventTime={eventTime}
        verb={verb}
        collapsedExtras={
          <ErrorBody
            errorType={details.errorType}
            errorMessage={details.errorMessage}
            errorStack={details.errorStack}
          />
        }
        ariaLabel={`Agent run ${run.phase} ${run.status}`}
      />
    );
  }

  const observedCommitSha = getObservedCommitSha(details);
  const summary = oneLineSummary(run.summary ?? null, details);

  const commitChip = observedCommitSha ? (
    <AgentRunCommitChip
      sha={observedCommitSha}
      repoSlug={repoSlug}
      runSummary={run.summary ?? null}
      lookupCommit={lookupCommit}
    />
  ) : null;

  const expandedBody = renderAgentRunStoryLayer(details);

  return (
    <EventCardShell
      status={status}
      eventTime={eventTime}
      verb={verb}
      summary={summary}
      collapsedExtras={commitChip}
      expandedBody={expandedBody}
      ariaLabel={`Agent run ${run.phase} ${run.status}`}
    />
  );
}

function AgentRunCommitChip({
  sha,
  repoSlug,
  runSummary,
  lookupCommit,
}: {
  sha: string;
  repoSlug: string;
  runSummary: string | null;
  lookupCommit?: CommitArtifactLookup;
}) {
  const artifact = lookupCommit?.(sha);
  // Per Gap 3 in the redesign doc, when the orchestrator hasn't persisted
  // the real commit message we fall back to the agent's run summary as the
  // chip subtitle. This keeps the visual contract intact while the backend
  // catches up.
  const message = artifact?.message ?? runSummary ?? "";
  const stats = artifact?.stats ?? null;

  return (
    <div className="pt-1.5">
      <CommitChip
        repoSlug={repoSlug}
        sha={sha}
        message={message}
        stats={stats}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Reviewer run card (`reviewerRuns`)
   ────────────────────────────────────────────────────────────────────── */

export interface ReviewerEventCardProps {
  run: ReviewerRunSource;
  eventTime: string | null;
  repoSlug: string;
  lookupCommit?: CommitArtifactLookup;
}

export function ReviewerEventCard({
  run,
  eventTime,
  repoSlug,
  lookupCommit,
}: ReviewerEventCardProps) {
  const details = parseReviewerRunDetails(run.detailsJson);
  const status = mapReviewerRunStatusToEventStatus(run.status);
  const verb = reviewerRunVerb(run.reviewerId, run.status, details);

  if (details.kind === "failed") {
    return (
      <EventCardShell
        status={status}
        eventTime={eventTime}
        verb={verb}
        summary={reviewerSummaryLine(run.summary ?? null, details)}
        collapsedExtras={renderReviewerStoryLayer(run.matchedFiles, details)}
        ariaLabel={`Specialized reviewer ${run.reviewerId} ${run.status}`}
      />
    );
  }

  const observedCommitSha = getObservedCommitSha(details);
  const summary = reviewerSummaryLine(run.summary ?? null, details);

  const commitChip = observedCommitSha ? (
    <AgentRunCommitChip
      sha={observedCommitSha}
      repoSlug={repoSlug}
      runSummary={run.summary ?? null}
      lookupCommit={lookupCommit}
    />
  ) : null;

  const expandedBody = renderReviewerStoryLayer(run.matchedFiles, details);

  return (
    <EventCardShell
      status={status}
      eventTime={eventTime}
      verb={verb}
      summary={summary}
      collapsedExtras={commitChip}
      expandedBody={expandedBody}
      ariaLabel={`Specialized reviewer ${run.reviewerId} ${run.status}`}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Workflow error card (`workflowErrors`)
   ────────────────────────────────────────────────────────────────────── */

export interface ErrorEventCardProps {
  error: WorkflowErrorSource;
  eventTime: string | null;
}

/**
 * Operator-mode error card. The "errors are stories" treatment
 * (Principle 10) says an errored or blocked workflow surfaces a
 * what/why/what-to-do block with the full failure narrative inline.
 *
 * Per JAC-188 the body — `errorType`, `errorMessage`, and `errorStack` —
 * is rendered by default in `<ErrorBody />`. Stack traces are not
 * truncated, parsed, or hidden behind an expand gate; they live in a
 * tall scrollable monospace block sized to roughly 24 visible lines.
 */
export function ErrorEventCard({ error, eventTime }: ErrorEventCardProps) {
  const status = mapErrorToStatus({
    blocked: error.blocked,
    retryable: error.retryable,
  });

  const phaseLabel = error.phase ? operatorPhaseLabel(error.phase) : null;
  const verb = error.blocked
    ? phaseLabel
      ? `Blocked — ${phaseLabel}`
      : "Blocked"
    : error.retryable
      ? phaseLabel
        ? `Retrying — ${phaseLabel}`
        : "Retrying"
      : phaseLabel
        ? `Errored — ${phaseLabel}`
        : "Errored";

  return (
    <EventCardShell
      status={status}
      eventTime={eventTime}
      verb={verb}
      collapsedExtras={
        <ErrorBody
          errorType={error.errorType}
          errorMessage={error.errorMessage}
          errorStack={error.errorStack ?? null}
          qualifier={
            error.retryable && !error.blocked ? "retryable" : null
          }
        />
      }
      ariaLabel={`Workflow error ${error.errorType}`}
    />
  );
}

/**
 * Always-visible "errors are stories" body. Used by `<ErrorEventCard />`
 * for `workflowErrors` rows and by `<AgentRunEventCard />` for failed
 * `prRuns`, so the two surfaces render error content identically.
 *
 * Per JAC-188 acceptance criteria:
 *
 * - `errorType` is shown as an inline mono code chip.
 * - `errorMessage` is wrapped prose, rendered faithfully (no truncation,
 *   `whitespace-pre-wrap` so embedded newlines stay).
 * - `errorStack` is shown by default in a tall scrollable mono block
 *   sized to roughly 24 visible lines, never gated behind expand.
 *
 * The optional `qualifier` slot lets the workflow-error card surface its
 * "retryable" indicator alongside the type without leaking that concept
 * into the failed-run case (which has no retryable bit).
 */
interface ErrorBodyProps {
  errorType: string;
  errorMessage: string;
  errorStack: string | null;
  qualifier?: "retryable" | null;
}

function ErrorBody({
  errorType,
  errorMessage,
  errorStack,
  qualifier,
}: ErrorBodyProps) {
  return (
    <div className="space-y-3 pt-1">
      <div className="flex flex-wrap items-center gap-2 text-meta text-muted-foreground">
        <AlertTriangle
          className="h-3.5 w-3.5 shrink-0 text-status-blocked"
          aria-hidden
        />
        <code className="font-mono text-mono-sm text-status-blocked">
          {errorType}
        </code>
        {qualifier === "retryable" && (
          <span className="text-status-caution">retryable</span>
        )}
      </div>
      {errorMessage.length > 0 && (
        <p className="text-body leading-relaxed text-foreground/85 whitespace-pre-wrap break-words">
          {errorMessage}
        </p>
      )}
      {errorStack && (
        <div className="space-y-1.5">
          <h4 className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
            Stack trace
          </h4>
          {/*
           * Tall scrollable monospace block. `max-h-[28rem]` (448px)
           * with `text-mono-sm` (12.5px / 1.4 line-height = 17.5px/line)
           * shows ~24 lines plus the 12px top/bottom padding from `p-3`.
           * `whitespace-pre` preserves the verbatim trace; horizontal
           * overflow scrolls instead of wrapping mid-frame.
           */}
          <pre
            tabIndex={0}
            aria-label="Error stack trace"
            role="region"
            className="max-h-[28rem] overflow-auto rounded-md border border-border-hairline bg-surface-inset p-3 text-mono-sm font-mono text-foreground/80 whitespace-pre"
          >
            {errorStack}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Manual / GitHub event card (`githubEvents`)
   ────────────────────────────────────────────────────────────────────── */

export interface GitHubEventCardProps {
  event: GithubEventSource;
  eventTime: string | null;
  now: number;
}

export function GitHubEventCard({ event, eventTime, now }: GitHubEventCardProps) {
  if (event.kind === "manual") {
    return <ManualEventCard event={event} eventTime={eventTime} now={now} />;
  }
  return <GenericGitHubEventCard event={event} eventTime={eventTime} />;
}

function ManualEventCard({
  event,
  eventTime,
  now,
}: {
  event: GithubEventSource;
  eventTime: string | null;
  now: number;
}) {
  const claimedAt = event.claimedAt ?? null;
  const processedAt = event.processedAt ?? null;
  const claimIsFresh =
    claimedAt != null &&
    now - new Date(claimedAt).getTime() < MANUAL_EVENT_CLAIM_STALE_MS;
  const stateTime = processedAt ?? (claimIsFresh ? claimedAt : eventTime);

  let stateLabel: string;
  let status: StatusKind;
  if (processedAt) {
    stateLabel = "Manual re-evaluate picked up";
    status = "healthy";
  } else if (claimIsFresh) {
    stateLabel = "Manual re-evaluate dispatching";
    status = "live";
  } else {
    stateLabel = "Manual re-evaluate queued";
    status = "idle";
  }

  const summary = event.actorLogin
    ? `Requested by ${event.actorLogin}`
    : "Requested manually";

  return (
    <EventCardShell
      status={status}
      eventTime={stateTime}
      verb={stateLabel}
      summary={summary}
      collapsedExtras={
        <div className="flex items-center gap-2 pt-0.5 text-meta text-muted-foreground">
          <RotateCw
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              status === "live" && "animate-spin",
            )}
            aria-hidden
          />
          <span>
            HEAD <code className="font-mono">{event.headSha.slice(0, 7)}</code>
          </span>
        </div>
      }
      ariaLabel="Manual re-evaluate event"
    />
  );
}

function GenericGitHubEventCard({
  event,
  eventTime,
}: {
  event: GithubEventSource;
  eventTime: string | null;
}) {
  // Operator mode hides non-manual GitHub events at the server, so this
  // branch is only ever rendered in Inspector mode (or when an operator
  // selects the "GitHub" filter chip with non-manual events present).
  // Render a compact passthrough so the stream still works coherently.
  const detail =
    event.checkName != null
      ? `Check: ${event.checkName}`
      : event.reviewId != null
        ? `Review #${event.reviewId}`
        : event.commentId != null
          ? `Comment #${event.commentId}`
          : event.kind;
  const summary = event.actorLogin ? `By ${event.actorLogin}` : null;

  return (
    <EventCardShell
      status="idle"
      eventTime={eventTime}
      verb={`GitHub event — ${detail}`}
      summary={summary}
      collapsedExtras={
        <div className="flex items-center gap-2 pt-0.5 text-meta text-muted-foreground">
          <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            HEAD <code className="font-mono">{event.headSha.slice(0, 7)}</code>
          </span>
        </div>
      }
      ariaLabel={`GitHub ${event.kind} event`}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Helpers (verbs, summaries, story-layer rendering)
   ────────────────────────────────────────────────────────────────────── */

/**
 * Compose the operator-language verb for an agent run, e.g.
 * "Working — Reviewing CodeRabbit feedback" (running) or
 * "Reviewed CodeRabbit feedback" (success).
 */
function agentRunVerb(
  phase: string,
  status: string,
  details: RunDetails,
): string {
  if (status === "running") {
    return `Working — ${operatorPhaseLabel(phase)}`;
  }
  if (status === "skipped") {
    return `Skipped — ${operatorPhaseLabel(phase)}`;
  }
  if (status === "blocked") {
    return `Blocked — ${operatorPhaseLabel(phase)}`;
  }
  if (status === "failed") {
    return `Failed — ${operatorPhaseLabel(phase)}`;
  }
  if (status === "noop") {
    return `No-op reconciliation — ${operatorPhaseLabel(phase)}`;
  }
  // Success / completed — use past tense and append a count suffix when the
  // details give us one (e.g. "fixed 2 of 4 threads").
  const past = operatorPhasePastLabel(phase);
  const suffix = pastSuffixForRun(details);
  return suffix ? `${past} — ${suffix}` : past;
}

function pastSuffixForRun(details: RunDetails): string | null {
  if (details.kind === "success") {
    const checks = details.result.checks ?? [];
    const threads = details.result.threads ?? [];
    if (threads.length > 0) {
      const fixed = threads.filter((t) => t.disposition === "fix").length;
      return `fixed ${fixed} of ${threads.length} thread${threads.length === 1 ? "" : "s"}`;
    }
    if (checks.length > 0) {
      return `addressed ${checks.length} check${checks.length === 1 ? "" : "s"}`;
    }
    if (details.result.didCommitCode) return "pushed a commit";
    if (details.result.didModifyCode) return "modified code (no commit)";
    return null;
  }
  return null;
}

function reviewerRunVerb(
  reviewerId: string,
  status: string,
  details: RunDetails,
): string {
  if (status === "running") {
    return `Reviewing — ${reviewerId}`;
  }
  if (status === "skipped") {
    return `Reviewer skipped — ${reviewerId}`;
  }
  if (status === "failed") {
    return `Reviewer failed — ${reviewerId}`;
  }
  if (status === "blocked") {
    return `Reviewer blocked — ${reviewerId}`;
  }
  // Settled — say what it produced.
  if (details.kind === "reviewer_success") {
    const findings = details.result.findings.length;
    if (details.result.didCommitCode) {
      return `Reviewer pushed fix — ${reviewerId}`;
    }
    if (findings > 0) {
      return `Reviewer found ${findings} issue${findings === 1 ? "" : "s"} — ${reviewerId}`;
    }
    return `Reviewer cleared — ${reviewerId}`;
  }
  return `Specialized reviewer — ${reviewerId}`;
}

/**
 * Pick a short summary line for an agent run. The orchestrator's `summary`
 * column is preferred when present; otherwise we draw from the parsed
 * `overallSummary` so the operator always sees something useful.
 */
function oneLineSummary(
  rawSummary: string | null,
  details: RunDetails,
): string | null {
  if (rawSummary && rawSummary.length > 0) return rawSummary;
  if (details.kind === "success" || details.kind === "reviewer_success") {
    return details.result.overallSummary || null;
  }
  if (details.kind === "failed") return details.errorMessage || null;
  if (details.kind === "blocked") return details.blockedReason || null;
  if (details.kind === "noop") return details.reason || null;
  return null;
}

function reviewerSummaryLine(
  rawSummary: string | null,
  details: RunDetails,
): string | null {
  if (rawSummary && rawSummary.length > 0) return rawSummary;
  if (details.kind === "reviewer_success") {
    return details.result.overallSummary || null;
  }
  return oneLineSummary(rawSummary, details);
}

function getObservedCommitSha(details: RunDetails): string | null {
  if (details.kind === "success" || details.kind === "reviewer_success") {
    return details.result.observedCommitSha;
  }
  return null;
}

function renderAgentRunStoryLayer(details: RunDetails): React.ReactNode {
  if (details.kind === "success") {
    return renderSuccessStory(details);
  }
  if (details.kind === "reviewer_success") {
    return renderReviewerStory(details);
  }
  if (details.kind === "failed") {
    // Kept as a defensive fallback for any caller that does not short-circuit
    // failed runs before story-layer rendering.
    return (
      <ErrorBody
        errorType={details.errorType}
        errorMessage={details.errorMessage}
        errorStack={details.errorStack}
      />
    );
  }
  if (details.kind === "blocked") {
    return (
      <div className="space-y-2">
        <h4 className="text-micro font-semibold uppercase text-muted-foreground">
          Blocked
        </h4>
        <p className="text-body leading-relaxed text-foreground/85">
          {details.blockedReason}
        </p>
        {details.mergeConflict && (
          <MergeConflictBlock
            files={details.mergeConflict.conflictedFiles}
            base={details.mergeConflict.baseBranchName}
          />
        )}
      </div>
    );
  }
  if (details.kind === "noop") {
    return (
      <p className="text-body leading-relaxed text-muted-foreground">
        {details.reason}
      </p>
    );
  }
  if (details.kind === "legacy") {
    return (
      <p className="text-meta italic leading-relaxed text-muted-foreground">
        {details.summary}
      </p>
    );
  }
  return null;
}

function renderReviewerStoryLayer(
  matchedFiles: readonly string[],
  details: RunDetails,
): React.ReactNode {
  return (
    <div className="space-y-4">
      {matchedFiles.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-micro font-semibold uppercase text-muted-foreground">
            Matched files ({matchedFiles.length})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {matchedFiles.map((file) => (
              <code
                key={file}
                className="rounded bg-surface-inset px-1.5 py-0.5 text-mono-sm font-mono text-muted-foreground"
              >
                {file}
              </code>
            ))}
          </div>
        </section>
      )}
      {renderAgentRunStoryLayer(details)}
    </div>
  );
}

function renderSuccessStory(details: SuccessRunDetails): React.ReactNode {
  const { result } = details;
  return (
    <AgentReasoning
      investigationSummary={result.investigationSummary}
      finalAssessment={result.finalAssessment}
      whyNoCommit={result.whyNoCommit}
      checks={result.checks}
      threads={result.threads}
    />
  );
}

function renderReviewerStory(
  details: ReviewerSuccessDetails,
): React.ReactNode {
  const { result } = details;
  const noFindingsHint =
    result.findings.length === 0 && !result.didCommitCode && !result.didModifyCode;

  return (
    <div className="space-y-4">
      {noFindingsHint && (
        <p className="flex items-center gap-2 text-meta text-muted-foreground">
          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
          No findings, no code changes — nothing actionable for this reviewer.
        </p>
      )}
      <AgentReasoning
        investigationSummary={result.investigationSummary}
        finalAssessment={result.finalAssessment}
        whyNoCommit={result.whyNoCommit}
        findings={result.findings}
        handoffItems={result.handoffItems}
      />
      {result.didCommitCode && result.findings.length === 0 && (
        <p className="flex items-center gap-2 text-meta text-status-healthy">
          <Forward className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Reviewer fixed its scoped issues — no unresolved findings remain.
        </p>
      )}
    </div>
  );
}

function MergeConflictBlock({
  files,
  base,
}: {
  files: readonly string[];
  base: string | null;
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-micro font-semibold uppercase text-muted-foreground">
        Merge conflict
      </h4>
      {base && (
        <p className="text-meta text-muted-foreground">
          Base branch:{" "}
          <code className="font-mono text-foreground/80">{base}</code>
        </p>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {files.map((file) => (
            <code
              key={file}
              className="rounded bg-surface-inset px-1.5 py-0.5 text-mono-sm font-mono text-muted-foreground"
            >
              {file}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}
