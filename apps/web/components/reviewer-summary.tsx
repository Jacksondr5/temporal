import { Check, AlertTriangle } from "lucide-react";
import { parseReviewerRunDetails, type RunDetails } from "../lib/run-details";
import { activityStreamEventHref } from "../lib/activity-stream-anchors";
import { StatusMark } from "./status-mark";
import { cn } from "../lib/utils";

/**
 * `<ReviewerSummary />` — compact current-SHA reviewer outcome block that
 * lives above the activity stream on PR detail.
 *
 * Per `docs/product/operator-ui-redesign.md` → "Component Patterns" →
 * "Reviewer summary widget", reviewer outcomes for the PR's current SHA
 * deserve to be visible at a glance instead of buried in the timeline. This
 * widget renders one row per reviewer (the most recent run for that
 * reviewer on the current `pr.headSha`), composed of:
 *
 *   - `<StatusMark status="reviewer" />` — the canonical reviewer glyph.
 *   - the reviewer ID (technical mono).
 *   - a summary glyph: ✓ "no findings" for clean runs, ⚠ "N findings" when
 *     the reviewer flagged anything. For runs that haven't reached a clean
 *     terminal state we surface the run status verbatim instead.
 *
 * The widget hides itself entirely when no reviewer has run on the current
 * SHA — there is nothing meaningful to summarize and the section header
 * would be misleading.
 *
 * Clicking a row scrolls the page to that reviewer's most recent activity-
 * stream event using the shared anchor scheme defined in
 * `lib/activity-stream-anchors.ts`. The same scheme is consumed by the
 * activity stream itself when it renders the matching event card, so the
 * deep link works regardless of which surface owns the click target.
 */

interface ReviewerRunInput {
  _id: string;
  reviewerId: string;
  status: string;
  targetHeadSha: string;
  summary: string | null;
  detailsJson: string | null;
  createdAt: string;
}

export interface ReviewerSummaryProps {
  /** Current PR HEAD SHA — runs not on this SHA are filtered out. */
  headSha: string;
  /**
   * Reviewer runs returned by `ui.getPullRequestDetail`. Expected to be
   * ordered by `createdAt` desc (which is the query's existing contract);
   * the widget only relies on stable order to pick the most recent run per
   * reviewer.
   */
  reviewerRuns: ReviewerRunInput[];
  className?: string;
}

export function ReviewerSummary({
  headSha,
  reviewerRuns,
  className,
}: ReviewerSummaryProps) {
  const rows = selectMostRecentRunPerReviewerOnSha(reviewerRuns, headSha);

  // Hide entirely when nothing has run on the current SHA — the section
  // header itself disappears so the page does not advertise empty state.
  if (rows.length === 0) {
    return null;
  }

  return (
    <section
      className={cn(
        "rounded-none border border-border/60 bg-card/50 px-4 py-3",
        className,
      )}
      aria-labelledby="reviewer-summary-heading"
    >
      <h2
        id="reviewer-summary-heading"
        className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        Reviewers on this SHA
      </h2>
      <ul className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <ReviewerSummaryRow key={row.run._id} row={row} />
        ))}
      </ul>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Row
   ────────────────────────────────────────────────────────────────────── */

function ReviewerSummaryRow({ row }: { row: ReviewerSummaryRowData }) {
  const { run, outcome } = row;
  const href = activityStreamEventHref("reviewer_run", run._id);

  return (
    <li>
      <a
        href={href}
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1 -mx-2",
          "text-xs transition-colors",
          "hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        )}
      >
        <StatusMark status="reviewer" size="sm" label={null} />
        <span className="font-mono font-medium text-foreground/90 truncate">
          {run.reviewerId}
        </span>
        <ReviewerOutcomeGlyph outcome={outcome} />
      </a>
    </li>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Outcome glyph — encodes "no findings" vs finding count vs non-terminal
   states. Kept inline in this file because the mapping is private to the
   widget; if a second surface needs the same glyph we'll lift it.
   ────────────────────────────────────────────────────────────────────── */

type ReviewerOutcome =
  | { kind: "clean" }
  | { kind: "findings"; count: number }
  | { kind: "running" }
  | { kind: "failed" }
  | { kind: "blocked" }
  | { kind: "skipped" }
  | { kind: "unknown" };

function ReviewerOutcomeGlyph({ outcome }: { outcome: ReviewerOutcome }) {
  switch (outcome.kind) {
    case "clean":
      return (
        <span className="ml-auto inline-flex items-center gap-1 text-status-healthy/90">
          <Check className="h-3.5 w-3.5" aria-hidden />
          <span>no findings</span>
        </span>
      );
    case "findings":
      return (
        <span className="ml-auto inline-flex items-center gap-1 text-status-caution">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          <span className="tabular-nums">
            {outcome.count} finding{outcome.count === 1 ? "" : "s"}
          </span>
          <span className="text-muted-foreground/70"> — see stream</span>
        </span>
      );
    case "running":
      return <span className="ml-auto text-status-live/90">Running</span>;
    case "failed":
      return <span className="ml-auto text-status-blocked">Failed</span>;
    case "blocked":
      return <span className="ml-auto text-status-blocked">Blocked</span>;
    case "skipped":
      return <span className="ml-auto text-muted-foreground/60">Skipped</span>;
    case "unknown":
      return null;
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Selection + outcome derivation. Pure functions so they're trivially
   testable and the component itself stays thin.
   ────────────────────────────────────────────────────────────────────── */

interface ReviewerSummaryRowData {
  run: ReviewerRunInput;
  outcome: ReviewerOutcome;
}

/**
 * Pick the most recent run per `reviewerId` whose `targetHeadSha` matches
 * the PR's current `headSha`. Relies on the input being sorted by
 * `createdAt` desc — the first occurrence of any reviewerId is the most
 * recent. If the contract ever weakens we'd switch to an explicit
 * comparison, but the widget's only caller (`ui.getPullRequestDetail`)
 * orders by `createdAt` desc.
 */
function selectMostRecentRunPerReviewerOnSha(
  runs: ReviewerRunInput[],
  headSha: string,
): ReviewerSummaryRowData[] {
  const seen = new Set<string>();
  const rows: ReviewerSummaryRowData[] = [];

  for (const run of runs) {
    if (run.targetHeadSha !== headSha) continue;
    if (seen.has(run.reviewerId)) continue;
    seen.add(run.reviewerId);
    rows.push({ run, outcome: deriveReviewerOutcome(run) });
  }

  return rows;
}

function deriveReviewerOutcome(run: ReviewerRunInput): ReviewerOutcome {
  // Non-terminal/error statuses short-circuit before parsing details, since
  // the details payload is unreliable for those cases.
  switch (run.status) {
    case "running":
      return { kind: "running" };
    case "failed":
      return { kind: "failed" };
    case "blocked":
      return { kind: "blocked" };
    case "skipped":
    case "noop":
      return { kind: "skipped" };
  }

  const details = parseReviewerRunDetails(run.detailsJson);
  const findingCount = findingCountFromDetails(details);
  if (findingCount === null) {
    return { kind: "unknown" };
  }
  if (findingCount === 0) {
    return { kind: "clean" };
  }
  return { kind: "findings", count: findingCount };
}

function findingCountFromDetails(details: RunDetails): number | null {
  if (details.kind === "reviewer_success") {
    return details.result.findings.length;
  }
  // Any other kind on a successful reviewer run means we couldn't parse
  // findings — surface "unknown" upstream rather than guessing zero.
  return null;
}
