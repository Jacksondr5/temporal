"use client";

import Link from "next/link";
import {
  mapPhaseToStatus,
  operatorPhaseLabel,
  type StatusKind,
} from "../lib/status";
import { StatusMark } from "./status-mark";
import { StatusRail } from "./status-rail";
import { TimeAgo } from "./time-ago";
import { cn } from "../lib/utils";

/**
 * `<PrRow />` — operator-mode home page row for a single tracked PR.
 *
 * Replaces the previous 7-column grid with a layered row built from the
 * canonical primitives: a `<StatusRail />` on the left edge that conveys
 * liveness through motion (Principle 4 in
 * `docs/product/operator-ui-redesign.md`), a title block with the repo +
 * PR number in sans and the PR title in narrative mono, and a multi-line
 * signal block that surfaces the orchestrator's published signals directly
 * in operator language (Principle 8). No SHAs are visible — those live in
 * the Inspector route per the layered-detail strategy.
 */

/** Threshold below which `dirty` is "fresh" rather than "stale". */
export const STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * The shape consumed by the row. Mirrors a single entry of
 * `ui.listPullRequests` — kept loose so future fields can be added without
 * threading the type through every test fixture.
 */
export interface PrRowData {
  _id: string;
  repoSlug: string;
  prNumber: number;
  title: string;
  branchName: string;
  lifecycleState: "open" | "closed" | "merged";
  statusSummary: string | null;
  currentPhase: string;
  dirty: boolean;
  blockedReason: string | null;
  lastReconciledAt: string | null;
  hasBlockingError: boolean;
  latestRunStatus: string | null;
  latestRunPhase: string | null;
  latestRunSummary: string | null;
  latestRunCompletedAt: string | null;
}

/**
 * Whether the PR is "actively reconciling" from the operator's perspective.
 * Used both for the status derivation and for the home-page sort order
 * ("live PRs first").
 */
export function isPrLive(pr: PrRowData): boolean {
  if (pr.latestRunStatus === "running") return true;
  if (mapPhaseToStatus(pr.currentPhase) === "live") return true;
  return false;
}

/**
 * Whether the PR is stale per the redesign's "Needs attention" definition:
 * dirty for more than `STALE_THRESHOLD_MS` since the last reconcile.
 */
export function isPrStale(pr: PrRowData, now: number = Date.now()): boolean {
  if (!pr.dirty) return false;
  if (pr.lastReconciledAt === null) return true;
  const ts = new Date(pr.lastReconciledAt).getTime();
  if (!Number.isFinite(ts)) return true;
  return now - ts > STALE_THRESHOLD_MS;
}

/**
 * Whether the PR meets the "Needs attention" filter criteria.
 *
 * Matches the prompt definition: lifecycle is open AND
 * (`hasBlockingError` OR `dirty` for more than 5 minutes since
 * `lastReconciledAt`).
 */
export function prNeedsAttention(
  pr: PrRowData,
  now: number = Date.now(),
): boolean {
  if (pr.lifecycleState !== "open") return false;
  if (pr.hasBlockingError) return true;
  return isPrStale(pr, now);
}

/**
 * Map a PR's published signals to a single canonical status kind for the
 * row's rail and mark. Ordered so the most "operator-actionable" condition
 * wins (blocked > live > caution > healthy > idle), so the rail's color is
 * always the most pressing signal at a glance.
 */
export function derivePrRowStatus(
  pr: PrRowData,
  now: number = Date.now(),
): StatusKind {
  if (pr.lifecycleState !== "open") return "idle";
  if (pr.hasBlockingError) return "blocked";
  if (isPrLive(pr)) return "live";
  if (isPrStale(pr, now)) return "caution";

  if (pr.latestRunStatus === "success" || pr.latestRunStatus === "completed") {
    return "healthy";
  }
  return "idle";
}

/* ──────────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────── */

function lifecycleBadgeLabel(state: PrRowData["lifecycleState"]): string {
  switch (state) {
    case "merged":
      return "Merged";
    case "closed":
      return "Closed";
    default:
      return "Open";
  }
}

function lifecycleBadgeClass(state: PrRowData["lifecycleState"]): string {
  switch (state) {
    case "merged":
      return "text-status-deferred";
    case "closed":
      return "text-status-skipped";
    default:
      return "text-status-healthy";
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   <PrRow />
   ────────────────────────────────────────────────────────────────────── */

export interface PrRowProps {
  pr: PrRowData;
  /**
   * Current time (ms since epoch) used for stale/needs-attention
   * derivation. Required so the parent can keep `now` stable across the
   * full row list and refresh it on its own cadence — calling
   * `Date.now()` in the row's render is impure and breaks React's purity
   * rule (`react-hooks/purity`).
   */
  now: number;
  className?: string;
}

export function PrRow({ pr, now, className }: PrRowProps) {
  const status = derivePrRowStatus(pr, now);

  // Operator-language qualifiers shown after the phase label. We prefer
  // distinct, high-signal lines over a synthesized sentence (Principle 8).
  const qualifiers: { key: string; text: string; tone?: string }[] = [];
  if (pr.dirty) {
    qualifiers.push({
      key: "dirty",
      text: "Dirty",
      tone: "text-status-caution",
    });
  }
  if (pr.blockedReason) {
    qualifiers.push({
      key: "blocked",
      text: pr.blockedReason,
      tone: "text-status-blocked",
    });
  }
  if (pr.latestRunSummary && !isPrLive(pr)) {
    // Hide the latest-run summary while the PR is mid-run — the phase
    // label already communicates "what the agent is doing right now".
    qualifiers.push({
      key: "latest-run-summary",
      text: pr.latestRunSummary,
    });
  }

  // Title falls back to the canonical placeholder when the orchestrator
  // hasn't reconciled the GitHub title yet (e.g. a freshly discovered PR).
  const titleDisplay =
    typeof pr.title === "string" && pr.title.trim().length > 0
      ? pr.title
      : "(title pending)";

  // The row needs a stable accessible label since it's a card-style link.
  const ariaLabel = `${pr.repoSlug} #${pr.prNumber} — ${titleDisplay}`;

  return (
    <Link
      href={`/pr/${encodeURIComponent(pr.repoSlug)}/${pr.prNumber}`}
      aria-label={ariaLabel}
      className={cn(
        "group relative flex items-stretch gap-4 px-4 py-3 transition-colors",
        "hover:bg-surface-panel-hover",
        className,
      )}
    >
      {/* Canonical 4px status rail with motion driven by the row status. */}
      <StatusRail status={status} className="self-stretch" />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Title line: sans repo+PR# slug, narrative-mono PR title. */}
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-meta font-medium text-muted-foreground tabular-nums">
            {pr.repoSlug}
            <span className="px-1 text-muted-foreground/60">·</span>
            <span className="text-foreground">#{pr.prNumber}</span>
          </span>
          <span
            className="min-w-0 flex-1 truncate text-title font-mono-narrative text-foreground"
            title={titleDisplay}
          >
            {titleDisplay}
          </span>
          {pr.lifecycleState !== "open" && (
            <span
              className={cn(
                "shrink-0 text-micro font-semibold uppercase tracking-[0.08em]",
                lifecycleBadgeClass(pr.lifecycleState),
              )}
            >
              {lifecycleBadgeLabel(pr.lifecycleState)}
            </span>
          )}
        </div>

        {/* Signal line: status mark + operator-language phase + qualifiers. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body text-foreground">
          <span className="inline-flex items-center gap-1.5">
            <StatusMark status={status} size="sm" label={null} />
            <span>{operatorPhaseLabel(pr.currentPhase)}</span>
          </span>
          {qualifiers.map((q) => (
            <span
              key={q.key}
              className="inline-flex items-center gap-2 text-meta text-muted-foreground"
            >
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
              <span className={cn("truncate", q.tone)}>{q.text}</span>
            </span>
          ))}
        </div>

        {/* Meta line: branch + last reconcile. No SHAs on the home page. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground">
          <code className="truncate font-mono text-mono-sm text-muted-foreground">
            {pr.branchName}
          </code>
          <span aria-hidden className="text-muted-foreground/40">
            ·
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <span>reconciled</span>
            <TimeAgo
              date={pr.lastReconciledAt}
              className="text-meta text-muted-foreground"
            />
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Loading skeleton row
   ────────────────────────────────────────────────────────────────────── */

/**
 * Shimmer skeleton matching the new row layout. Per the redesign doc:
 * "shimmer rows that match the new row layout, capped at 4 rows so the
 * page doesn't feel like a slot machine on every nav."
 */
export function PrRowSkeleton() {
  return (
    <div
      className="flex items-stretch gap-4 px-4 py-3"
      aria-hidden
      role="presentation"
    >
      <div className="w-1 self-stretch rounded-[2px] bg-surface-panel-hover" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <div className="h-4 w-32 rounded animate-shimmer" />
          <div className="h-4 w-64 max-w-full rounded animate-shimmer" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full animate-shimmer" />
          <div className="h-3.5 w-44 rounded animate-shimmer" />
          <div className="h-3.5 w-24 rounded animate-shimmer" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-40 rounded animate-shimmer" />
          <div className="h-3 w-20 rounded animate-shimmer" />
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Sorting
   ────────────────────────────────────────────────────────────────────── */

/**
 * Canonical home-page ordering: live PRs first, then `lastReconciledAt`
 * desc, then by repo as a tiebreaker. Matches the redesign doc's
 * "no repo grouping" stipulation.
 */
export function sortPrRows<T extends PrRowData>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const aLive = isPrLive(a) ? 1 : 0;
    const bLive = isPrLive(b) ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;

    const aTsRaw = a.lastReconciledAt
      ? new Date(a.lastReconciledAt).getTime()
      : 0;
    const bTsRaw = b.lastReconciledAt
      ? new Date(b.lastReconciledAt).getTime()
      : 0;
    const aTs = Number.isFinite(aTsRaw) ? aTsRaw : 0;
    const bTs = Number.isFinite(bTsRaw) ? bTsRaw : 0;
    if (aTs !== bTs) {
      return bTs - aTs;
    }

    const repoCmp = a.repoSlug.localeCompare(b.repoSlug);
    if (repoCmp !== 0) return repoCmp;

    return a.prNumber - b.prNumber;
  });
}
