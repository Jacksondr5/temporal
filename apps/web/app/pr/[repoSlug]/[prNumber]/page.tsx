"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { DispositionBadge } from "../../../../components/status-badge";
import { TimeAgo } from "../../../../components/time-ago";
import {
  RunTimeline,
  ReviewerRunList,
} from "../../../../components/run-detail";
import { PrHeaderOperator } from "../../../../components/pr-header-operator";
import { ReviewerSummary } from "../../../../components/reviewer-summary";
import {
  ArrowLeft,
  GitCommit,
  MessageSquare,
  Ticket,
  FileCode,
  Zap,
  GitPullRequest,
  Eye,
} from "lucide-react";

const MANUAL_EVENT_CLAIM_STALE_MS = 5 * 60 * 1000;

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

  const events = detail?.events ?? [];
  const latestManualEvent =
    events.find((event) => event.kind === "manual") ?? null;
  const nowMs = Date.now();
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
        <div className="h-24 w-full rounded-lg animate-shimmer" />
        <div className="h-96 w-full rounded-lg animate-shimmer" />
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

  const { pr, threads, runs, reviewerRuns, artifacts, errors } = detail;

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
              className="rounded-lg border border-border/60 bg-card/50 overflow-hidden"
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
                  <DispositionBadge disposition={thread.disposition} />
                  {thread.isResolved && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
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
                        <DispositionBadge disposition={d.disposition} />
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

      {/* ─── Runs & Errors (interleaved timeline) ─── */}
      <SectionHeader
        icon={Zap}
        title="Reconciliation Timeline"
        count={runs.length}
        extra={
          errors.length > 0
            ? `${errors.length} error${errors.length === 1 ? "" : "s"}`
            : undefined
        }
      />
      {runs.length === 0 && errors.length === 0 ? (
        <EmptyState icon={Zap} text="No reconciliation activity recorded" />
      ) : (
        <RunTimeline runs={runs} errors={errors} />
      )}

      {/* ─── Specialized Reviewer Runs ─── */}
      <SectionHeader
        icon={Eye}
        title="Specialized Reviewers"
        count={reviewerRuns.length}
      />
      {reviewerRuns.length === 0 ? (
        <EmptyState icon={Eye} text="No specialized reviewer runs recorded" />
      ) : (
        <ReviewerRunList runs={reviewerRuns} />
      )}

      {/* ─── Artifacts ─── */}
      <SectionHeader
        icon={GitCommit}
        title="Artifacts"
        count={artifacts.length}
      />
      {artifacts.length === 0 ? (
        <EmptyState icon={GitCommit} text="No artifacts recorded" />
      ) : (
        <DataTable
          headers={["Kind", "External ID", "Summary", "Created"]}
          rows={artifacts.map((a) => {
            const Icon =
              a.artifactKind === "commit"
                ? GitCommit
                : a.artifactKind === "github_comment"
                  ? MessageSquare
                  : a.artifactKind === "linear_issue"
                    ? Ticket
                    : FileCode;
            const summaryText =
              a.artifactKind === "commit"
                ? (a.commitMessage ?? a.summary ?? "-")
                : (a.summary ?? "-");
            return [
              <span key="kind" className="flex items-center gap-1.5 text-xs">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {a.artifactKind}
              </span>,
              <code
                key="id"
                className="text-[11px] font-mono text-muted-foreground"
              >
                {a.externalId}
              </code>,
              <span
                key="sum"
                className="block max-w-[240px] space-y-1 text-xs text-muted-foreground"
              >
                <span className="block truncate">{summaryText}</span>
                {a.artifactKind === "commit" && a.commitStats ? (
                  <span className="block font-mono text-[11px] text-muted-foreground/80">
                    {formatCommitStats(a.commitStats)}
                  </span>
                ) : null}
              </span>,
              <TimeAgo key="time" date={a.createdAt} />,
            ];
          })}
        />
      )}

      {/* ─── Events ─── */}
      <SectionHeader icon={Zap} title="PR Events" count={events.length} />
      {events.length === 0 ? (
        <EmptyState icon={Zap} text="No PR events recorded" />
      ) : (
        <DataTable
          headers={["Kind", "HEAD SHA", "Actor", "Details", "Observed"]}
          rows={events.map((ev) => [
            <span
              key="kind"
              className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ring-1 ring-inset ring-border"
            >
              {ev.kind}
            </span>,
            <code
              key="sha"
              className="text-[11px] font-mono text-muted-foreground"
            >
              {ev.headSha.slice(0, 8)}
            </code>,
            <span key="actor" className="text-xs text-foreground/70">
              {ev.actorLogin ?? "-"}
            </span>,
            <span key="detail" className="text-xs text-muted-foreground">
              {ev.kind === "manual"
                ? "Manual re-evaluate request"
                : ev.checkName
                  ? `Check: ${ev.checkName}`
                  : ev.reviewId
                    ? `Review #${ev.reviewId}`
                    : ev.commentId
                      ? `Comment #${ev.commentId}`
                      : "-"}
            </span>,
            <TimeAgo key="time" date={ev.observedAt} />,
          ])}
        />
      )}
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
    <div className="flex flex-col items-center justify-center rounded-lg border border-border/60 bg-card/50 py-12 text-muted-foreground">
      <Icon className="h-7 w-7 mb-3 opacity-30" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function formatCommitStats(stats: {
  additions: number;
  deletions: number;
  files: number;
}): string {
  return `${stats.files} files, +${stats.additions} -${stats.deletions}`;
}

/* ── Minimal data table ── */
function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
      <div
        className="grid gap-4 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-card/80"
        style={{
          gridTemplateColumns: headers.map(() => "1fr").join(" "),
        }}
      >
        {headers.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <div className="divide-y divide-border/40">
        {rows.map((cells, i) => (
          <div
            key={i}
            className="grid gap-4 px-4 py-2.5 items-center"
            style={{
              gridTemplateColumns: headers.map(() => "1fr").join(" "),
            }}
          >
            {cells.map((cell, j) => (
              <div key={j}>{cell}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
