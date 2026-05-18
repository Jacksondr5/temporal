"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { TimeAgo } from "./time-ago";
import { cn } from "../lib/utils";
import type { ManualRequestState } from "./pr-header-operator";

/**
 * `<TechnicalSignalBlock />` — the Inspector-mode sibling block of the PR
 * detail header.
 *
 * Implements `docs/product/operator-ui-redesign.md` →
 * "Component Patterns" → "PR detail header — Inspector":
 *
 * > "The Inspector header keeps the same title and Re-evaluate action and
 * > adds a sibling block exposing the technical signals: branch name,
 * > current HEAD SHA, internal phase enum, internal lifecycle enum, dirty
 * > flag, manual event state, manual claim freshness, workflow ID, last
 * > reconciled timestamp. All in `JetBrains Mono`."
 *
 * Where the operator `<SignalStack />` translates raw enums into
 * operator-friendly prose via `lib/status.ts`, the technical signal block
 * does the opposite: it surfaces the verbatim values the orchestrator
 * persists, so a debugging operator can read the underlying state without
 * reverse-engineering the translation table. The component is presentational
 * and stateless beyond the local "copied" toast for the SHA copy action.
 *
 * Layout (label / value rows in a 2-column grid):
 *
 *   BRANCH        jackson/streaming-rsc
 *   HEAD          7c2f4e1a  [copy]
 *                 7c2f4e1ad9b4f...                       (full SHA)
 *   PHASE         handling_code_rabbit
 *   LIFECYCLE     open
 *   DIRTY         true
 *   MANUAL EVENT  dispatching · claim fresh
 *                 claimedAt 2026-05-05T12:34:56.789Z
 *   WORKFLOW      wf_abc123def456
 *   RECONCILED    2026-05-05T12:34:01.231Z (3m ago)
 *
 * The block is a single self-contained card so it sits visually as a sibling
 * to the title block in the inspector header.
 */

const SHORT_SHA_LENGTH = 8;
const COPY_FEEDBACK_MS = 1500;

export interface TechnicalSignalBlockManualEvent {
  state: ManualRequestState | null;
  claimedAt: string | null;
  claimIsFresh: boolean;
  observedAt: string | null;
  processedAt: string | null;
}

export interface TechnicalSignalBlockProps {
  branchName: string;
  targetHeadSha: string;
  observedCommitSha: string | null;
  currentPhase: string;
  lifecycleState: string;
  dirty: boolean;
  blockedReason: string | null;
  statusSummary: string | null;
  hasBlockingError: boolean;
  manualEvent: TechnicalSignalBlockManualEvent;
  workflowId: string;
  runId: string | null;
  manualClaimedAt: string | null;
  manualEventKind: string | null;
  latestRunPhase: string | null;
  latestRunStatus: string | null;
  lastReconciledAt: string | null;
  policyId: string | null;
  className?: string;
}

export function TechnicalSignalBlock({
  branchName,
  targetHeadSha,
  observedCommitSha,
  currentPhase,
  lifecycleState,
  dirty,
  blockedReason,
  statusSummary,
  hasBlockingError,
  manualEvent,
  workflowId,
  runId,
  manualClaimedAt,
  manualEventKind,
  latestRunPhase,
  latestRunStatus,
  lastReconciledAt,
  policyId,
  className,
}: TechnicalSignalBlockProps) {
  const shaPair = observedCommitSha
    ? `${targetHeadSha} → ${observedCommitSha}`
    : targetHeadSha;

  return (
    <section
      aria-label="Technical signals"
      className={cn(
        "border border-border-strong bg-surface-inspector-panel font-mono text-mono-sm",
        className,
      )}
    >
      <div className="border-b border-border-hairline bg-surface-charcoal-deep px-3 py-2">
        <h2 className="font-mono text-micro uppercase tracking-[0.18em] text-status-caution">
          Technical Signals · pullRequests
        </h2>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        <SignalCell label="branchName" value={branchName} />
        <SignalCell label="currentPhase" value={currentPhase} />
        <SignalCell label="lifecycleState" value={lifecycleState} />
        <SignalCell label="dirty">
          <BooleanValue value={dirty} />
        </SignalCell>
        <SignalCell label="targetHeadSha">
          <HeadShaValue sha={targetHeadSha} />
        </SignalCell>
        <SignalCell label="observedCommitSha">
          {observedCommitSha ? (
            <HeadShaValue sha={observedCommitSha} />
          ) : (
            <EmptyValue />
          )}
        </SignalCell>
        <SignalCell label="shaPair" value={shaPair} />
        <SignalCell label="blockedReason">
          {blockedReason ? (
            <span className="text-status-blocked">{blockedReason}</span>
          ) : (
            <EmptyValue />
          )}
        </SignalCell>
        <SignalCell label="statusSummary">
          {statusSummary ? <span>{statusSummary}</span> : <EmptyValue />}
        </SignalCell>
        <SignalCell label="hasBlockingError">
          <BooleanValue value={hasBlockingError} />
        </SignalCell>
        <SignalCell label="workflowId" value={workflowId} />
        <SignalCell label="runId">
          {runId ? <span>{runId}</span> : <EmptyValue />}
        </SignalCell>
        <SignalCell label="manualClaimedAt">
          {manualClaimedAt ? <span>{manualClaimedAt}</span> : <EmptyValue />}
        </SignalCell>
        <SignalCell label="manualEvent">
          <ManualEventValue
            manualEvent={manualEvent}
            manualEventKind={manualEventKind}
          />
        </SignalCell>
        <SignalCell label="latestRunPhase">
          {latestRunPhase ? <span>{latestRunPhase}</span> : <EmptyValue />}
        </SignalCell>
        <SignalCell label="latestRunStatus">
          {latestRunStatus ? <span>{latestRunStatus}</span> : <EmptyValue />}
        </SignalCell>
        <SignalCell label="lastReconciledAt">
          <ReconciledValue lastReconciledAt={lastReconciledAt} />
        </SignalCell>
        <SignalCell label="policyId">
          {policyId ? <span>{policyId}</span> : <EmptyValue />}
        </SignalCell>
      </dl>
    </section>
  );
}

function SignalCell({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 border-b border-r border-border-hairline px-3 py-3">
      <dt className="font-mono text-micro uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 min-w-0 break-all text-foreground/90">
        {children ?? value ?? <EmptyValue />}
      </dd>
    </div>
  );
}

function EmptyValue() {
  return <span className="text-muted-foreground">null</span>;
}

/* ──────────────────────────────────────────────────────────────────────────
   HEAD SHA value — short SHA with a copy button, full SHA on the second row
   so an operator can read the full hash without hovering. The copy button
   always copies the full SHA; the short form is just a visual headline.
   ────────────────────────────────────────────────────────────────────── */

function HeadShaValue({ sha }: { sha: string }) {
  const [copied, setCopied] = useState(false);
  const short = sha.slice(0, SHORT_SHA_LENGTH);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(sha);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard access can fail (insecure context, denied permission). The
      // full SHA stays visible below, so failing silently is acceptable.
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-foreground" title={sha}>
          {short}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "SHA copied" : "Copy full SHA"}
          className="inline-flex h-5 w-5 items-center justify-center border border-transparent text-muted-foreground transition hover:border-border-strong hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-status-healthy" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>
      <span className="text-mono-sm text-muted-foreground" title={sha}>
        {sha}
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Boolean value — the inspector intentionally surfaces booleans as their
   raw `true` / `false` literals (rather than translated prose) so the
   underlying state is unambiguous. `true` for `dirty` reads as caution;
   `false` reads as muted to keep the eye on whatever is non-default.
   ────────────────────────────────────────────────────────────────────── */

function BooleanValue({ value }: { value: boolean }) {
  return (
    <span className={value ? "text-status-caution" : "text-muted-foreground"}>
      {String(value)}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Manual-event value — surfaces both the derived request state and the raw
   `claimedAt` plus a freshness flag, since the freshness check is a pure
   wall-clock comparison the operator cannot otherwise see in the schema.
   ────────────────────────────────────────────────────────────────────── */

function ManualEventValue({
  manualEvent,
  manualEventKind,
}: {
  manualEvent: TechnicalSignalBlockManualEvent;
  manualEventKind?: string | null;
}) {
  if (manualEvent.state === null) {
    return (
      <span className="text-muted-foreground">
        {manualEventKind ?? "null"}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {manualEventKind ? (
          <span className="text-muted-foreground">{manualEventKind}</span>
        ) : null}
        <span className="text-foreground">{manualEvent.state}</span>
        {manualEvent.claimedAt ? (
          <>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <span
              className={
                manualEvent.claimIsFresh
                  ? "text-status-live"
                  : "text-status-skipped"
              }
            >
              claim {manualEvent.claimIsFresh ? "fresh" : "stale"}
            </span>
          </>
        ) : null}
      </div>
      {manualEvent.claimedAt ? (
        <span className="text-mono-sm text-muted-foreground">
          claimedAt {manualEvent.claimedAt}
        </span>
      ) : null}
      {manualEvent.processedAt ? (
        <span className="text-mono-sm text-muted-foreground">
          processedAt {manualEvent.processedAt}
        </span>
      ) : manualEvent.observedAt ? (
        <span className="text-mono-sm text-muted-foreground">
          observedAt {manualEvent.observedAt}
        </span>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Reconciled value — verbatim ISO timestamp plus a relative `<TimeAgo />`
   pill in operator-friendly text. The verbatim value is the primary
   technical signal; the relative time is a secondary cue.
   ────────────────────────────────────────────────────────────────────── */

function ReconciledValue({
  lastReconciledAt,
}: {
  lastReconciledAt: string | null;
}) {
  if (!lastReconciledAt) {
    return <span className="text-muted-foreground">never</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="text-foreground" title={lastReconciledAt}>
        {lastReconciledAt}
      </span>
      <TimeAgo
        date={lastReconciledAt}
        className="!text-mono-sm !font-mono !text-muted-foreground"
      />
    </div>
  );
}
