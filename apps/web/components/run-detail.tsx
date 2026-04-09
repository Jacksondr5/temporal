"use client";

import { useState } from "react";
import {
  parseRunDetails,
  parseReviewerRunDetails,
  didBranchMove,
  formatTokenCount,
  type SuccessRunDetails,
  type ReviewerSuccessDetails,
  type FailedRunDetails,
  type NoopRunDetails,
  type CheckOutcome,
  type ThreadOutcome,
  type ReviewerFinding,
  type HandoffItem,
  type TokenUsage,
  type ReviewerPack,
} from "../lib/run-details";
import { PhaseBadge, RunStatusBadge, DispositionBadge } from "./status-badge";
import { TimeAgo } from "./time-ago";
import { ErrorTypeBadge } from "./status-badge";
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  FileCode,
  AlertTriangle,
  GitCommit,
  Ticket,
  MessageSquare,
  Code,
  Cpu,
  ArrowRight,
  Minus,
  Eye,
  Forward,
  Package,
} from "lucide-react";

// ── Types matching the Convex documents ─────────────────────────────────────

interface PrRun {
  _id: string;
  phase: string;
  status: string;
  targetHeadSha: string;
  startedAt: string;
  completedAt: string | null;
  summary: string | null;
  detailsJson: string;
}

interface ReviewerRun {
  _id: string;
  reviewerId: string;
  status: string;
  targetHeadSha: string;
  matchedFiles: string[];
  summary: string | null;
  detailsJson: string | null;
  createdAt: string;
}

interface WorkflowError {
  _id: string;
  phase: string | null;
  errorType: string;
  errorMessage: string;
  retryable: boolean;
  blocked: boolean;
  lastSeenAt: string;
}

// ── Main exported: prRun + error timeline ───────────────────────────────────

export function RunTimeline({
  runs,
  errors,
}: {
  runs: PrRun[];
  errors?: WorkflowError[];
}) {
  const errorsByTime = (errors ?? []).map((e) => ({
    kind: "error" as const,
    time: e.lastSeenAt,
    data: e,
  }));
  const runsByTime = runs.map((r) => ({
    kind: "run" as const,
    time: r.startedAt,
    data: r,
  }));
  const timeline = [...runsByTime, ...errorsByTime].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
  );

  // Group consecutive noops to reduce noise
  const grouped: typeof timeline = [];
  let noopGroup: (typeof timeline)[number][] = [];

  for (const item of timeline) {
    const isNoop =
      item.kind === "run" &&
      parseRunDetails(item.data.detailsJson).kind === "noop";
    if (isNoop) {
      noopGroup.push(item);
    } else {
      if (noopGroup.length > 0) {
        grouped.push(...noopGroup);
        noopGroup = [];
      }
      grouped.push(item);
    }
  }
  if (noopGroup.length > 0) {
    grouped.push(...noopGroup);
  }

  // Render, collapsing 3+ consecutive noops
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < grouped.length) {
    const item = grouped[i];
    if (item.kind === "error") {
      elements.push(<ErrorCard key={item.data._id} error={item.data} />);
      i++;
      continue;
    }
    const details = parseRunDetails(item.data.detailsJson);
    if (details.kind !== "noop") {
      elements.push(<RunCard key={item.data._id} run={item.data} />);
      i++;
      continue;
    }
    // Count consecutive noops
    let noopCount = 0;
    const noopStart = i;
    while (
      i < grouped.length &&
      grouped[i].kind === "run" &&
      parseRunDetails((grouped[i].data as PrRun).detailsJson).kind === "noop"
    ) {
      noopCount++;
      i++;
    }
    if (noopCount <= 2) {
      for (let j = noopStart; j < i; j++) {
        const r = grouped[j].data as PrRun;
        elements.push(<RunCard key={r._id} run={r} />);
      }
    } else {
      // Show first, collapsed middle, last
      const first = grouped[noopStart].data as PrRun;
      const last = grouped[i - 1].data as PrRun;
      elements.push(<RunCard key={first._id} run={first} />);
      elements.push(
        <CollapsedNoops
          key={`noops-${noopStart}`}
          count={noopCount - 2}
          firstTime={(grouped[noopStart + 1].data as PrRun).startedAt}
          lastTime={(grouped[i - 2].data as PrRun).startedAt}
        />,
      );
      elements.push(<RunCard key={last._id} run={last} />);
    }
  }

  return <div className="space-y-2">{elements}</div>;
}

function CollapsedNoops({
  count,
}: {
  count: number;
  firstTime: string;
  lastTime: string;
}) {
  return (
    <div className="flex items-center gap-2 w-full rounded border border-border/30 bg-card/20 px-4 py-1.5 text-[10px] text-muted-foreground/50">
      <Minus className="h-3 w-3" />
      {count} more noop reconciliation{count !== 1 ? "s" : ""} collapsed
    </div>
  );
}

// ── Exported: specialized reviewer run list ─────────────────────────────────

export function ReviewerRunList({ runs }: { runs: ReviewerRun[] }) {
  if (runs.length === 0) return null;
  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <ReviewerRunCard key={run._id} run={run} />
      ))}
    </div>
  );
}

// ── Error card (inline in timeline) ─────────────────────────────────────────

function ErrorCard({ error }: { error: WorkflowError }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-4 py-2">
      <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
      <ErrorTypeBadge blocked={error.blocked} retryable={error.retryable} />
      {error.phase && <PhaseBadge phase={error.phase} />}
      <code className="text-[11px] font-mono text-rose-400/80">
        {error.errorType}
      </code>
      <span className="flex-1 min-w-0 text-xs text-foreground/60 truncate">
        {error.errorMessage}
      </span>
      <TimeAgo date={error.lastSeenAt} />
    </div>
  );
}

// ── Single prRun card ───────────────────────────────────────────────────────

function RunCard({ run }: { run: PrRun }) {
  const details = parseRunDetails(run.detailsJson);

  if (details.kind === "noop") {
    return <NoopCard run={run} details={details} />;
  }

  return <ExpandableRunCard run={run} />;
}

// ── Noop run (lightweight inline) ───────────────────────────────────────────

function NoopCard({ run, details }: { run: PrRun; details: NoopRunDetails }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/30 px-4 py-2">
      <Minus className="h-3.5 w-3.5 text-muted-foreground/50" />
      <PhaseBadge phase={run.phase} />
      <RunStatusBadge status={run.status} />
      {details.snapshotHeadSha && (
        <code className="text-[11px] font-mono text-muted-foreground/60">
          {details.snapshotHeadSha.slice(0, 8)}
        </code>
      )}
      <span className="flex-1 min-w-0 text-xs text-muted-foreground/60 truncate">
        {details.reason}
      </span>
      <TimeAgo date={run.startedAt} />
    </div>
  );
}

// ── Expandable prRun card ───────────────────────────────────────────────────

function ExpandableRunCard({ run }: { run: PrRun }) {
  const [expanded, setExpanded] = useState(false);
  const details = parseRunDetails(run.detailsJson);
  const hasRichDetails =
    details.kind === "success" ||
    details.kind === "reviewer_success" ||
    details.kind === "failed";

  const usage =
    (details.kind === "success" || details.kind === "reviewer_success") &&
    details.usage
      ? details.usage
      : null;
  const usageLabel = usage
    ? `${formatTokenCount(usage.totalTokens)} tok`
    : null;

  const branchMoved =
    (details.kind === "success" || details.kind === "reviewer_success") &&
    didBranchMove(details);

  // Extract pushed SHA for the header
  const pushedSha =
    (details.kind === "success" || details.kind === "reviewer_success")
      ? details.result.observedCommitSha
      : null;

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-primary/[0.03] transition-colors"
      >
        <span className="text-muted-foreground shrink-0">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <PhaseBadge phase={run.phase} />
        <RunStatusBadge status={run.status} />
        <span className="shrink-0 flex items-center gap-1 text-[11px] font-mono">
          <span className="text-muted-foreground" title="Started on this HEAD">
            {run.targetHeadSha.slice(0, 8)}
          </span>
          {pushedSha && (
            <>
              <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-emerald-400" title="Pushed commit">
                {pushedSha.slice(0, 8)}
              </span>
            </>
          )}
          {branchMoved && !pushedSha && (
            <GitCommit className="h-3 w-3 text-emerald-400" />
          )}
        </span>
        <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
          {run.summary ?? "No summary"}
        </span>
        {usageLabel && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60 tabular-nums">
            <Cpu className="h-3 w-3" />
            {usageLabel}
          </span>
        )}
        <span className="shrink-0 text-[11px] text-muted-foreground font-mono tabular-nums">
          <TimeAgo date={run.startedAt} />
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-4 py-3 space-y-4">
          {run.summary && (
            <p className="text-sm text-foreground/80 leading-relaxed">
              {run.summary}
            </p>
          )}

          {details.kind === "success" && <SuccessDetail details={details} />}
          {details.kind === "reviewer_success" && (
            <ReviewerSuccessDetail details={details} />
          )}
          {details.kind === "failed" && <FailedDetail details={details} />}
          {details.kind === "legacy" && (
            <p className="text-xs text-muted-foreground italic">
              {details.summary}
            </p>
          )}
          {details.kind === "unknown" && (
            <RawJsonToggle json={run.detailsJson} defaultOpen />
          )}

          {hasRichDetails && <RawJsonToggle json={run.detailsJson} />}
        </div>
      )}
    </div>
  );
}

// ── Reviewer run card (for reviewerRuns table) ──────────────────────────────

function ReviewerRunCard({ run }: { run: ReviewerRun }) {
  const [expanded, setExpanded] = useState(false);
  const details = parseReviewerRunDetails(run.detailsJson);

  const usage =
    (details.kind === "reviewer_success" || details.kind === "success") &&
    details.usage
      ? details.usage
      : null;
  const usageLabel = usage
    ? `${formatTokenCount(usage.totalTokens)} tok`
    : null;
  const branchMoved =
    (details.kind === "reviewer_success" || details.kind === "success") &&
    didBranchMove(details);

  const pushedSha =
    (details.kind === "reviewer_success" || details.kind === "success")
      ? details.result.observedCommitSha
      : null;

  return (
    <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-indigo-500/[0.05] transition-colors"
      >
        <span className="text-muted-foreground shrink-0">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <Eye className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
        <span className="text-[11px] font-mono font-medium text-indigo-400 shrink-0">
          {run.reviewerId}
        </span>
        <RunStatusBadge status={run.status} />
        <span className="shrink-0 flex items-center gap-1 text-[11px] font-mono">
          <span className="text-muted-foreground" title="Started on this HEAD">
            {run.targetHeadSha.slice(0, 8)}
          </span>
          {pushedSha && (
            <>
              <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-emerald-400" title="Pushed commit">
                {pushedSha.slice(0, 8)}
              </span>
            </>
          )}
          {branchMoved && !pushedSha && (
            <GitCommit className="h-3 w-3 text-emerald-400" />
          )}
        </span>
        <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
          {run.summary ?? "No summary"}
        </span>
        {run.matchedFiles.length > 0 && (
          <span className="shrink-0 text-[10px] font-mono text-muted-foreground/60 tabular-nums">
            {run.matchedFiles.length} file{run.matchedFiles.length !== 1 ? "s" : ""}
          </span>
        )}
        {usageLabel && (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60 tabular-nums">
            <Cpu className="h-3 w-3" />
            {usageLabel}
          </span>
        )}
        <span className="shrink-0 text-[11px] text-muted-foreground font-mono tabular-nums">
          <TimeAgo date={run.createdAt} />
        </span>
      </button>

      {expanded && (
        <div className="border-t border-indigo-500/10 px-4 py-3 space-y-4">
          {run.summary && (
            <p className="text-sm text-foreground/80 leading-relaxed">
              {run.summary}
            </p>
          )}

          {/* Matched files */}
          {run.matchedFiles.length > 0 && (
            <DetailSection title="Matched Files">
              <div className="flex flex-wrap gap-1.5">
                {run.matchedFiles.map((f) => (
                  <code
                    key={f}
                    className="rounded bg-muted/30 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                  >
                    {f}
                  </code>
                ))}
              </div>
            </DetailSection>
          )}

          {details.kind === "reviewer_success" && (
            <ReviewerSuccessDetail details={details} />
          )}
          {details.kind === "success" && <SuccessDetail details={details} />}
          {details.kind === "failed" && <FailedDetail details={details} />}
          {details.kind === "unknown" &&
            Object.keys(details.raw).length > 0 && (
              <RawJsonToggle
                json={run.detailsJson ?? "{}"}
                defaultOpen
              />
            )}

          {(details.kind === "reviewer_success" ||
            details.kind === "success" ||
            details.kind === "failed") &&
            run.detailsJson && <RawJsonToggle json={run.detailsJson} />}
        </div>
      )}
    </div>
  );
}

// ── Agent meta strip (shared between success and reviewer_success) ──────────

function AgentMetaStrip({
  details,
  observedCommitSha,
  didCommitCode,
  didModifyCode,
}: {
  details: {
    provider: string;
    startingHeadSha: string | null;
    remoteHeadAfter: string | null;
    workspacePath: string | null;
  };
  observedCommitSha: string | null;
  didCommitCode: boolean;
  didModifyCode: boolean;
}) {
  // Consistency warning: didCommitCode=false but we see a commit SHA
  const inconsistent = !didCommitCode && !!observedCommitSha;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-mono">
        {details.provider && <KV label="provider" value={details.provider} />}
        {details.startingHeadSha && (
          <KV label="started on" value={details.startingHeadSha.slice(0, 8)} />
        )}
        {observedCommitSha && (
          <span className="flex items-center gap-1 text-emerald-400">
            <GitCommit className="h-3 w-3" />
            pushed {observedCommitSha.slice(0, 8)}
          </span>
        )}
        {!observedCommitSha &&
          details.startingHeadSha &&
          details.remoteHeadAfter &&
          details.startingHeadSha !== details.remoteHeadAfter && (
            <span className="flex items-center gap-1">
              <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
              <span className="text-emerald-400">
                remote now {details.remoteHeadAfter.slice(0, 8)}
              </span>
            </span>
          )}
        <span className={didModifyCode ? "text-foreground/70" : "text-muted-foreground/50"}>
          {didModifyCode ? "code modified" : "no code changes"}
        </span>
        <span className={didCommitCode ? "text-emerald-400/80" : "text-muted-foreground/50"}>
          {didCommitCode ? "committed" : "no commit"}
        </span>
        {details.workspacePath && (
          <KV label="workspace" value={details.workspacePath} />
        )}
      </div>
      {inconsistent && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-400/70">
          <AlertTriangle className="h-3 w-3" />
          Inconsistent: observedCommitSha present but didCommitCode is false
        </div>
      )}
    </div>
  );
}

// ── Success detail (fix_checks / handle_code_rabbit) ────────────────────────

function SuccessDetail({ details }: { details: SuccessRunDetails }) {
  const { result } = details;

  return (
    <div className="space-y-4">
      <AgentMetaStrip
        details={details}
        observedCommitSha={result.observedCommitSha}
        didCommitCode={result.didCommitCode}
        didModifyCode={result.didModifyCode}
      />

      {details.usage ? (
        <UsageBadge usage={details.usage} />
      ) : (
        <UsageUnavailable />
      )}

      {result.investigationSummary && (
        <DetailSection title="Investigation">
          <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap">
            {result.investigationSummary}
          </p>
        </DetailSection>
      )}

      {result.finalAssessment && (
        <DetailSection title="Assessment">
          <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap">
            {result.finalAssessment}
          </p>
        </DetailSection>
      )}

      {result.whyNoCommit && (
        <DetailSection title="Why No Commit">
          <p className="text-xs text-amber-400/80 leading-relaxed">
            {result.whyNoCommit}
          </p>
        </DetailSection>
      )}

      {result.checks && result.checks.length > 0 && (
        <DetailSection title="Check Outcomes">
          <div className="space-y-2">
            {result.checks.map((c, i) => (
              <CheckOutcomeCard key={i} outcome={c} />
            ))}
          </div>
        </DetailSection>
      )}

      {result.threads && result.threads.length > 0 && (
        <DetailSection title="Thread Outcomes">
          <div className="space-y-2">
            {result.threads.map((t, i) => (
              <ThreadOutcomeCard key={i} outcome={t} />
            ))}
          </div>
        </DetailSection>
      )}

      {result.commandsSummary.length > 0 && (
        <CommandsList commands={result.commandsSummary} />
      )}

      {details.providerMetadata && (
        <RawJsonToggle
          label="Provider Metadata"
          json={JSON.stringify(details.providerMetadata, null, 2)}
        />
      )}

      {details.logFilePath && (
        <div className="text-[10px] font-mono text-muted-foreground/40 truncate">
          legacy log: {details.logFilePath}
        </div>
      )}
    </div>
  );
}

// ── Reviewer success detail ─────────────────────────────────────────────────

function ReviewerSuccessDetail({
  details,
}: {
  details: ReviewerSuccessDetails;
}) {
  const { result } = details;

  return (
    <div className="space-y-4">
      <AgentMetaStrip
        details={details}
        observedCommitSha={result.observedCommitSha}
        didCommitCode={result.didCommitCode}
        didModifyCode={result.didModifyCode}
      />

      {details.usage ? (
        <UsageBadge usage={details.usage} />
      ) : (
        <UsageUnavailable />
      )}

      {/* Reviewer pack info */}
      {details.reviewerPack && (
        <ReviewerPackInfo pack={details.reviewerPack} />
      )}

      {result.investigationSummary && (
        <DetailSection title="Investigation">
          <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap">
            {result.investigationSummary}
          </p>
        </DetailSection>
      )}

      {result.finalAssessment && (
        <DetailSection title="Assessment">
          <p className="text-xs text-foreground/70 leading-relaxed whitespace-pre-wrap">
            {result.finalAssessment}
          </p>
        </DetailSection>
      )}

      {result.whyNoCommit && (
        <DetailSection title="Why No Commit">
          <p className="text-xs text-amber-400/80 leading-relaxed">
            {result.whyNoCommit}
          </p>
        </DetailSection>
      )}

      {/* Reviewer outcome summary */}
      {result.didCommitCode && result.findings.length === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
          <GitCommit className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs text-emerald-400/80">
            Reviewer fixed its scoped issues — no unresolved findings remain
          </span>
        </div>
      )}

      {!result.didCommitCode && !result.didModifyCode && result.findings.length === 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
          <Eye className="h-3 w-3" />
          No findings, no code changes — nothing actionable for this reviewer
        </div>
      )}

      {/* Findings */}
      {result.findings.length > 0 && (
        <DetailSection title={`Findings (${result.findings.length})`}>
          <div className="space-y-2">
            {result.findings.map((f, i) => (
              <FindingCard key={i} finding={f} />
            ))}
          </div>
        </DetailSection>
      )}

      {/* Handoff items */}
      <HandoffSection items={result.handoffItems} />

      {result.commandsSummary.length > 0 && (
        <CommandsList commands={result.commandsSummary} />
      )}

      {details.providerMetadata && (
        <RawJsonToggle
          label="Provider Metadata"
          json={JSON.stringify(details.providerMetadata, null, 2)}
        />
      )}

      {details.logFilePath && (
        <div className="text-[10px] font-mono text-muted-foreground/40 truncate">
          legacy log: {details.logFilePath}
        </div>
      )}
    </div>
  );
}

// ── Reviewer pack info ──────────────────────────────────────────────────────

function ReviewerPackInfo({ pack }: { pack: ReviewerPack }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <Package className="h-3 w-3" />
        Reviewer Pack
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-mono rounded-md border border-border/40 bg-muted/10 px-3 py-2">
          <KV label="repo" value={pack.repoPath} />
          {pack.repoCommitSha && (
            <KV label="commit" value={pack.repoCommitSha.slice(0, 8)} />
          )}
          <KV label="entry" value={pack.entrypointPath} />
          {pack.knowledgeFilePaths.length > 0 && (
            <span>
              <span className="text-muted-foreground/60">knowledge: </span>
              <span className="text-foreground/70">
                {pack.knowledgeFilePaths.length} file
                {pack.knowledgeFilePaths.length !== 1 ? "s" : ""}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Finding card ────────────────────────────────────────────────────────────

function FindingCard({ finding }: { finding: ReviewerFinding }) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/10 p-3 space-y-1.5">
      <p className="text-xs font-medium text-foreground/90">{finding.title}</p>
      <OutcomeLine label="Action" text={finding.actionSummary} />
      <OutcomeLine label="Evidence" text={finding.evidenceSummary} />
    </div>
  );
}

// ── Handoff section ─────────────────────────────────────────────────────────

function HandoffSection({ items }: { items: HandoffItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
        <Forward className="h-3 w-3" />
        No handoff items
      </div>
    );
  }

  return (
    <DetailSection title={`Handoffs (${items.length})`}>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2"
          >
            <Forward className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-0.5">
              <span className="text-[10px] font-mono text-indigo-400">
                {item.targetReviewerId ?? "any"}
              </span>
              <p className="text-[11px] text-foreground/70 leading-relaxed">
                {item.summary}
              </p>
            </div>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

// ── Usage badge ─────────────────────────────────────────────────────────────

function UsageBadge({ usage }: { usage: TokenUsage }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/40 bg-muted/10 px-3 py-1.5">
      <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[11px] font-mono text-muted-foreground">
        <span className="text-foreground/70">
          {formatTokenCount(usage.inputTokens)}
        </span>
        <span className="text-muted-foreground/50"> in</span>
      </span>
      <span className="text-[11px] font-mono text-muted-foreground">
        <span className="text-foreground/70">
          {formatTokenCount(usage.outputTokens)}
        </span>
        <span className="text-muted-foreground/50"> out</span>
      </span>
      <span className="text-[11px] font-mono text-muted-foreground">
        <span className="text-foreground/70">
          {formatTokenCount(usage.totalTokens)}
        </span>
        <span className="text-muted-foreground/50"> total</span>
      </span>
      {usage.cachedInputTokens != null && usage.cachedInputTokens > 0 && (
        <span className="text-[11px] font-mono text-muted-foreground">
          <span className="text-emerald-400/70">
            {formatTokenCount(usage.cachedInputTokens)}
          </span>
          <span className="text-muted-foreground/50"> cached</span>
        </span>
      )}
    </div>
  );
}

function UsageUnavailable() {
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
      <Cpu className="h-3 w-3" />
      Usage unavailable
    </div>
  );
}

// ── Failed detail ───────────────────────────────────────────────────────────

function FailedDetail({ details }: { details: FailedRunDetails }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-rose-500/20 bg-rose-500/5 p-3">
        <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-mono text-rose-400">
            {details.errorType}
          </p>
          <p className="text-xs text-foreground/70">{details.errorMessage}</p>
        </div>
      </div>

      {details.startingHeadSha && (
        <div className="text-[11px] font-mono text-muted-foreground">
          Starting SHA: {details.startingHeadSha.slice(0, 8)}
        </div>
      )}

      {details.checkNames.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Targeted Checks
          </span>
          <div className="flex flex-wrap gap-1.5">
            {details.checkNames.map((name) => (
              <span
                key={name}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground ring-1 ring-inset ring-border"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {details.threadKeys.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Targeted Threads
          </span>
          <div className="flex flex-wrap gap-1.5">
            {details.threadKeys.map((key) => (
              <span
                key={key}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground ring-1 ring-inset ring-border"
              >
                {key}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Check / thread outcome cards ────────────────────────────────────────────

function CheckOutcomeCard({ outcome }: { outcome: CheckOutcome }) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/10 p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-mono font-medium text-foreground/90">
          {outcome.checkName}
        </span>
      </div>
      <OutcomeLine label="Reasoning" text={outcome.reasoningSummary} />
      <OutcomeLine label="Action" text={outcome.actionSummary} />
      <OutcomeLine label="Evidence" text={outcome.evidenceSummary} />
    </div>
  );
}

function ThreadOutcomeCard({ outcome }: { outcome: ThreadOutcome }) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/10 p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <code className="text-[11px] font-mono text-foreground/80">
          {outcome.threadKey}
        </code>
        <DispositionBadge disposition={outcome.disposition} />
      </div>
      <OutcomeLine label="Reasoning" text={outcome.reasoningSummary} />
      <OutcomeLine label="Action" text={outcome.actionSummary} />
      <OutcomeLine label="Evidence" text={outcome.evidenceSummary} />
      {outcome.githubCommentId && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MessageSquare className="h-3 w-3" />
          Comment: {outcome.githubCommentId}
        </div>
      )}
      {outcome.linearIssueId && (
        <div className="flex items-center gap-1.5 text-[11px] text-sky-400">
          <Ticket className="h-3 w-3" />
          {outcome.linearIssueId}
        </div>
      )}
    </div>
  );
}

function OutcomeLine({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <p className="text-[11px] text-foreground/70 leading-relaxed">
      <span className="font-medium text-muted-foreground">{label}:</span>{" "}
      {text}
    </p>
  );
}

// ── Commands list ───────────────────────────────────────────────────────────

function CommandsList({ commands }: { commands: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <Terminal className="h-3 w-3" />
        Commands ({commands.length})
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {open && (
        <div className="mt-1.5 rounded-md border border-border/40 bg-muted/20 p-2 space-y-0.5">
          {commands.map((cmd, i) => (
            <div
              key={i}
              className="text-[11px] font-mono text-foreground/60 truncate"
            >
              <span className="text-muted-foreground/60 select-none">$ </span>
              {cmd}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Raw JSON toggle ─────────────────────────────────────────────────────────

function RawJsonToggle({
  json,
  label = "Raw JSON",
  defaultOpen = false,
}: {
  json: string;
  label?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    formatted = json;
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <Code className="h-3 w-3" />
        {label}
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </button>
      {open && (
        <pre className="mt-1.5 max-h-64 overflow-auto rounded-md border border-border/40 bg-muted/20 p-3 text-[11px] font-mono text-muted-foreground leading-relaxed">
          {formatted}
        </pre>
      )}
    </div>
  );
}

// ── Small helpers ───────────────────────────────────────────────────────────

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-muted-foreground/60">{label}: </span>
      <span className="text-foreground/70">{value}</span>
    </span>
  );
}
