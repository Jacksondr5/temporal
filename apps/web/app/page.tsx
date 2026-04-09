"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { PhaseBadge, DirtyBadge } from "../components/status-badge";
import { TimeAgo } from "../components/time-ago";
import { AlertCircle, ChevronRight, GitPullRequest } from "lucide-react";

export default function PullRequestListPage() {
  const pullRequests = useQuery(api.ui.listPullRequests);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Pull Requests
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Active PRs tracked by the review orchestrator
          </p>
        </div>
        {pullRequests && (
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {pullRequests.length} tracked
          </span>
        )}
      </div>

      {/* PR table */}
      <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_60px_1fr_140px_1.3fr_100px_32px] gap-4 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-card/80">
          <span>Repository</span>
          <span>PR</span>
          <span>Branch</span>
          <span>Phase</span>
          <span>Status</span>
          <span>Reconciled</span>
          <span />
        </div>

        {/* Loading state */}
        {pullRequests === undefined && (
          <div className="divide-y divide-border/40">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_60px_1fr_140px_1.3fr_100px_32px] gap-4 px-4 py-3.5"
              >
                <div className="h-4 w-40 rounded animate-shimmer" />
                <div className="h-4 w-8 rounded animate-shimmer" />
                <div className="h-4 w-44 rounded animate-shimmer" />
                <div className="h-5 w-16 rounded-full animate-shimmer" />
                <div className="h-4 w-32 rounded animate-shimmer" />
                <div className="h-4 w-14 rounded animate-shimmer" />
                <div />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {pullRequests?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <GitPullRequest className="h-8 w-8 mb-3 opacity-40" />
            <p className="text-sm">No pull requests are being tracked</p>
            <p className="text-xs mt-1 opacity-60">
              The poller will pick them up automatically
            </p>
          </div>
        )}

        {/* PR rows */}
        {pullRequests && pullRequests.length > 0 && (
          <div className="divide-y divide-border/40">
            {pullRequests.map((pr) => (
              <Link
                key={pr._id}
                href={`/pr/${encodeURIComponent(pr.repoSlug)}/${pr.prNumber}`}
                className="grid grid-cols-[1fr_60px_1fr_140px_1.3fr_100px_32px] gap-4 px-4 py-3 items-center group hover:bg-primary/[0.03] transition-colors"
              >
                <span className="text-sm font-medium text-foreground truncate">
                  {pr.repoSlug}
                </span>

                <span className="text-sm font-mono font-medium text-primary">
                  #{pr.prNumber}
                </span>

                <code className="text-xs font-mono text-muted-foreground truncate">
                  {pr.branchName}
                </code>

                <div className="flex items-center gap-1.5">
                  <PhaseBadge phase={pr.currentPhase} />
                  <DirtyBadge dirty={pr.dirty} />
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  {pr.hasBlockingError && (
                    <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  )}
                  <span className="text-xs text-muted-foreground truncate">
                    {pr.blockedReason ??
                      pr.statusSummary ??
                      "OK"}
                  </span>
                </div>

                <TimeAgo date={pr.lastReconciledAt} />

                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
