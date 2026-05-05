"use client";

import { cn } from "../lib/utils";

/**
 * `<HomeFilterBar />` — chip-style filter selector for the home page PR
 * list. Per `docs/product/operator-ui-redesign.md` → "Per-Screen
 * Direction" → "Home page", the chips are `Open` (default), `Needs
 * attention`, `Recently merged`, and `All`.
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
      role="tablist"
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
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(filter)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-meta font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isActive
                ? "border-transparent bg-foreground text-surface-canvas"
                : "border-border-hairline bg-surface-panel text-muted-foreground hover:bg-surface-panel-hover hover:text-foreground",
            )}
          >
            <span>{label}</span>
            {!loading && (
              <span
                className={cn(
                  "tabular-nums text-mono-sm",
                  isActive ? "text-surface-canvas/70" : "text-muted-foreground/70",
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
