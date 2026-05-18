"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import {
  TechnicalSignalBlock,
  type TechnicalSignalBlockManualEvent,
} from "./technical-signal-block";
import type { ManualRequestState } from "./pr-header-operator";
import { cn } from "../lib/utils";

/**
 * `<PrHeaderInspector />` — the Inspector-mode header for the PR detail
 * page (`/pr/[repoSlug]/[prNumber]/inspect`).
 *
 * Implements `docs/product/operator-ui-redesign.md` →
 * "Component Patterns" → "PR detail header — Inspector":
 *
 * > "The Inspector header keeps the same title and Re-evaluate action and
 * > adds a sibling block exposing the technical signals: branch name,
 * > current HEAD SHA, internal phase enum, internal lifecycle enum, dirty
 * > flag, manual event state, manual claim freshness, workflow ID, last
 * > reconciled timestamp. All in `JetBrains Mono`. A back affordance routes
 * > to `/pr/[slug]/[num]`."
 *
 * Layout:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  ← Operator view                                                │
 *   │                                                                 │
 *   │  vercel/next.js #92413  ↗               [Re-evaluate now]       │
 *   │  feat: streaming RSC                                            │
 *   │                                                                 │
 *   │  ┌─ Technical signals ──────────────────────────────────────┐   │
 *   │  │  BRANCH       jackson/streaming-rsc                      │   │
 *   │  │  HEAD         7c2f4e1a  [copy]                           │   │
 *   │  │               7c2f4e1ad9b4f...                           │   │
 *   │  │  PHASE        handling_code_rabbit                       │   │
 *   │  │  LIFECYCLE    open                                       │   │
 *   │  │  DIRTY        true                                       │   │
 *   │  │  MANUAL EVENT dispatching · claim fresh                  │   │
 *   │  │  WORKFLOW     wf_abc123                                  │   │
 *   │  │  RECONCILED   2026-05-05T12:34:01Z (3m ago)              │   │
 *   │  └──────────────────────────────────────────────────────────┘   │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * The Re-evaluate behaviour is an exact mirror of the Operator header: the
 * parent owns the manual-event lifecycle and passes the derived state in.
 * Inspector renders the same disabled/loading semantics so an operator
 * debugging in Inspector mode never has to switch back just to re-evaluate.
 */

export interface PrHeaderInspectorProps {
  repoSlug: string;
  prNumber: number;
  /**
   * Persisted PR title. May be empty until the backend backfill lands. The
   * inspector renders the title in technical mono so it visually matches the
   * dominant typeface of the inspector page.
   */
  title: string;
  /** Branch name, current HEAD SHA, and the rest of the technical signals. */
  technical: {
    branchName: string;
    headSha: string;
    currentPhase: string;
    lifecycleState: string;
    dirty: boolean;
    workflowId: string;
    lastReconciledAt: string | null;
  };
  manualEvent: TechnicalSignalBlockManualEvent;
  manualRequestState: ManualRequestState | null;
  manualRequestError: string | null;
  isSubmittingManualRequest: boolean;
  isTerminal: boolean;
  onManualReevaluate: () => void | Promise<void>;
}

export function PrHeaderInspector({
  repoSlug,
  prNumber,
  title,
  technical,
  manualEvent,
  manualRequestState,
  manualRequestError,
  isSubmittingManualRequest,
  isTerminal,
  onManualReevaluate,
}: PrHeaderInspectorProps) {
  const manualPending =
    manualRequestState === "queued" || manualRequestState === "dispatching";
  const manualLabel = manualPending ? "Re-evaluate queued" : "Re-evaluate now";

  const githubUrl = `https://github.com/${repoSlug}/pull/${prNumber}`;
  const operatorHref = `/pr/${encodeURIComponent(repoSlug)}/${prNumber}`;

  const titleIsEmpty = title.trim().length === 0;

  return (
    <header className="space-y-4">
      <Link
        href={operatorHref}
        className="inline-flex items-center gap-1.5 text-meta font-sans text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Operator view
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
              "font-mono text-display font-semibold leading-tight",
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
                ? "PR closed"
                : manualLabel}
          </Button>
        </div>
      </div>

      <TechnicalSignalBlock
        branchName={technical.branchName}
        headSha={technical.headSha}
        currentPhase={technical.currentPhase}
        lifecycleState={technical.lifecycleState}
        dirty={technical.dirty}
        manualEvent={manualEvent}
        workflowId={technical.workflowId}
        lastReconciledAt={technical.lastReconciledAt}
      />

      {manualRequestError && (
        <p role="alert" className="text-meta font-sans text-status-blocked">
          {manualRequestError}
        </p>
      )}
    </header>
  );
}
