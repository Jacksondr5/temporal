"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Code,
  Cpu,
  Eye,
  Forward,
  Package,
  RotateCw,
  Terminal,
  Zap,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { cn } from "../lib/utils";
import {
  formatTokenCount,
  parseRunDetails,
  parseReviewerRunDetails,
  type ReviewerPack,
  type ReviewerSuccessDetails,
  type SuccessRunDetails,
  type RunDetails,
  type TokenUsage,
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
 * Event-card components rendered inside the unified activity stream
 * (`<ActivityStream />`). Each card renders one of the four event types
 * returned by `ui.listActivityStreamEvents` plus a small set of affordances:
 *
 * - Status mark on the spine + canonical color/shape from `lib/status`
 * - Time verb ("4m ago — Reviewing CodeRabbit feedback")
 * - One-line summary
 * - Inline `<CommitChip />` for runs that pushed a commit
 * - Expand toggle revealing Story-layer agent reasoning
 *
 * In Operator mode the cards hide Inspector-only detail (token usage,
 * provider metadata, command summaries, raw JSON, internal phase enums,
 * workspace paths, reviewer-pack metadata). In Inspector mode (JAC-190)
 * the cards turn that detail back on:
 *
 * - The collapsed surface gets an "inspector meta" strip with the internal
 *   phase / status enums, provider, workspace path, token usage badge, and
 *   the reviewer pack chip (for reviewer events). This is per the redesign
 *   doc's requirement that "Workspace path, reviewer pack, and provider
 *   metadata are visible in collapsed cards instead of gated behind expand."
 * - The commit chip switches to its inspector form, rendering the SHA pair
 *   (target HEAD → observed commit) per Principle 11.
 * - The expanded body adds command summaries, a provider-metadata raw JSON
 *   toggle, and a full raw JSON toggle.
 */

export type ActivityStreamMode = "operator" | "inspector";

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
  mode: ActivityStreamMode;
  lookupCommit?: CommitArtifactLookup;
}

export function AgentRunEventCard({
  run,
  eventTime,
  repoSlug,
  mode,
  lookupCommit,
}: AgentRunEventCardProps) {
  const details = parseRunDetails(run.detailsJson);
  const status = mapAgentRunStatusToEventStatus(run.status);
  const verb = agentRunVerb(run.phase, run.status, details);
  const observedCommitSha = getObservedCommitSha(details);
  const summary = oneLineSummary(run.summary ?? null, details);

  const commitChip = observedCommitSha ? (
    <AgentRunCommitChip
      sha={observedCommitSha}
      targetSha={run.targetHeadSha}
      repoSlug={repoSlug}
      runSummary={run.summary ?? null}
      mode={mode}
      lookupCommit={lookupCommit}
    />
  ) : null;

  const inspectorMeta =
    mode === "inspector" ? (
      <InspectorMetaStrip
        phase={run.phase}
        status={run.status}
        {...inspectorMetaFromDetails(details)}
      />
    ) : null;

  const operatorStory = renderAgentRunStoryLayer(details);
  const inspectorExtras =
    mode === "inspector" ? (
      <RunInspectorExpandedExtras
        details={details}
        rawJson={run.detailsJson}
      />
    ) : null;
  const expandedBody = composeExpandedBody(operatorStory, inspectorExtras);

  return (
    <EventCardShell
      status={status}
      eventTime={eventTime}
      verb={verb}
      summary={summary}
      collapsedExtras={composeCollapsedExtras(inspectorMeta, commitChip)}
      expandedBody={expandedBody}
      ariaLabel={`Agent run ${run.phase} ${run.status}`}
    />
  );
}

function AgentRunCommitChip({
  sha,
  targetSha,
  repoSlug,
  runSummary,
  mode,
  lookupCommit,
}: {
  sha: string;
  targetSha: string | null;
  repoSlug: string;
  runSummary: string | null;
  mode: ActivityStreamMode;
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
        mode={mode}
        // Inspector mode shows the SHA pair (target → observed) per the
        // redesign doc's commit-chip pattern. Operator mode ignores the
        // target SHA so the chip stays minimal.
        targetSha={mode === "inspector" ? targetSha : null}
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
  mode: ActivityStreamMode;
  lookupCommit?: CommitArtifactLookup;
}

export function ReviewerEventCard({
  run,
  eventTime,
  repoSlug,
  mode,
  lookupCommit,
}: ReviewerEventCardProps) {
  const details = parseReviewerRunDetails(run.detailsJson);
  const status = mapReviewerRunStatusToEventStatus(run.status);
  const verb = reviewerRunVerb(run.reviewerId, run.status, details);
  const observedCommitSha = getObservedCommitSha(details);
  const summary = reviewerSummaryLine(run.summary ?? null, details);

  const commitChip = observedCommitSha ? (
    <AgentRunCommitChip
      sha={observedCommitSha}
      targetSha={run.targetHeadSha}
      repoSlug={repoSlug}
      runSummary={run.summary ?? null}
      mode={mode}
      lookupCommit={lookupCommit}
    />
  ) : null;

  const inspectorMeta =
    mode === "inspector" ? (
      <InspectorMetaStrip
        // Reviewer runs don't carry a separate orchestration phase; surface
        // the reviewer id so the inspector still gets a code-style label
        // alongside the raw run status enum.
        phase={`reviewer:${run.reviewerId}`}
        status={run.status}
        {...inspectorMetaFromDetails(details)}
      />
    ) : null;

  const operatorStory = renderReviewerStoryLayer(run.matchedFiles, details);
  const inspectorExtras =
    mode === "inspector" ? (
      <RunInspectorExpandedExtras
        details={details}
        rawJson={run.detailsJson}
      />
    ) : null;
  const expandedBody = composeExpandedBody(operatorStory, inspectorExtras);

  return (
    <EventCardShell
      status={status}
      eventTime={eventTime}
      verb={verb}
      summary={summary}
      collapsedExtras={composeCollapsedExtras(inspectorMeta, commitChip)}
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
  mode: ActivityStreamMode;
}

/**
 * Operator/inspector error card. The "errors are stories" treatment
 * (Principle 10) says the card surfaces a what/why/what-to-do block with
 * the agent's last reasoning inline. Full stack-trace rendering with the
 * tall scrollable monospace block is the dedicated subject of JAC-188; here
 * we surface the stack trace plainly when present, and JAC-188 will replace
 * this with the richer treatment. Inspector mode adds a small chip with the
 * raw `phase` enum so operators debugging the orchestrator can match the
 * error to the state machine without expanding.
 */
export function ErrorEventCard({ error, eventTime, mode }: ErrorEventCardProps) {
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

  const baseRow = (
    <div className="flex items-center gap-2 pt-0.5 text-meta text-muted-foreground">
      <AlertTriangle
        className="h-3.5 w-3.5 shrink-0 text-status-blocked"
        aria-hidden
      />
      <code className="font-mono text-mono-sm text-status-blocked">
        {error.errorType}
      </code>
      {error.retryable && !error.blocked && (
        <span className="text-status-caution">retryable</span>
      )}
    </div>
  );

  const inspectorMeta =
    mode === "inspector" ? (
      <InspectorMetaStrip
        phase={error.phase ?? null}
        status={
          error.blocked ? "blocked" : error.retryable ? "retryable" : "errored"
        }
      />
    ) : null;

  const expandedBody = (
    <div className="space-y-3">
      <div className="space-y-1">
        <h4 className="text-micro font-semibold uppercase text-muted-foreground">
          Error
        </h4>
        <p className="text-meta font-mono text-status-blocked">
          {error.errorType}
        </p>
        <p className="text-body leading-relaxed text-foreground/85 whitespace-pre-wrap">
          {error.errorMessage}
        </p>
      </div>
      {error.errorStack && (
        <div className="space-y-1">
          <h4 className="text-micro font-semibold uppercase text-muted-foreground">
            Stack trace
          </h4>
          <pre className="max-h-72 overflow-auto rounded-md border border-border-hairline bg-surface-inset p-3 text-mono-sm font-mono leading-relaxed text-foreground/80 whitespace-pre">
            {error.errorStack}
          </pre>
        </div>
      )}
      {mode === "inspector" && (
        <InspectorJsonToggle
          label="Raw error JSON"
          json={JSON.stringify(error, null, 2)}
        />
      )}
    </div>
  );

  return (
    <EventCardShell
      status={status}
      eventTime={eventTime}
      verb={verb}
      summary={error.errorMessage}
      collapsedExtras={composeCollapsedExtras(inspectorMeta, baseRow)}
      expandedBody={expandedBody}
      ariaLabel={`Workflow error ${error.errorType}`}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Manual / GitHub event card (`githubEvents`)
   ────────────────────────────────────────────────────────────────────── */

export interface GitHubEventCardProps {
  event: GithubEventSource;
  eventTime: string | null;
  now: number;
  mode: ActivityStreamMode;
}

export function GitHubEventCard({
  event,
  eventTime,
  now,
  mode,
}: GitHubEventCardProps) {
  if (event.kind === "manual") {
    return (
      <ManualEventCard
        event={event}
        eventTime={eventTime}
        now={now}
        mode={mode}
      />
    );
  }
  return (
    <GenericGitHubEventCard event={event} eventTime={eventTime} mode={mode} />
  );
}

function ManualEventCard({
  event,
  eventTime,
  now,
  mode,
}: {
  event: GithubEventSource;
  eventTime: string | null;
  now: number;
  mode: ActivityStreamMode;
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

  const headRow = (
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
  );

  const inspectorMeta =
    mode === "inspector" ? (
      <InspectorMetaStrip
        phase={`event:${event.kind}`}
        status={
          processedAt ? "processed" : claimIsFresh ? "dispatching" : "queued"
        }
      />
    ) : null;

  const expandedBody =
    mode === "inspector" ? (
      <InspectorJsonToggle
        label="Raw event JSON"
        json={JSON.stringify(event, null, 2)}
      />
    ) : null;

  return (
    <EventCardShell
      status={status}
      eventTime={stateTime}
      verb={stateLabel}
      summary={summary}
      collapsedExtras={composeCollapsedExtras(inspectorMeta, headRow)}
      expandedBody={expandedBody}
      ariaLabel="Manual re-evaluate event"
    />
  );
}

function GenericGitHubEventCard({
  event,
  eventTime,
  mode,
}: {
  event: GithubEventSource;
  eventTime: string | null;
  mode: ActivityStreamMode;
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

  const headRow = (
    <div className="flex items-center gap-2 pt-0.5 text-meta text-muted-foreground">
      <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        HEAD <code className="font-mono">{event.headSha.slice(0, 7)}</code>
      </span>
    </div>
  );

  const inspectorMeta =
    mode === "inspector" ? (
      <InspectorMetaStrip phase={`event:${event.kind}`} status="observed" />
    ) : null;

  const expandedBody =
    mode === "inspector" ? (
      <InspectorJsonToggle
        label="Raw event JSON"
        json={JSON.stringify(event, null, 2)}
      />
    ) : null;

  return (
    <EventCardShell
      status="idle"
      eventTime={eventTime}
      verb={`GitHub event — ${detail}`}
      summary={summary}
      collapsedExtras={composeCollapsedExtras(inspectorMeta, headRow)}
      expandedBody={expandedBody}
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
    return (
      <div className="space-y-2">
        <h4 className="text-micro font-semibold uppercase text-muted-foreground">
          Failure
        </h4>
        <p className="text-meta font-mono text-status-blocked">
          {details.errorType}
        </p>
        <p className="text-body leading-relaxed text-foreground/85 whitespace-pre-wrap">
          {details.errorMessage}
        </p>
        {details.errorStack && (
          <pre className="max-h-72 overflow-auto rounded-md border border-border-hairline bg-surface-inset p-3 text-mono-sm font-mono leading-relaxed text-foreground/80 whitespace-pre">
            {details.errorStack}
          </pre>
        )}
      </div>
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

/* ──────────────────────────────────────────────────────────────────────────
   Inspector-only helpers (JAC-190)

   These helpers add the technical layer the operator cards intentionally
   suppress: raw enums, workspace paths, provider metadata, token usage,
   reviewer pack info, command summaries, and a raw-JSON toggle. They are
   only mounted when `mode === "inspector"` so operator-mode rendering is
   byte-identical to before.
   ────────────────────────────────────────────────────────────────────── */

/**
 * Compose the collapsed-state extras row for an event card. We always want
 * the inspector meta strip to appear ABOVE the existing operator-side row
 * (commit chip, head SHA, error chip) so the eye lands on the operator
 * affordances first and the technical strip sits underneath as supporting
 * detail.
 */
function composeCollapsedExtras(
  inspector: React.ReactNode,
  operator: React.ReactNode,
): React.ReactNode {
  if (!inspector && !operator) return null;
  if (!inspector) return operator;
  if (!operator) return inspector;
  return (
    <>
      {inspector}
      {operator}
    </>
  );
}

/**
 * Compose the expanded body. Operator content (agent reasoning, findings,
 * etc.) stays on top; inspector extras (commands, provider metadata, raw
 * JSON) sit below a divider so the inspector layer reads as supplementary.
 */
function composeExpandedBody(
  operator: React.ReactNode,
  inspector: React.ReactNode,
): React.ReactNode {
  if (!operator && !inspector) return null;
  if (!inspector) return operator;
  if (!operator) return inspector;
  return (
    <div className="space-y-4">
      {operator}
      {inspector}
    </div>
  );
}

/**
 * Pull inspector-only metadata off a parsed `RunDetails`. Only `success`,
 * `reviewer_success`, and `blocked` carry these fields; other shapes return
 * null entries and the strip just renders fewer chips.
 */
function inspectorMetaFromDetails(details: RunDetails): {
  provider: string | null;
  workspacePath: string | null;
  usage: TokenUsage | null;
  reviewerPack: ReviewerPack | null;
} {
  if (details.kind === "success") {
    return {
      provider: details.provider,
      workspacePath: details.workspacePath,
      usage: details.usage,
      reviewerPack: null,
    };
  }
  if (details.kind === "reviewer_success") {
    return {
      provider: details.provider,
      workspacePath: details.workspacePath,
      usage: details.usage,
      reviewerPack: details.reviewerPack,
    };
  }
  if (details.kind === "blocked") {
    return {
      provider: details.provider,
      workspacePath: details.workspacePath,
      usage: null,
      reviewerPack: null,
    };
  }
  return {
    provider: null,
    workspacePath: null,
    usage: null,
    reviewerPack: null,
  };
}

interface InspectorMetaStripProps {
  /** Internal phase enum (`handling_code_rabbit`, `event:check_run`, etc.). */
  phase?: string | null;
  /** Internal run/error/event status enum. */
  status?: string | null;
  /** Provider name (e.g. `codex`). */
  provider?: string | null;
  /** Cloned workspace path on disk. */
  workspacePath?: string | null;
  /** Token usage for the run. Rendered as a small badge. */
  usage?: TokenUsage | null;
  /** Specialized reviewer pack metadata. */
  reviewerPack?: ReviewerPack | null;
}

/**
 * Inspector-only strip surfaced in the collapsed state of every event card.
 *
 * The operator UI redesign requires that "Workspace path, reviewer pack, and
 * provider metadata are visible in collapsed cards instead of gated behind
 * expand" (JAC-190 acceptance criteria). This component carries those chips,
 * plus the internal phase/status enums and the token usage badge that
 * Inspector mode needs to read.
 */
function InspectorMetaStrip({
  phase,
  status,
  provider,
  workspacePath,
  usage,
  reviewerPack,
}: InspectorMetaStripProps) {
  const hasContent =
    !!phase || !!status || !!provider || !!workspacePath || !!usage || !!reviewerPack;
  if (!hasContent) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-mono-sm font-mono tabular-nums text-muted-foreground">
      {phase && <InspectorEnumChip value={phase} />}
      {status && <InspectorEnumChip value={status} />}
      {provider && <InspectorKv label="provider" value={provider} />}
      {workspacePath && (
        <InspectorKv label="ws" value={workspacePath} title={workspacePath} />
      )}
      {reviewerPack && <ReviewerPackChip pack={reviewerPack} />}
      {usage && <InspectorUsageBadge usage={usage} />}
    </div>
  );
}

function InspectorEnumChip({ value }: { value: string }) {
  return (
    <code className="rounded bg-surface-inset px-1.5 py-0.5 text-foreground/80">
      {value}
    </code>
  );
}

function InspectorKv({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? value}
      className="inline-flex max-w-[28ch] items-baseline gap-1 truncate"
    >
      <span className="text-muted-foreground/60">{label}:</span>
      <span className="truncate text-foreground/80">{value}</span>
    </span>
  );
}

/**
 * `<UsageBadge />` ported to the new design tokens (JAC-190 acceptance
 * criterion). Replaces the legacy `apps/web/components/run-detail.tsx`
 * implementation that uses `bg-muted/10` and `text-emerald-400/70`. The new
 * badge uses the canonical `--surface-inset` background, the `text-mono-sm`
 * size token, and `text-status-healthy` for the cached-token highlight.
 */
function InspectorUsageBadge({ usage }: { usage: TokenUsage }) {
  const cachedAvailable =
    usage.cachedInputTokens != null && usage.cachedInputTokens > 0;

  return (
    <span
      title={`${usage.totalTokens.toLocaleString()} total tokens — ${usage.inputTokens.toLocaleString()} input, ${usage.outputTokens.toLocaleString()} output${
        cachedAvailable
          ? `, ${usage.cachedInputTokens?.toLocaleString()} cached input`
          : ""
      }`}
      className="inline-flex items-center gap-1.5 rounded bg-surface-inset px-1.5 py-0.5"
    >
      <Cpu className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="text-foreground/80">
        {formatTokenCount(usage.inputTokens)}
      </span>
      <span className="text-muted-foreground/60">in</span>
      <span className="text-foreground/80">
        {formatTokenCount(usage.outputTokens)}
      </span>
      <span className="text-muted-foreground/60">out</span>
      <span className="text-foreground/80">
        {formatTokenCount(usage.totalTokens)}
      </span>
      <span className="text-muted-foreground/60">tot</span>
      {cachedAvailable && (
        <>
          <span className="text-status-healthy">
            {formatTokenCount(usage.cachedInputTokens ?? 0)}
          </span>
          <span className="text-muted-foreground/60">cached</span>
        </>
      )}
    </span>
  );
}

function ReviewerPackChip({ pack }: { pack: ReviewerPack }) {
  const knowledgeFiles = pack.knowledgeFilePaths.length;
  return (
    <span
      title={`pack: ${pack.repoPath} · entry: ${pack.entrypointPath}${
        pack.repoCommitSha ? ` · commit: ${pack.repoCommitSha}` : ""
      }${knowledgeFiles > 0 ? ` · ${knowledgeFiles} knowledge files` : ""}`}
      className="inline-flex items-center gap-1 rounded bg-surface-inset px-1.5 py-0.5"
    >
      <Package className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="max-w-[18ch] truncate text-foreground/80">
        {pack.repoPath}
      </span>
      {pack.repoCommitSha && (
        <span className="text-muted-foreground/60">
          @{pack.repoCommitSha.slice(0, 7)}
        </span>
      )}
    </span>
  );
}

/**
 * Inspector-only expanded body extras: command summaries, provider
 * metadata, and a full raw-JSON toggle. Wraps content in a small "Inspector"
 * label so it's clear which content is the technical layer rather than the
 * agent's reasoning.
 */
function RunInspectorExpandedExtras({
  details,
  rawJson,
}: {
  details: RunDetails;
  rawJson: string | null;
}) {
  const commands =
    details.kind === "success" || details.kind === "reviewer_success"
      ? details.result.commandsSummary
      : [];
  const providerMetadata =
    details.kind === "success" || details.kind === "reviewer_success"
      ? details.providerMetadata
      : null;

  const hasRawJson = rawJson != null && rawJson.trim().length > 0;
  const hasContent =
    commands.length > 0 || providerMetadata != null || hasRawJson;
  if (!hasContent) return null;

  return (
    <section
      aria-label="Inspector details"
      className="space-y-3 border-t border-border-hairline pt-3"
    >
      <h4 className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
        Inspector
      </h4>
      {commands.length > 0 && <InspectorCommandsList commands={commands} />}
      {providerMetadata != null && (
        <InspectorJsonToggle
          label="Provider metadata"
          json={JSON.stringify(providerMetadata, null, 2)}
        />
      )}
      {hasRawJson && <InspectorJsonToggle label="Raw event JSON" json={rawJson} />}
    </section>
  );
}

function InspectorCommandsList({
  commands,
}: {
  commands: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
      >
        <Terminal className="h-3 w-3" aria-hidden />
        Commands ({commands.length})
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden />
        )}
      </button>
      {open && (
        <div className="mt-1.5 space-y-0.5 rounded-md border border-border-hairline bg-surface-inset p-2">
          {commands.map((cmd, i) => (
            <div
              key={i}
              className="font-mono text-mono-sm leading-relaxed text-foreground/80"
            >
              <span className="select-none text-muted-foreground/60">$ </span>
              {cmd}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InspectorJsonToggle({
  label,
  json,
}: {
  label: string;
  json: string;
}) {
  const [open, setOpen] = useState(false);
  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    formatted = json;
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
      >
        <Code className="h-3 w-3" aria-hidden />
        {label}
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden />
        )}
      </button>
      {open && (
        <pre className="mt-1.5 max-h-72 overflow-auto rounded-md border border-border-hairline bg-surface-inset p-3 font-mono text-mono-sm leading-relaxed text-foreground/80 whitespace-pre">
          {formatted}
        </pre>
      )}
    </div>
  );
}
