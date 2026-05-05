"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { GitPullRequest } from "lucide-react";
import {
  HomeFilterBar,
  type HomeFilter,
  type HomeFilterCounts,
} from "../components/home-filter-bar";
import {
  PrRow,
  PrRowSkeleton,
  prNeedsAttention,
  sortPrRows,
  type PrRowData,
} from "../components/pr-row";

/**
 * Operator-mode home page — see `docs/product/operator-ui-redesign.md`
 * → "Per-Screen Direction" → "Home page".
 *
 * The page surfaces tracked PRs as a stack of layered rows with a status
 * rail and operator-language signals. Filter chips at the top scope the
 * list to `Open` (default), `Needs attention`, `Recently merged`, or
 * `All`. The header counter reflects the active filter — when on `Open`,
 * it also calls out the `Needs attention` subset because that's the
 * actionable count the operator cares about most.
 */

const SKELETON_ROW_COUNT = 4;

function applyHomeFilter(
  rows: readonly PrRowData[],
  filter: HomeFilter,
  now: number,
): PrRowData[] {
  switch (filter) {
    case "open":
      return rows.filter((pr) => pr.lifecycleState === "open");
    case "needs-attention":
      return rows.filter((pr) => prNeedsAttention(pr, now));
    case "recently-merged":
      return rows.filter((pr) => pr.lifecycleState === "merged");
    case "all":
      return [...rows];
  }
}

function computeFilterCounts(
  rows: readonly PrRowData[],
  now: number,
): HomeFilterCounts {
  const counts: HomeFilterCounts = {
    open: 0,
    "needs-attention": 0,
    "recently-merged": 0,
    all: rows.length,
  };
  for (const pr of rows) {
    if (pr.lifecycleState === "open") counts.open += 1;
    if (pr.lifecycleState === "merged") counts["recently-merged"] += 1;
    if (prNeedsAttention(pr, now)) counts["needs-attention"] += 1;
  }
  return counts;
}

function counterLine(
  filter: HomeFilter,
  counts: HomeFilterCounts,
  visibleCount: number,
): string {
  switch (filter) {
    case "open":
      // Calling out the actionable subset on the default filter mirrors
      // the example in the redesign doc: "12 open · 2 need attention".
      return counts["needs-attention"] > 0
        ? `${counts.open} open · ${counts["needs-attention"]} need attention`
        : `${counts.open} open`;
    case "needs-attention":
      return `${counts["needs-attention"]} need attention`;
    case "recently-merged":
      return `${counts["recently-merged"]} merged`;
    case "all":
      return `${visibleCount} tracked`;
  }
}

/** Refresh interval for the `now` reference used in stale calculations. */
const NOW_REFRESH_MS = 30_000;

export default function PullRequestListPage() {
  const pullRequests = useQuery(api.ui.listPullRequests);
  const [filter, setFilter] = useState<HomeFilter>("open");

  // `Date.now()` is held in state so render stays pure (React's
  // components-must-be-pure rule); a 30s interval refreshes it so the
  // "Needs attention" definition stays accurate even when the underlying
  // PR list hasn't changed.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), NOW_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const counts = useMemo(
    () =>
      pullRequests
        ? computeFilterCounts(pullRequests, now)
        : { open: 0, "needs-attention": 0, "recently-merged": 0, all: 0 },
    [pullRequests, now],
  );

  const filtered = useMemo(() => {
    if (!pullRequests) return [];
    return sortPrRows(applyHomeFilter(pullRequests, filter, now));
  }, [pullRequests, filter, now]);

  const isLoading = pullRequests === undefined;
  const isEmpty = !isLoading && filtered.length === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-display font-semibold tracking-tight text-foreground">
              Pull Requests
            </h1>
            <p className="mt-1 text-meta text-muted-foreground">
              Tracked PRs handled by the review orchestrator
            </p>
          </div>
          <span className="text-meta tabular-nums text-muted-foreground">
            {isLoading
              ? "Loading…"
              : counterLine(filter, counts, filtered.length)}
          </span>
        </div>

        <HomeFilterBar
          active={filter}
          counts={counts}
          onChange={setFilter}
          loading={isLoading}
        />
      </div>

      <section
        aria-label="Pull request list"
        className="overflow-hidden rounded-lg border border-border-hairline bg-surface-panel"
      >
        {isLoading && (
          <ul className="divide-y divide-border-hairline">
            {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
              <li key={i}>
                <PrRowSkeleton />
              </li>
            ))}
          </ul>
        )}

        {isEmpty && <HomeEmptyState filter={filter} />}

        {!isLoading && !isEmpty && (
          <ul className="divide-y divide-border-hairline">
            {filtered.map((pr) => (
              <li key={pr._id}>
                <PrRow pr={pr} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HomeEmptyState({ filter }: { filter: HomeFilter }) {
  const message = ((): string => {
    switch (filter) {
      case "open":
        return "No open PRs are being tracked right now.";
      case "needs-attention":
        return "Nothing needs attention. Everything is reconciled or running.";
      case "recently-merged":
        return "No merged PRs are in the recent history yet.";
      case "all":
        return "No pull requests are being tracked.";
    }
  })();

  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <GitPullRequest
        className="size-5 text-muted-foreground/60"
        aria-hidden
      />
      <p className="text-body text-muted-foreground">{message}</p>
    </div>
  );
}
