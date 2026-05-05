"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ExternalLink, RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import { TimeAgo } from "./time-ago";
import { SignalStack, type Signal } from "./signal-stack";
import {
  mapPhaseToStatus,
  mapRunStatusToStatus,
  operatorPhaseLabel,
  operatorRunStatusLabel,
  type StatusKind,
} from "../lib/status";
import { cn } from "../lib/utils";

/**
 * `<PrHeaderOperator />` — the Operator-mode header for the PR detail page.
 *
 * Implements `docs/product/operator-ui-redesign.md` →
 * "Component Patterns" → "PR detail header — Operator", and Principle 8
 * ("Surface the signals, do not synthesize the verdict").
 *
 * Layout:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  ← All PRs                                                      │
 *   │                                                                 │
 *   │  vercel/next.js #92413  ↗               [Re-evaluate now]       │
 *   │  feat: streaming RSC                    [Inspect ↗]             │
 *   │                                                                 │
 *   │  ◉ Live · Reviewing CodeRabbit feedback                         │
 *   │  ⚠ Dirty — re-reconcile pending                                 │
 *   │  ◯ Latest run: Completed · 12s ago — fixed 2 of 4 threads       │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * The header intentionally has no rail or filled card surface — Principle 4
 * keeps row-level motion for the home page and the activity stream, and the
 * detail header is a single page-scoped block that doesn't need its own
 * liveness motif (the SignalStack carries the state).
 *
 * Manual re-evaluate behavior is preserved verbatim: the parent owns the
 * mutation and the polling-derived `manualRequestState`, and this header
 * just renders the action and the queued/dispatching status as a signal.
 */

/** Manual re-evaluate request state derived by the parent from the latest manual `githubEvent`. */
export type ManualRequestState = "queued" | "dispatching" | "picked_up";

export interface PrHeaderOperatorPullRequest {
  currentPhase: string;
  dirty: boolean;
  blockedReason: string | null;
  statusSummary: string | null;
  lifecycleState: "open" | "closed" | "merged";
}

export interface PrHeaderOperatorLatestRun {
  phase: string;
  status: string;
  summary: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface PrHeaderOperatorProps {
  repoSlug: string;
  prNumber: number;
  showInspect?: boolean;
  /** Persisted PR title. May be empty until the backend backfill lands. */
  title: string;
  pr: PrHeaderOperatorPullRequest;
  /**
   * The most recent non-noop run, or `null` if no runs exist or every
   * recorded run is a noop. Noops are deliberately filtered out at the
   * Operator boundary (see redesign doc, "Activity stream sub-design").
   */
  latestRun: PrHeaderOperatorLatestRun | null;
  manualRequestState: ManualRequestState | null;
  manualRequestStatusTime: string | null;
  manualRequestError: string | null;
  isSubmittingManualRequest: boolean;
  onManualReevaluate: () => void | Promise<void>;
}

export function PrHeaderOperator({
  repoSlug,
  prNumber,
  showInspect = false,
  title,
  pr,
  latestRun,
  manualRequestState,
  manualRequestStatusTime,
  manualRequestError,
  isSubmittingManualRequest,
  onManualReevaluate,
}: PrHeaderOperatorProps) {
  const isTerminal = pr.lifecycleState !== "open";
  const manualPending =
    manualRequestState === "queued" || manualRequestState === "dispatching";
  const manualLabel = manualPending ? "Re-evaluate queued" : "Re-evaluate now";

  const githubUrl = `https://github.com/${repoSlug}/pull/${prNumber}`;
  const inspectHref = showInspect
    ? `/pr/${encodeURIComponent(repoSlug)}/${prNumber}/inspect`
    : null;

  const signals = buildOperatorSignals({
    pr,
    latestRun,
    manualRequestState,
    manualRequestStatusTime,
  });

  const titleIsEmpty = title.trim().length === 0;

  return (
    <header className="space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-meta text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All PRs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-meta">
            <span className="font-medium text-foreground/80">{repoSlug}</span>
            <span className="font-mono tabular-nums text-foreground/80">
              #{prNumber}
            </span>
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open PR on GitHub"
              title="Open PR on GitHub"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
          <h1
            className={cn(
              "font-mono-narrative text-display font-semibold leading-tight",
              titleIsEmpty && "italic text-muted-foreground",
            )}
          >
            {titleIsEmpty ? "(untitled pull request)" : title}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant={manualPending ? "secondary" : "outline"}
            size="sm"
            disabled={isSubmittingManualRequest || manualPending || isTerminal}
            onClick={onManualReevaluate}
          >
            <RotateCw
              className={isSubmittingManualRequest ? "animate-spin" : undefined}
              aria-hidden
            />
            {isSubmittingManualRequest
              ? "Queueing…"
              : isTerminal
                ? `PR ${pr.lifecycleState}`
                : manualLabel}
          </Button>
          {inspectHref ? (
            <Link
              href={inspectHref}
              className="inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium text-foreground transition-colors hover:bg-muted"
            >
              Inspect
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>

      <SignalStack signals={signals} ariaLabel="PR status signals" />

      {manualRequestError && (
        <p role="alert" className="text-meta text-status-blocked">
          {manualRequestError}
        </p>
      )}
    </header>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Signal derivation. Kept colocated with the header because the operator
   signal stack on this page is shaped by the PR detail data model; other
   surfaces (PR row, etc.) compose their own signals from their own data.
   ────────────────────────────────────────────────────────────────────── */

function buildOperatorSignals({
  pr,
  latestRun,
  manualRequestState,
  manualRequestStatusTime,
}: {
  pr: PrHeaderOperatorPullRequest;
  latestRun: PrHeaderOperatorLatestRun | null;
  manualRequestState: ManualRequestState | null;
  manualRequestStatusTime: string | null;
}): Signal[] {
  const signals: Signal[] = [];

  // ── Phase ───────────────────────────────────────────────────────────────
  // Phase is the canonical "what is the PR doing right now" signal and is
  // always present (`idle` is itself a state). The mark color/shape comes
  // from `mapPhaseToStatus`; the prose label comes from `operatorPhaseLabel`.
  const phaseStatus = mapPhaseToStatus(pr.currentPhase);
  const phaseHeadline = phaseStatus === "live" ? "Live" : "Idle";
  signals.push({
    key: "phase",
    status: phaseStatus,
    text: (
      <>
        <span className="font-medium text-foreground">{phaseHeadline}</span>
        <Separator type="middot" />
        <span className="text-foreground/85">
          {operatorPhaseLabel(pr.currentPhase)}
        </span>
        {pr.statusSummary ? (
          <>
            <Separator type="middot" />
            <span className="text-muted-foreground">{pr.statusSummary}</span>
          </>
        ) : null}
      </>
    ),
  });

  // ── Dirty / blocked ────────────────────────────────────────────────────
  // Per the redesign doc, blocked is the harder fail and gets the triangle
  // mark; dirty is transient and gets the caution circle. `blockedReason`
  // takes precedence: a PR can be both dirty and blocked, and "blocked"
  // is the operator's primary concern.
  if (pr.blockedReason) {
    signals.push({
      key: "blocked",
      status: "blocked",
      text: (
        <>
          <span className="font-medium text-foreground">Blocked</span>
          <Separator type="emdash" />
          <span className="text-foreground/85">{pr.blockedReason}</span>
        </>
      ),
    });
  } else if (pr.dirty) {
    signals.push({
      key: "dirty",
      status: "caution",
      text: (
        <>
          <span className="font-medium text-foreground">Dirty</span>
          <Separator type="emdash" />
          <span className="text-foreground/85">re-reconcile pending</span>
        </>
      ),
    });
  }

  // ── Latest run summary ─────────────────────────────────────────────────
  // Renders the most recent non-noop run's status, time, and one-line
  // summary. Noops are filtered upstream at the Operator boundary so they
  // never reach this component.
  if (latestRun) {
    const runStatus = mapRunStatusToStatus(latestRun.status);
    const runLabel = operatorRunStatusLabel(latestRun.status);
    const runTime = latestRun.completedAt ?? latestRun.startedAt;
    signals.push({
      key: "latest-run",
      status: runStatus,
      text: (
        <>
          <span className="text-foreground/85">Latest run:</span>
          <span className="ml-1 font-medium text-foreground">{runLabel}</span>
          {runTime ? (
            <>
              <Separator type="middot" />
              <TimeAgo date={runTime} className="!text-meta !font-sans" />
            </>
          ) : null}
          {latestRun.summary ? (
            <>
              <Separator type="emdash" />
              <span className="text-foreground/85">{latestRun.summary}</span>
            </>
          ) : null}
        </>
      ),
    });
  }

  // ── Manual re-evaluate ─────────────────────────────────────────────────
  // Only surfaced while a manual request is still pending — once a worker
  // picks it up, the latest-run line carries the result and an extra
  // "manual: picked up" line would be noise.
  if (manualRequestState === "queued" || manualRequestState === "dispatching") {
    const manualStatus: StatusKind =
      manualRequestState === "dispatching" ? "live" : "idle";
    const manualHeadline =
      manualRequestState === "dispatching"
        ? "Re-evaluate dispatching"
        : "Re-evaluate queued";
    signals.push({
      key: "manual",
      status: manualStatus,
      text: (
        <>
          <span className="font-medium text-foreground">{manualHeadline}</span>
          {manualRequestStatusTime ? (
            <>
              <Separator type="middot" />
              <TimeAgo
                date={manualRequestStatusTime}
                className="!text-meta !font-sans"
              />
            </>
          ) : null}
        </>
      ),
    });
  }

  return signals;
}

/**
 * Inline separator rendered between segments of a single signal line. The
 * middot (·) is used between equally-weighted segments; the em-dash (—) is
 * used to introduce subordinate detail (a reason, a summary). Centralized
 * so all signals share the exact same spacing and color treatment.
 */
function Separator({ type }: { type: "middot" | "emdash" }) {
  return (
    <span className="mx-1.5 text-muted-foreground" aria-hidden>
      {type === "middot" ? "·" : "—"}
    </span>
  );
}
