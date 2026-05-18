"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusMark } from "../../../../../components/status-mark";
import {
  mapDispositionToStatus,
  operatorDispositionLabel,
} from "../../../../../lib/status";
import { TimeAgo } from "../../../../../components/time-ago";
import { PrHeaderInspector } from "../../../../../components/pr-header-inspector";
import { ReviewerSummary } from "../../../../../components/reviewer-summary";
import {
  ActivityStream,
  type ActivityStreamFilter,
} from "../../../../../components/activity-stream";
import { OutputsPanel } from "../../../../../components/outputs-panel";
import {
  ArrowLeft,
  MessageSquare,
  Ticket,
  FileCode,
  GitPullRequest,
} from "lucide-react";

/**
 * Inspector route — `/pr/[repoSlug]/[prNumber]/inspect`.
 *
 * Implements `docs/product/operator-ui-redesign.md` →
 * "Per-Screen Direction" → "PR detail — Inspector":
 *
 * > "A separate page with its own component tree. Same overall layout shape
 * > as the Operator page so navigation feels consistent, but:
 * > - Header includes the technical signal block (SHAs, internal phase
 * >   enum, workflow ID, manual claim freshness, etc.).
 * > - Activity stream shows noops, system events, both SHA columns per run,
 * >   command summaries, provider metadata, raw JSON toggle, internal phase
 * >   labels, token usage.
 * > - Outputs panel renders below the activity stream.
 * > - Inspector page background uses `--surface-inspector` and JetBrains Mono
 * >   Neon is the dominant typeface, making the mode unambiguous."
 *
 * This route ships the full Inspector page: the page shell, the Inspector
 * header, the Inspector-mode `<ActivityStream />` — which renders the
 * inspector card variants (SHA pair, internal phase enums, provider
 * metadata, workspace path, reviewer pack, command summaries, raw JSON
 * toggle, token usage) per JAC-190 — and the `<OutputsPanel />` below the
 * stream (JAC-191).
 *
 * The page wraps content in a full-bleed inspector surface that breaks out
 * of the `<main>` container's padding and applies `font-mono` so JetBrains Mono
 * Neon is the dominant typeface for descendant text. Components that need
 * sans-serif (e.g. action buttons, alert text) override locally with
 * `font-sans`.
 */

const MANUAL_EVENT_CLAIM_STALE_MS = 5 * 60 * 1000;
// Wall-clock cadence used to re-evaluate "is the manual claim still fresh?".
// Matched to `<TimeAgo />` so the technical-signal-block's claim-freshness
// flag flips at the same moment the relative-time labels in the page do.
const MANUAL_FRESHNESS_TICK_MS = 15_000;

/**
 * Returns a monotonically updating `Date.now()` value, refreshed on the
 * supplied interval. Encapsulates the impure `Date.now()` read inside a
 * lazy `useState` initialiser plus a ticking effect, satisfying React 19's
 * `react-hooks/purity` rule for components that need wall-clock comparisons
 * at render time. Threaded through the page so the technical signal block
 * and the activity stream agree on "now".
 */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function PullRequestInspectorPage({
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

  // Mirrors the operator page's commit-artifact pre-projection so the
  // inspector activity stream's commit chips can resolve a SHA → message
  // lookup without re-scanning the artifact array per event.
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

  // Manual-event derivation hoisted above the early returns so the
  // `useEffect` below maintains a stable hook order across loading states.
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

  useEffect(() => {
    if (manualRequestState !== null) {
      setManualRequestError(null);
    }
  }, [manualRequestState]);

  if (detail === undefined) {
    return (
      <InspectorShell>
        <div className="space-y-6">
          <div className="h-5 w-32 rounded animate-shimmer" />
          <div className="h-8 w-72 rounded animate-shimmer" />
          <div className="h-40 w-full rounded-none animate-shimmer" />
          <div className="h-96 w-full rounded-none animate-shimmer" />
        </div>
      </InspectorShell>
    );
  }

  if (detail === null) {
    return (
      <InspectorShell>
        <div className="space-y-6">
          <Link
            href={`/pr/${encodeURIComponent(decodedSlug)}/${prNumber}`}
            className="inline-flex items-center gap-2 text-sm font-sans text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Operator view
          </Link>
          <div className="flex flex-col items-center justify-center py-20 font-sans text-muted-foreground">
            <GitPullRequest className="h-10 w-10 mb-4 opacity-30" />
            <p className="text-sm">
              PR #{prNumber} in {decodedSlug} not found.
            </p>
          </div>
        </div>
      </InspectorShell>
    );
  }

  const { pr, threads, reviewerRuns, artifacts } = detail;

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

  return (
    <InspectorShell>
      <div className="space-y-6">
        <PrHeaderInspector
          repoSlug={decodedSlug}
          prNumber={prNumber}
          title={pr.title}
          technical={{
            branchName: pr.branchName,
            headSha: pr.headSha,
            currentPhase: pr.currentPhase,
            lifecycleState: pr.lifecycleState,
            dirty: pr.dirty,
            workflowId: pr.workflowId,
            lastReconciledAt: pr.lastReconciledAt,
          }}
          manualEvent={{
            state: manualRequestState,
            claimedAt: latestManualEvent?.claimedAt ?? null,
            claimIsFresh: manualClaimIsFresh,
            observedAt: latestManualEvent?.observedAt ?? null,
            processedAt: latestManualEvent?.processedAt ?? null,
          }}
          manualRequestState={manualRequestState}
          manualRequestError={manualRequestError}
          isSubmittingManualRequest={isSubmittingManualRequest}
          isTerminal={pr.lifecycleState !== "open"}
          onManualReevaluate={handleManualReevaluate}
        />

        {/* ─── Threads ─── */}
        {/*
          The threads section reuses the operator markup verbatim — Inspector
          mode does not currently distinguish thread rendering, and the
          decisions block already shows the raw target SHA per decision.
        */}
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
                      <span className="text-xs font-sans text-muted-foreground">
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
                      <span className="text-[11px] font-sans text-muted-foreground">
                        {operatorDispositionLabel(thread.disposition)}
                      </span>
                    </span>
                    {thread.isResolved && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-status-healthy/10 px-2 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wider text-status-healthy ring-1 ring-inset ring-status-healthy/20">
                        Resolved
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3">
                  <p className="text-sm font-sans leading-relaxed text-foreground/80 whitespace-pre-wrap">
                    {thread.body}
                  </p>
                </div>

                {thread.decisions.length > 0 && (
                  <div className="border-t border-border/40 px-4 py-3 space-y-2">
                    <span className="text-[10px] font-sans font-semibold uppercase tracking-wider text-muted-foreground">
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
                          <span className="text-[11px] font-sans text-muted-foreground">
                            {operatorDispositionLabel(d.disposition)}
                          </span>
                          <TimeAgo date={d.createdAt} />
                          <code className="ml-auto text-[11px] font-mono text-muted-foreground">
                            {d.targetHeadSha.slice(0, 8)}
                          </code>
                        </div>
                        <p className="text-xs font-sans text-muted-foreground leading-relaxed">
                          {d.reasoningSummary}
                        </p>
                        {d.linearIssueId && (
                          <div className="flex items-center gap-1.5 text-[11px] font-sans text-sky-400">
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
        <ReviewerSummary headSha={pr.headSha} reviewerRuns={reviewerRuns} />

        {/* ─── Activity stream (Inspector mode) ─── */}
        {/*
          Inspector mode surfaces noops and non-manual GitHub events (which
          the operator stream filters out at the server layer) and renders
          the inspector card variants (JAC-190): SHA pair commit chip,
          internal phase/status enums, provider metadata, workspace path,
          reviewer pack, command summaries, raw JSON toggle, and token
          usage.
        */}
        <ActivityStream
          repoSlug={decodedSlug}
          prNumber={prNumber}
          mode="inspector"
          now={nowMs}
          filter={activityFilter}
          onFilterChange={setActivityFilter}
          commitArtifacts={commitArtifacts}
        />

        {/* ─── Outputs panel (Inspector only) ─── */}
        {/*
          Per `docs/product/operator-ui-redesign.md` →
          "Per-Screen Direction" → "PR detail — Inspector": "Outputs panel
          renders below the activity stream." Inspector mode also gets the
          panel because its grouping makes it easy to verify "every
          deferred thread has a Linear ticket" / "the agent pushed exactly
          one commit this run" without scrubbing the timeline. Operator
          mode does not need this view — artifacts are already attached to
          their parent events in the stream and commits surface via the
          inline `<CommitChip />`.
        */}
        <OutputsPanel
          repoSlug={decodedSlug}
          prNumber={prNumber}
          artifacts={artifacts}
        />
      </div>
    </InspectorShell>
  );
}

/**
 * Inspector page surface. Breaks out of `<main>`'s padding so the
 * `--surface-inspector` token visually colours the entire viewport content
 * area (per the redesign doc: "Inspector page background uses
 * `--surface-inspector`"). The wrapper applies `font-mono` so descendant
 * text inherits JetBrains Mono as the default; sans-serif call-sites
 * (buttons, prose) opt out locally with `font-sans`.
 */
function InspectorShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-6 -my-8 min-h-full bg-surface-inspector px-6 py-8 font-mono">
      {children}
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
      <h2 className="text-sm font-sans font-medium text-foreground">{title}</h2>
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
    <div className="flex flex-col items-center justify-center rounded-none border border-border/60 bg-card/50 py-12 font-sans text-muted-foreground">
      <Icon className="h-7 w-7 mb-3 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
