"use client";

import { cn } from "../lib/utils";

/**
 * `<HomeFilterBar />` — Machine Room filter selector for the home page PR
 * list. Per `docs/design/status-vocabulary.md` and `DESIGN.md`, the chips
 * stay rectangular, count-bearing, and visually consistent with rack controls.
 *
 * Each chip surfaces its own count in tabular numerics so the operator
 * can see at a glance how the active set compares to the others without
 * round-tripping through individual filters.
 */

export type HomeFilter = "open" | "needs-attention" | "recently-merged" | "all";

export const HOME_FILTERS: readonly HomeFilter[] = [
  "open",
  "needs-attention",
  "recently-merged",
  "all",
] as const;

export const HOME_FILTER_LABELS: Record<HomeFilter, string> = {
  open: "Open",
  "needs-attention": "Needs attention",
  "recently-merged": "Recently merged",
  all: "All",
};

export interface HomeFilterCounts {
  open: number;
  "needs-attention": number;
  "recently-merged": number;
  all: number;
}

export interface HomeFilterBarProps {
  active: HomeFilter;
  counts: HomeFilterCounts;
  onChange: (filter: HomeFilter) => void;
  /** When true, counts are hidden — used during the initial loading frame. */
  loading?: boolean;
  className?: string;
}

export function HomeFilterBar({
  active,
  counts,
  onChange,
  loading = false,
  className,
}: HomeFilterBarProps) {
  return (
    <div
      role="group"
      aria-label="Filter pull requests"
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {HOME_FILTERS.map((filter) => {
        const isActive = filter === active;
        const label = HOME_FILTER_LABELS[filter];
        const count = counts[filter];
        return (
          <button
            type="button"
            key={filter}
            aria-pressed={isActive}
            onClick={() => onChange(filter)}
            className={cn(
              "font-chrome inline-flex min-h-8 items-center gap-2 border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border-hairline bg-surface-panel text-muted-foreground hover:bg-surface-panel-hover hover:text-foreground",
            )}
          >
            <span>{label}</span>
            {!loading && (
              <span
                className={cn(
                  "font-mono text-mono-sm tabular-nums",
                  isActive ? "text-primary-foreground/75" : "text-muted-foreground/70",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
