"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusMark } from "../../../../components/status-mark";
import {
  mapDispositionToStatus,
  operatorDispositionLabel,
} from "../../../../lib/status";
import { TimeAgo } from "../../../../components/time-ago";
import { PrHeaderOperator } from "../../../../components/pr-header-operator";
import { ReviewerSummary } from "../../../../components/reviewer-summary";
import {
  ActivityStream,
  type ActivityStreamFilter,
} from "../../../../components/activity-stream";
import {
  ArrowLeft,
  MessageSquare,
  Ticket,
  FileCode,
  GitPullRequest,
} from "lucide-react";

const MANUAL_EVENT_CLAIM_STALE_MS = 5 * 60 * 1000;
// How often the page re-evaluates "is the manual claim still fresh?" against
// the wall clock. 15s matches the `<TimeAgo />` cadence so the transition
// from "dispatching" to "queued" lines up with the timestamps in the row.
const MANUAL_FRESHNESS_TICK_MS = 15_000;

/**
 * Returns a monotonically updating `Date.now()` value, refreshed on the
 * supplied interval. Encapsulates the impure `Date.now()` read inside a
 * lazy `useState` initialiser plus a ticking effect, satisfying React 19's
 * `react-hooks/purity` rule for components that need wall-clock comparisons
 * at render time. Threaded down to the activity stream so child cards
 * (e.g. the manual-event card's freshness check) read from one source of
 * truth instead of each component subscribing to its own ticker.
 */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function PullRequestDetailPage({
  params,
}: {
  params: Promise<{ repoSlug: string; prNumber: string }>;
}) {
  const { repoSlug, prNumber: prNumberStr } = use(params);
  const decodedSlug = decodeURIComponent(repoSlug);
  const prNumber = parseInt(prNumberStr, 10);

  const detail = useQuery(api.ui.getPullRequestDetail, {
    repoSlug: decodedSlug,
    prNumber,
  });
  const enqueueManualReevaluate = useMutation(api.githubEvents.enqueueManual);
  const [isSubmittingManualRequest, setIsSubmittingManualRequest] =
    useState(false);
  const [manualRequestError, setManualRequestError] = useState<string | null>(
    null,
  );
  const [activityFilter, setActivityFilter] =
    useState<ActivityStreamFilter>("all");
  const nowMs = useNow(MANUAL_FRESHNESS_TICK_MS);

  // Pre-compute the commit-artifact list so the activity-stream commit chips
  // can resolve a SHA → message/stats lookup without re-scanning the full
  // artifact array per event. Hoisted above the early returns so the hook
  // order stays stable across `LoadingFirstPage` / `Loaded` renders.
  const commitArtifacts = useMemo(
    () =>
      (detail?.artifacts ?? [])
        .filter((a) => a.artifactKind === "commit")
        .map((a) => ({
          externalId: a.externalId,
          commitMessage: a.commitMessage ?? null,
          commitStats: a.commitStats ?? null,
        })),
    [detail?.artifacts],
  );

  // Manual-event derivations are computed before the early returns so the
  // `useEffect` below (which clears stale "submit failed" errors when the
  // queued event surfaces) keeps a stable hook order across loading states.
  const events = detail?.events ?? [];
  const latestManualEvent =
    events.find((event) => event.kind === "manual") ?? null;
  const manualClaimIsFresh =
    latestManualEvent?.claimedAt != null &&
    nowMs - new Date(latestManualEvent.claimedAt).getTime() <
      MANUAL_EVENT_CLAIM_STALE_MS;
  const manualRequestState =
    latestManualEvent === null
      ? null
      : latestManualEvent.processedAt != null
        ? "picked_up"
        : manualClaimIsFresh
          ? "dispatching"
          : "queued";
  const manualRequestStatusTime =
    manualRequestState === "picked_up"
      ? (latestManualEvent?.processedAt ??
        latestManualEvent?.observedAt ??
        null)
      : manualRequestState === "dispatching"
        ? (latestManualEvent?.claimedAt ??
          latestManualEvent?.observedAt ??
          null)
        : (latestManualEvent?.observedAt ?? null);

  useEffect(() => {
    if (manualRequestState !== null) {
      setManualRequestError(null);
    }
  }, [manualRequestState]);

  if (detail === undefined) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-32 rounded animate-shimmer" />
        <div className="h-8 w-72 rounded animate-shimmer" />
        <div className="h-24 w-full rounded-none animate-shimmer" />
        <div className="h-96 w-full rounded-none animate-shimmer" />
      </div>
    );
  }

  if (detail === null) {
    return (
      <div className="space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <GitPullRequest className="h-10 w-10 mb-4 opacity-30" />
          <p className="text-sm">
            PR #{prNumber} in {decodedSlug} not found.
          </p>
        </div>
      </div>
    );
  }

  const { pr, threads, runs, reviewerRuns } = detail;

  async function handleManualReevaluate(): Promise<void> {
    if (isSubmittingManualRequest) {
      return;
    }

    setIsSubmittingManualRequest(true);
    setManualRequestError(null);

    try {
      await enqueueManualReevaluate({
        repoSlug: decodedSlug,
        prNumber,
      });
    } catch (error) {
      setManualRequestError(
        error instanceof Error
          ? error.message
          : "Failed to queue re-evaluate request.",
      );
    } finally {
      setIsSubmittingManualRequest(false);
    }
  }

  // The header's "Latest run" signal surfaces the most recent non-noop run.
  // Noops are filtered out at the Operator boundary per the redesign doc
  // ("Activity stream sub-design") so they never reach the operator UI.
  const latestNonNoopRun = runs.find((run) => run.phase !== "noop") ?? null;

  return (
    <div className="space-y-6">
      <PrHeaderOperator
        repoSlug={decodedSlug}
        prNumber={prNumber}
        title={pr.title}
        // Inspect link goes live now that the route exists (JAC-189). The
        // operator header has carried the prop since JAC-185 specifically
        // so it can be flipped on without re-plumbing the component.
        showInspect
        pr={{
          currentPhase: pr.currentPhase,
          dirty: pr.dirty,
          blockedReason: pr.blockedReason,
          statusSummary: pr.statusSummary,
          lifecycleState: pr.lifecycleState,
        }}
        latestRun={
          latestNonNoopRun
            ? {
                phase: latestNonNoopRun.phase,
                status: latestNonNoopRun.status,
                summary: latestNonNoopRun.summary,
                startedAt: latestNonNoopRun.startedAt,
                completedAt: latestNonNoopRun.completedAt,
              }
            : null
        }
        manualRequestState={manualRequestState}
        manualRequestStatusTime={manualRequestStatusTime}
        manualRequestError={manualRequestError}
        isSubmittingManualRequest={isSubmittingManualRequest}
        onManualReevaluate={handleManualReevaluate}
      />

      {/* ─── Threads ─── */}
      <SectionHeader
        icon={MessageSquare}
        title="Review Threads"
        count={threads.length}
      />
      {threads.length === 0 ? (
        <EmptyState icon={MessageSquare} text="No review threads recorded" />
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => (
            <div
              key={thread._id}
              className="rounded-none border border-border/60 bg-card/50 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-card/80">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {thread.path ? (
                    <code className="text-xs font-mono text-foreground/80 truncate">
                      {thread.path}
                      {thread.line != null ? `:${thread.line}` : ""}
                    </code>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      General comment
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusMark
                      status={mapDispositionToStatus(thread.disposition)}
                      size="sm"
                      label={null}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {operatorDispositionLabel(thread.disposition)}
                    </span>
                  </span>
                  {thread.isResolved && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-status-healthy/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-healthy ring-1 ring-inset ring-status-healthy/20">
                      Resolved
                    </span>
                  )}
                </div>
              </div>

              <div className="px-4 py-3">
                <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                  {thread.body}
                </p>
              </div>

              {thread.decisions.length > 0 && (
                <div className="border-t border-border/40 px-4 py-3 space-y-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Decisions
                  </span>
                  {thread.decisions.map((d) => (
                    <div
                      key={d._id}
                      className="rounded-md border border-border/40 bg-muted/20 p-3 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <StatusMark
                          status={mapDispositionToStatus(d.disposition)}
                          size="sm"
                          label={null}
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {operatorDispositionLabel(d.disposition)}
                        </span>
                        <TimeAgo date={d.createdAt} />
                        <code className="ml-auto text-[11px] font-mono text-muted-foreground">
                          {d.targetHeadSha.slice(0, 8)}
                        </code>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {d.reasoningSummary}
                      </p>
                      {d.linearIssueId && (
                        <div className="flex items-center gap-1.5 text-[11px] text-sky-400">
                          <Ticket className="h-3 w-3" />
                          {d.linearIssueId}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─── Reviewer summary for the current SHA ─── */}
      {/*
        Sits above the unified activity stream per
        `docs/product/operator-ui-redesign.md` → "PR detail — Operator". The
        widget hides itself entirely when no reviewer has run on the current
        SHA, so the section header is intentionally inside the component.
      */}
      <ReviewerSummary headSha={pr.headSha} reviewerRuns={reviewerRuns} />

      {/* ─── Activity stream ─── */}
      {/* The activity stream's filter-chip bar serves as the section
          header per the redesign doc — no separate `<SectionHeader />`
          here. Replaces today's Reconciliation Timeline, Specialized
          Reviewers, Artifacts, and PR Events sections. */}
      <ActivityStream
        repoSlug={decodedSlug}
        prNumber={prNumber}
        mode="operator"
        now={nowMs}
        filter={activityFilter}
        onFilterChange={setActivityFilter}
        commitArtifacts={commitArtifacts}
      />
    </div>
  );
}

/* ── Section header with icon and count ── */
function SectionHeader({
  icon: Icon,
  title,
  count,
  extra,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  extra?: string;
}) {
  return (
    <div className="flex items-center gap-2 pt-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
        ({count})
      </span>
      {extra && (
        <span className="text-[11px] font-mono text-rose-400/70 tabular-nums">
          {extra}
        </span>
      )}
    </div>
  );
}

/* ── Shared empty state ── */
function EmptyState({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-none border border-border/60 bg-card/50 py-12 text-muted-foreground">
      <Icon className="h-7 w-7 mb-3 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
