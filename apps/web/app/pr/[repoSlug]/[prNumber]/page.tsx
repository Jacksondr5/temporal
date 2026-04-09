"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { use } from "react";
import Link from "next/link";
import {
  PhaseBadge,
  DirtyBadge,
  DispositionBadge,
} from "@/components/status-badge";
import { TimeAgo } from "@/components/time-ago";
import { RunTimeline, ReviewerRunList } from "@/components/run-detail";
import {
  ArrowLeft,
  GitCommit,
  MessageSquare,
  Ticket,
  FileCode,
  AlertTriangle,
  Zap,
  GitPullRequest,
  ExternalLink,
  Eye,
  Info,
} from "lucide-react";

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

  const githubUrl = `https://github.com/${decodedSlug}/pull/${prNumber}`;

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

  const { pr, threads, runs, reviewerRuns, artifacts, errors, events } = detail;

  // Derive latest reconciliation context for the status strip
  const latestRun = runs[0] ?? null;
  const latestAction = latestRun
    ? latestRun.phase === "noop"
      ? "noop — PR settled"
      : `${latestRun.phase} (${latestRun.status})`
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors mb-3"
        >
          <ArrowLeft className="h-3 w-3" /> All PRs
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            <span className="text-muted-foreground">{decodedSlug}</span>{" "}
            <span className="text-primary">#{prNumber}</span>
          </h1>
          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors ring-1 ring-border/60 hover:ring-primary/30"
          >
            <ExternalLink className="h-3 w-3" />
            GitHub
          </a>
        </div>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground font-mono">
          <span>
            branch:{" "}
            <span className="text-foreground/80">{pr.branchName}</span>
          </span>
          <span className="text-border">|</span>
          <span>
            HEAD:{" "}
            <span className="text-foreground/80">
              {pr.headSha.slice(0, 8)}
            </span>
          </span>
        </div>
      </div>

      {/* ─── Workflow state strip ─── */}
      <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5" />
            Phase:
          </div>
          <PhaseBadge phase={pr.currentPhase} />
          <DirtyBadge dirty={pr.dirty} />
          {pr.blockedReason && (
            <div className="flex items-center gap-1.5 text-xs text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {pr.blockedReason}
            </div>
          )}
          {pr.statusSummary && (
            <span className="text-xs text-muted-foreground">
              {pr.statusSummary}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Reconciled: <TimeAgo date={pr.lastReconciledAt} />
          </div>
        </div>
        {/* Context row: latest action + dirty explanation */}
        {(latestAction || pr.dirty) && (
          <div className="flex items-center gap-2 border-t border-border/40 px-4 py-2 text-[11px] text-muted-foreground/70">
            <Info className="h-3 w-3 shrink-0" />
            {latestAction && (
              <span>
                Latest action:{" "}
                <span className="font-mono text-foreground/60">
                  {latestAction}
                </span>
              </span>
            )}
            {pr.dirty && latestRun?.phase !== "noop" && (
              <span className="text-amber-400/60">
                — dirty flag is set; will re-reconcile on next cycle
              </span>
            )}
            {pr.dirty && latestRun?.phase === "noop" && (
              <span className="text-amber-400/60">
                — transient dirty after agent push; should settle shortly
              </span>
            )}
          </div>
        )}
      </div>

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
                className="text-xs text-muted-foreground truncate block max-w-[200px]"
              >
                {a.summary ?? "-"}
              </span>,
              <TimeAgo key="time" date={a.createdAt} />,
            ];
          })}
        />
      )}

      {/* ─── Events ─── */}
      <SectionHeader icon={Zap} title="GitHub Events" count={events.length} />
      {events.length === 0 ? (
        <EmptyState icon={Zap} text="No GitHub events recorded" />
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
              {ev.checkName
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
