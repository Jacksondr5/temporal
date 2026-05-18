"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
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
  FileCode,
  GitPullRequest,
  MessageSquare,
  Ticket,
} from "lucide-react";

const MANUAL_EVENT_CLAIM_STALE_MS = 5 * 60 * 1000;
// How often the page re-evaluates "is the manual claim still fresh?" against
// the wall clock. 15s matches the `<TimeAgo />` cadence so the transition
// from "dispatching" to "queued" lines up with the timestamps in the row.
const MANUAL_FRESHNESS_TICK_MS = 15_000;
type PullRequestDetail = NonNullable<
  FunctionReturnType<typeof api.ui.getPullRequestDetail>
>;

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
        <div className="h-5 w-32 animate-shimmer" />
        <div className="h-8 w-72 animate-shimmer" />
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

      <ThreadDecisionPanel threads={threads} />

      {/* ─── Reviewer summary for the current SHA ─── */}
      {/*
        Sits above the unified activity stream per the Machine Room Operator
        route contract in `docs/design/operator-and-inspector-modes.md`. The
        widget hides itself entirely when no reviewer has run on the current
        SHA, so the section header is intentionally inside the component.
      */}
      <ReviewerSummary headSha={pr.headSha} reviewerRuns={reviewerRuns} />

      {/* ─── Activity stream ─── */}
      {/* The activity stream's filter-chip bar serves as the section header.
          No separate `<SectionHeader />` here; the timeline is the primary
          axis for run, reviewer, artifact, and manual-event history. */}
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

function ThreadDecisionPanel({
  threads,
}: {
  threads: PullRequestDetail["threads"];
}) {
  if (threads.length === 0) {
    return null;
  }

  const decisionCount = threads.reduce(
    (total, thread) => total + thread.decisions.length,
    0,
  );

  return (
    <section
      className="border border-border-hairline bg-surface-panel"
      aria-labelledby="thread-decisions-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline bg-surface-charcoal-up px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-status-reviewer" aria-hidden />
          <h2
            id="thread-decisions-heading"
            className="font-chrome text-[11px] font-bold uppercase tracking-[0.18em] text-foreground"
          >
            Thread decisions
          </h2>
        </div>
        <span className="font-mono text-mono-sm tabular-nums text-muted-foreground">
          {decisionCount} decision{decisionCount === 1 ? "" : "s"} across{" "}
          {threads.length} thread{threads.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="divide-y divide-border-hairline">
        {threads.map((thread) => (
          <article key={thread._id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-center gap-2 text-meta text-muted-foreground">
                  <FileCode className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {thread.path ? (
                    <span className="truncate font-mono text-mono-sm text-foreground/80">
                      {thread.path}
                      {thread.line != null ? `:${thread.line}` : ""}
                    </span>
                  ) : (
                    <span>General review comment</span>
                  )}
                </div>
                <p className="max-w-[80ch] whitespace-pre-wrap text-body leading-relaxed text-foreground/85">
                  {thread.body}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-meta text-muted-foreground">
                <StatusMark
                  status={mapDispositionToStatus(thread.disposition)}
                  size="sm"
                  label={null}
                />
                {thread.isResolved
                  ? "Resolved"
                  : operatorDispositionLabel(thread.disposition)}
              </span>
            </div>

            {thread.decisions.length > 0 && (
              <div className="mt-3 space-y-2">
                {thread.decisions.map((decision) => (
                  <div
                    key={decision._id}
                    className="border border-border-hairline bg-surface-charcoal-up px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusMark
                        status={mapDispositionToStatus(decision.disposition)}
                        size="sm"
                        label={null}
                      />
                      <span className="text-meta text-foreground">
                        {operatorDispositionLabel(decision.disposition)}
                      </span>
                      <TimeAgo date={decision.createdAt} />
                      {decision.linearIssueId && (
                        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-mono-sm text-status-deferred">
                          <Ticket className="h-3 w-3" aria-hidden />
                          {decision.linearIssueId}
                        </span>
                      )}
                    </div>
                    {decision.reasoningSummary && (
                      <p className="mt-1.5 max-w-[80ch] text-meta leading-relaxed text-muted-foreground">
                        {decision.reasoningSummary}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
