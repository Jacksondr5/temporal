"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import { Badge } from "../../components/ui/badge";
import { Settings, ChevronRight, FolderGit2 } from "lucide-react";

export default function PoliciesListPage() {
  const repos = useQuery(api.ui.listReposWithPolicies);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Repo Policies
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage check classifications, specialized reviewers, and automation
            settings per repository.
          </p>
        </div>
        {repos && (
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {repos.length} repos
          </span>
        )}
      </div>

      <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_80px_90px_90px_80px_70px_32px] gap-4 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-card/80">
          <span>Repository</span>
          <span>Status</span>
          <span>Fixable</span>
          <span>Ignored</span>
          <span>Reviewers</span>
          <span>PRs</span>
          <span />
        </div>

        {/* Loading */}
        {repos === undefined && (
          <div className="divide-y divide-border/40">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_80px_90px_90px_80px_70px_32px] gap-4 px-4 py-3.5"
              >
                <div className="h-4 w-48 rounded animate-shimmer" />
                <div className="h-5 w-14 rounded-full animate-shimmer" />
                <div className="h-4 w-6 rounded animate-shimmer" />
                <div className="h-4 w-6 rounded animate-shimmer" />
                <div className="h-4 w-6 rounded animate-shimmer" />
                <div className="h-4 w-6 rounded animate-shimmer" />
                <div />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {repos?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FolderGit2 className="h-8 w-8 mb-3 opacity-40" />
            <p className="text-sm">No repositories configured</p>
            <p className="text-xs mt-1 opacity-60">
              Repos appear here once discovered by the poller
            </p>
          </div>
        )}

        {/* Rows */}
        {repos && repos.length > 0 && (
          <div className="divide-y divide-border/40">
            {repos.map((repo) => (
              <Link
                key={repo._id}
                href={`/policies/${encodeURIComponent(repo.slug)}`}
                className="grid grid-cols-[1fr_80px_90px_90px_80px_70px_32px] gap-4 px-4 py-3 items-center group hover:bg-primary/[0.03] transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Settings className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">
                    {repo.slug}
                  </span>
                </div>

                {repo.enabled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400 ring-1 ring-inset ring-emerald-500/20 w-fit">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    On
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 ring-1 ring-inset ring-zinc-500/20 w-fit">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                    Off
                  </span>
                )}

                <CountBadge count={repo.policy?.fixableChecks.length ?? 0} />
                <CountBadge count={repo.policy?.ignoredChecks.length ?? 0} />
                <CountBadge
                  count={repo.policy?.specializedReviewers.length ?? 0}
                />
                <CountBadge count={repo.activePrCount} />

                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <Badge
      variant="secondary"
      className="bg-muted/60 text-muted-foreground font-mono text-[11px] tabular-nums w-fit"
    >
      {count}
    </Badge>
  );
}
