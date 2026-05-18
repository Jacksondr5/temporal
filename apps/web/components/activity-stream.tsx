"use client";

import { usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Activity } from "lucide-react";
import { cn } from "../lib/utils";
import { activityStreamEventAnchor } from "../lib/activity-stream-anchors";
import { Button } from "./ui/button";
import {
  AgentRunEventCard,
  ErrorEventCard,
  GitHubEventCard,
  ReviewerEventCard,
  type ActivityStreamEvent,
  type ActivityStreamMode,
  type CommitArtifactInfo,
  type CommitArtifactLookup,
} from "./event-cards";

/**
 * `<ActivityStream />` — the unified operator/inspector activity stream
 * (per `docs/product/operator-ui-redesign.md` → "Component Patterns" →
 * "Activity stream").
 *
 * Replaces today's separate sections — Reconciliation Timeline, Specialized
 * Reviewers, Artifacts, PR Events — with one vertical timeline whose dots
 * speak the canonical status vocabulary, whose cards foreground agent
 * reasoning and pushed commits, and whose filter chips drive the server-side
 * filter argument on `ui.listActivityStreamEvents`.
 *
 * In Operator mode, the server filters out noops and non-manual GitHub
 * events, so consecutive reconciliations never reach the client and the
 * grouping logic the legacy reconciliation timeline used to implement is
 * unnecessary. Inspector mode (JAC-190) keeps the same payload but flips
 * the cards into their inspector variant — surfacing the SHA pair,
 * internal phase enums, provider metadata, workspace path, reviewer pack,
 * command summaries, raw JSON toggle, and token usage badge.
 */

// Re-export for callers that want to type a `mode` prop without reaching
// into `./event-cards` directly. The canonical definition lives there so
// the cards can take it as a prop without introducing a circular type
// dependency back into `activity-stream.tsx`.
export type { ActivityStreamMode };

export type ActivityStreamFilter =
  | "all"
  | "agent_runs"
  | "reviewers"
  | "errors"
  | "github";

interface FilterChipDefinition {
  id: ActivityStreamFilter;
  label: string;
}

const FILTER_CHIPS: readonly FilterChipDefinition[] = [
  { id: "all", label: "All" },
  { id: "agent_runs", label: "Agent runs" },
  { id: "reviewers", label: "Reviewers" },
  { id: "errors", label: "Errors" },
  { id: "github", label: "GitHub" },
] as const;

const INITIAL_PAGE_SIZE = 25;
const LOAD_MORE_PAGE_SIZE = 25;

export interface ActivityStreamProps {
  repoSlug: string;
  prNumber: number;
  mode: ActivityStreamMode;
  now: number;
  filter: ActivityStreamFilter;
  onFilterChange: (filter: ActivityStreamFilter) => void;
  /**
   * Optional pre-fetched commit artifacts (`artifactKind === "commit"`).
   * Used to populate the inline `<CommitChip />` for runs that pushed a
   * commit. The list does not need to be exhaustive — runs whose commit
   * isn't in the list fall back to the run's `summary` per Gap 3 in the
   * redesign doc.
   */
  commitArtifacts?: readonly {
    externalId: string;
    commitMessage: string | null;
    commitStats: {
      additions: number;
      deletions: number;
      files: number;
    } | null;
  }[];
}

export function ActivityStream({
  repoSlug,
  prNumber,
  mode,
  now,
  filter,
  onFilterChange,
  commitArtifacts,
}: ActivityStreamProps) {
  const { results, status, isLoading, loadMore } = usePaginatedQuery(
    api.ui.listActivityStreamEvents,
    {
      repoSlug,
      prNumber,
      filter,
      mode,
    },
    { initialNumItems: INITIAL_PAGE_SIZE },
  );

  // Build a SHA → artifact map once per render. The React Compiler
  // memoises this for us, so we don't reach for `useMemo` manually
  // (`react-hooks/preserve-manual-memoization`). Extracting the index
  // creation to a helper keeps the body of `<ActivityStream />` readable
  // and gives the compiler a clean function-body boundary to memoise.
  const lookupCommit = buildCommitLookup(commitArtifacts);

  return (
    <section
      aria-label="Activity stream"
      className="space-y-3"
      data-mode={mode}
    >
      <FilterChipBar
        filter={filter}
        onFilterChange={onFilterChange}
        eventCount={results.length}
        countIsFinal={status === "Exhausted"}
      />

      <ActivityStreamBody
        status={status}
        isLoading={isLoading}
        events={results}
        repoSlug={repoSlug}
        mode={mode}
        now={now}
        lookupCommit={lookupCommit}
        onLoadMore={() => loadMore(LOAD_MORE_PAGE_SIZE)}
      />
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Filter chips
   ────────────────────────────────────────────────────────────────────── */

function FilterChipBar({
  filter,
  onFilterChange,
  eventCount,
  countIsFinal,
}: {
  filter: ActivityStreamFilter;
  onFilterChange: (filter: ActivityStreamFilter) => void;
  eventCount: number;
  countIsFinal: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border border-border-hairline bg-surface-charcoal-deep p-1">
      <span className="px-2 font-mono text-micro uppercase tracking-[0.18em] text-muted-foreground">
        Filters
      </span>
      {FILTER_CHIPS.map((chip) => {
        const active = chip.id === filter;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onFilterChange(chip.id)}
            aria-pressed={active}
            className={cn(
              "border px-2.5 py-1 font-chrome text-[11px] font-bold uppercase tracking-[0.16em] transition",
              active
                ? "border-status-live bg-status-live text-surface-charcoal-deep"
                : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            {chip.label}
          </button>
        );
      })}
      <span className="ml-auto px-2 font-mono text-micro uppercase tracking-[0.12em] tabular-nums text-muted-foreground">
        {eventCount}{" "}
        {countIsFinal
          ? eventCount === 1
            ? "event"
            : "events"
          : "shown"}
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Body — timeline + load more / loading / empty states
   ────────────────────────────────────────────────────────────────────── */

interface ActivityStreamBodyProps {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  isLoading: boolean;
  events: readonly ActivityStreamEvent[];
  repoSlug: string;
  mode: ActivityStreamMode;
  now: number;
  lookupCommit: CommitArtifactLookup;
  onLoadMore: () => void;
}

function ActivityStreamBody({
  status,
  isLoading,
  events,
  repoSlug,
  mode,
  now,
  lookupCommit,
  onLoadMore,
}: ActivityStreamBodyProps) {
  if (status === "LoadingFirstPage") {
    return <ActivityStreamSkeleton />;
  }

  if (events.length === 0) {
    return <ActivityStreamEmpty />;
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        {/* Vertical spine */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-2 top-1.5 bottom-1.5 w-px bg-border-hairline"
        />
        <ol className="space-y-3 pl-6" role="list">
        {events.map((event) => (
          <li
            key={eventKey(event)}
            // Shared deep-link target — see `lib/activity-stream-anchors.ts`.
            // `<ReviewerSummary />` (JAC-186) and any future surface that
            // wants to scroll to a specific event uses the matching href via
            // `activityStreamEventHref()`. Apply `scroll-mt` so the anchored
            // card sits below the page chrome rather than flush against
            // the viewport edge when navigated to.
            id={activityStreamEventAnchor(
              event.eventType,
              event.source._id,
            )}
            className="relative scroll-mt-24"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -left-6 top-3.5 flex h-3 w-3 items-center justify-center bg-surface-canvas"
            />
            <EventCardForType
              event={event}
              repoSlug={repoSlug}
              mode={mode}
              now={now}
              lookupCommit={lookupCommit}
            />
          </li>
        ))}
        </ol>
      </div>

      {status !== "Exhausted" && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading || status === "LoadingMore"}
            onClick={onLoadMore}
          >
            {status === "LoadingMore" ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Stable, source-derived key for a stream event. We can't use the page
 * index because pages are concatenated server-side from multiple sources,
 * and React's reconciliation needs an identity that survives a Load More
 * reorder.
 */
function eventKey(event: ActivityStreamEvent): string {
  return `${event.eventType}:${event.source._id}`;
}

function EventCardForType({
  event,
  repoSlug,
  mode,
  now,
  lookupCommit,
}: {
  event: ActivityStreamEvent;
  repoSlug: string;
  mode: ActivityStreamMode;
  now: number;
  lookupCommit: CommitArtifactLookup;
}) {
  switch (event.eventType) {
    case "agent_run":
      return (
        <AgentRunEventCard
          run={event.source}
          eventTime={event.eventTime}
          repoSlug={repoSlug}
          mode={mode}
          lookupCommit={lookupCommit}
        />
      );
    case "reviewer_run":
      return (
        <ReviewerEventCard
          run={event.source}
          eventTime={event.eventTime}
          repoSlug={repoSlug}
          mode={mode}
          lookupCommit={lookupCommit}
        />
      );
    case "workflow_error":
      return (
        <ErrorEventCard
          error={event.source}
          eventTime={event.eventTime}
          mode={mode}
        />
      );
    case "github_event":
      return (
        <GitHubEventCard
          event={event.source}
          eventTime={event.eventTime}
          now={now}
          mode={mode}
        />
      );
  }
}

function ActivityStreamSkeleton() {
  // Cap at 4 rows per the redesign's "Empty and loading states" guidance
  // ("shimmer rows that match the new row layout, capped at 4 rows so the
  // page doesn't feel like a slot machine on every nav").
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-2 top-1.5 bottom-1.5 w-px bg-border-hairline"
      />
      <ol className="space-y-3 pl-6" role="list" aria-busy>
        {Array.from({ length: 4 }).map((_, index) => (
          <li key={index} className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute -left-6 top-3.5 h-3 w-3 border border-border-hairline bg-surface-panel"
            />
            <div className="h-14 w-full animate-shimmer" />
          </li>
        ))}
      </ol>
    </div>
  );
}

function ActivityStreamEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-border-hairline bg-surface-panel/30 px-4 py-12 text-muted-foreground">
      <Activity className="h-5 w-5 opacity-60" aria-hidden />
      <p className="text-meta">No activity matches the current filter yet.</p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Commit-artifact index
   ────────────────────────────────────────────────────────────────────── */

function buildCommitLookup(
  commitArtifacts: ActivityStreamProps["commitArtifacts"],
): CommitArtifactLookup {
  if (!commitArtifacts || commitArtifacts.length === 0) {
    return EMPTY_COMMIT_LOOKUP;
  }
  const index = new Map<string, CommitArtifactInfo>();
  for (const artifact of commitArtifacts) {
    index.set(artifact.externalId, {
      message: artifact.commitMessage,
      stats: artifact.commitStats,
    });
  }
  return (sha) => index.get(sha);
}

const EMPTY_COMMIT_LOOKUP: CommitArtifactLookup = () => undefined;
