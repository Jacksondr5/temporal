import { cn } from "../lib/utils";
import type {
  CheckOutcome,
  HandoffItem,
  ReviewerFinding,
  ThreadOutcome,
} from "../lib/run-details";
import {
  mapDispositionToStatus,
  operatorDispositionLabel,
} from "../lib/status";
import { StatusMark } from "./status-mark";

/**
 * `<AgentReasoning />` — prose-quality renderer for the Story-layer reasoning
 * fields produced by an agent run.
 *
 * Per `PRODUCT.md`, agent reasoning is the product.
 * The fields rendered here are:
 *
 * - `investigationSummary`        — what the agent looked into
 * - `finalAssessment`             — what it concluded
 * - `whyNoCommit`                 — only when no commit was pushed
 * - `checks` (per-check outcomes) — for `fix_checks` runs
 * - `threads` (per-thread)        — for `handle_code_rabbit` runs
 * - `findings` (reviewer)         — for specialized reviewer runs
 * - `handoffItems`                — reviewer handoffs to other reviewers
 *
 * The layout favors readable prose over tabular detail, with section labels
 * carried in the canonical `text-micro` style. Inspector-only metadata
 * (commands, provider metadata, raw JSON, token usage) is intentionally
 * absent — it lives on the Inspector tree, not the Operator one.
 */

export interface AgentReasoningProps {
  investigationSummary?: string | null;
  finalAssessment?: string | null;
  whyNoCommit?: string | null;
  checks?: readonly CheckOutcome[];
  threads?: readonly ThreadOutcome[];
  findings?: readonly ReviewerFinding[];
  handoffItems?: readonly HandoffItem[];
  className?: string;
}

export function AgentReasoning({
  investigationSummary,
  finalAssessment,
  whyNoCommit,
  checks,
  threads,
  findings,
  handoffItems,
  className,
}: AgentReasoningProps) {
  const hasInvestigation =
    typeof investigationSummary === "string" && investigationSummary.length > 0;
  const hasAssessment =
    typeof finalAssessment === "string" && finalAssessment.length > 0;
  const hasWhyNoCommit =
    typeof whyNoCommit === "string" && whyNoCommit.length > 0;
  const hasChecks = (checks?.length ?? 0) > 0;
  const hasThreads = (threads?.length ?? 0) > 0;
  const hasFindings = (findings?.length ?? 0) > 0;
  const hasHandoffs = (handoffItems?.length ?? 0) > 0;

  const isEmpty =
    !hasInvestigation &&
    !hasAssessment &&
    !hasWhyNoCommit &&
    !hasChecks &&
    !hasThreads &&
    !hasFindings &&
    !hasHandoffs;

  if (isEmpty) {
    return (
      <p className={cn("text-meta italic text-muted-foreground", className)}>
        The agent did not record reasoning for this run.
      </p>
    );
  }

  return (
    <div className={cn("max-w-[80ch] space-y-4", className)}>
      {hasInvestigation && (
        <ReasoningSection title="Investigation">
          <ReasoningProse text={investigationSummary as string} />
        </ReasoningSection>
      )}

      {hasAssessment && (
        <ReasoningSection title="Assessment">
          <ReasoningProse text={finalAssessment as string} />
        </ReasoningSection>
      )}

      {hasWhyNoCommit && (
        <ReasoningSection title="Why no commit">
          <p className="text-body leading-relaxed text-status-caution">
            {whyNoCommit}
          </p>
        </ReasoningSection>
      )}

      {hasChecks && (
        <ReasoningSection title={`Per-check outcomes (${checks!.length})`}>
          <ul className="space-y-3">
            {checks!.map((outcome, index) => (
              <CheckOutcomeRow
                key={`${outcome.checkName}-${index}`}
                outcome={outcome}
              />
            ))}
          </ul>
        </ReasoningSection>
      )}

      {hasThreads && (
        <ReasoningSection title={`Per-thread outcomes (${threads!.length})`}>
          <ul className="space-y-3">
            {threads!.map((outcome, index) => (
              <ThreadOutcomeRow
                key={`${outcome.threadKey}-${index}`}
                outcome={outcome}
              />
            ))}
          </ul>
        </ReasoningSection>
      )}

      {hasFindings && (
        <ReasoningSection title={`Findings (${findings!.length})`}>
          <ul className="space-y-3">
            {findings!.map((finding, index) => (
              <FindingRow key={`${finding.title}-${index}`} finding={finding} />
            ))}
          </ul>
        </ReasoningSection>
      )}

      {hasHandoffs && (
        <ReasoningSection title={`Handoffs (${handoffItems!.length})`}>
          <ul className="space-y-2">
            {handoffItems!.map((handoff, index) => (
              <HandoffRow
                key={`${handoff.targetReviewerId ?? "any"}-${index}`}
                item={handoff}
              />
            ))}
          </ul>
        </ReasoningSection>
      )}
    </div>
  );
}

function ReasoningSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-micro font-semibold uppercase text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

/**
 * Renders a free-form text blob from an agent as readable prose. Preserves
 * paragraph breaks, leaves URLs un-tampered with, and uses the narrative
 * Argon mono only for the small reasoning quotation marks the design calls
 * for so longer paragraphs read as plain prose. The text is wrapped in
 * `whitespace-pre-wrap` so the agent's intentional newlines survive.
 */
function ReasoningProse({ text }: { text: string }) {
  return (
    <p className="text-body leading-relaxed text-foreground/85 whitespace-pre-wrap">
      {text}
    </p>
  );
}

function CheckOutcomeRow({ outcome }: { outcome: CheckOutcome }) {
  return (
    <li className="border border-border-hairline bg-surface-inset/40 p-3">
      <div className="flex items-center gap-2">
        <code className="text-mono-sm font-mono text-foreground/85">
          {outcome.checkName}
        </code>
      </div>
      <OutcomeLines
        reasoning={outcome.reasoningSummary}
        action={outcome.actionSummary}
        evidence={outcome.evidenceSummary}
      />
    </li>
  );
}

function ThreadOutcomeRow({ outcome }: { outcome: ThreadOutcome }) {
  const status = mapDispositionToStatus(outcome.disposition);
  return (
    <li className="border border-border-hairline bg-surface-inset/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusMark status={status} size="sm" label={null} />
        <code className="text-mono-sm font-mono text-foreground/85">
          {outcome.threadKey}
        </code>
        <span className="text-meta text-muted-foreground">
          {operatorDispositionLabel(outcome.disposition)}
        </span>
        {outcome.linearIssueId && (
          <code className="ml-auto text-mono-sm font-mono text-status-deferred">
            {outcome.linearIssueId}
          </code>
        )}
      </div>
      <OutcomeLines
        reasoning={outcome.reasoningSummary}
        action={outcome.actionSummary}
        evidence={outcome.evidenceSummary}
      />
    </li>
  );
}

function FindingRow({ finding }: { finding: ReviewerFinding }) {
  return (
    <li className="border border-border-hairline bg-surface-inset/40 p-3">
      <p className="text-body font-medium text-foreground">{finding.title}</p>
      <OutcomeLines
        action={finding.actionSummary}
        evidence={finding.evidenceSummary}
      />
    </li>
  );
}

function HandoffRow({ item }: { item: HandoffItem }) {
  return (
    <li className="border border-border-hairline bg-surface-inset/40 px-3 py-2">
      <div className="flex items-baseline gap-2">
        <StatusMark status="deferred" size="sm" label={null} />
        <code className="text-mono-sm font-mono text-status-deferred">
          {item.targetReviewerId ?? "any reviewer"}
        </code>
      </div>
      <p className="mt-1 text-body leading-relaxed text-foreground/85">
        {item.summary}
      </p>
    </li>
  );
}

function OutcomeLines({
  reasoning,
  action,
  evidence,
}: {
  reasoning?: string;
  action?: string;
  evidence?: string;
}) {
  const showReasoning = reasoning && reasoning.length > 0;
  const showAction = action && action.length > 0;
  const showEvidence = evidence && evidence.length > 0;

  if (!showReasoning && !showAction && !showEvidence) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {showReasoning && <OutcomeLine label="Reasoning" text={reasoning!} />}
      {showAction && <OutcomeLine label="Action" text={action!} />}
      {showEvidence && <OutcomeLine label="Evidence" text={evidence!} />}
    </div>
  );
}

function OutcomeLine({ label, text }: { label: string; text: string }) {
  return (
    <p className="text-meta leading-relaxed text-foreground/80">
      <span className="font-medium text-muted-foreground">{label}:</span> {text}
    </p>
  );
}
