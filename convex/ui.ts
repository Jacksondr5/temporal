import { v } from "convex/values";
import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * UI-optimized read-model queries for the operator dashboard.
 *
 * These queries are designed to minimize waterfall fetches from the
 * Next.js frontend by joining data across tables server-side.
 */

// ---------------------------------------------------------------------------
// PR List
// ---------------------------------------------------------------------------

export const listPullRequests = query({
  args: {},
  handler: async (ctx) => {
    const prs = await ctx.db.query("pullRequests").order("desc").take(200);

    return Promise.all(
      prs.map(async (pr) => {
        const latestRun = await ctx.db
          .query("prRuns")
          .withIndex("by_repo_slug_and_pr_number_and_started_at", (q) =>
            q.eq("repoSlug", pr.repoSlug).eq("prNumber", pr.prNumber),
          )
          .order("desc")
          .take(1);

        return {
          ...pr,
          title: pr.title ?? "",
          lifecycleState: pr.lifecycleState ?? "open",
          hasBlockingError: pr.blockedReason !== null,
          latestRunStatus: latestRun[0]?.status ?? null,
          latestRunPhase: latestRun[0]?.phase ?? null,
          latestRunSummary: latestRun[0]?.summary ?? null,
          latestRunCompletedAt: latestRun[0]?.completedAt ?? null,
        };
      }),
    );
  },
});

// ---------------------------------------------------------------------------
// PR Detail
// ---------------------------------------------------------------------------

export const getPullRequestDetail = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const pr = await ctx.db
      .query("pullRequests")
      .withIndex("by_repo_slug_and_pr_number", (q) =>
        q.eq("repoSlug", args.repoSlug).eq("prNumber", args.prNumber),
      )
      .unique();

    if (!pr) return null;

    const [threads, runs, reviewerRuns, artifacts, errors, events] =
      await Promise.all([
        ctx.db
          .query("reviewThreads")
          .withIndex("by_repo_slug_and_pr_number_and_thread_key", (q) =>
            q.eq("repoSlug", args.repoSlug).eq("prNumber", args.prNumber),
          )
          .take(200),
        ctx.db
          .query("prRuns")
          .withIndex("by_repo_slug_and_pr_number_and_started_at", (q) =>
            q.eq("repoSlug", args.repoSlug).eq("prNumber", args.prNumber),
          )
          .order("desc")
          .take(50),
        ctx.db
          .query("reviewerRuns")
          .withIndex("by_repo_slug_and_pr_number_and_created_at", (q) =>
            q.eq("repoSlug", args.repoSlug).eq("prNumber", args.prNumber),
          )
          .order("desc")
          .take(50),
        ctx.db
          .query("artifacts")
          .withIndex("by_repo_slug_and_pr_number_and_created_at", (q) =>
            q.eq("repoSlug", args.repoSlug).eq("prNumber", args.prNumber),
          )
          .order("desc")
          .take(100),
        ctx.db
          .query("workflowErrors")
          .withIndex("by_repo_slug_and_pr_number_and_last_seen_at", (q) =>
            q.eq("repoSlug", args.repoSlug).eq("prNumber", args.prNumber),
          )
          .order("desc")
          .take(50),
        ctx.db
          .query("githubEvents")
          .withIndex("by_repo_slug_and_pr_number_and_observed_at", (q) =>
            q.eq("repoSlug", args.repoSlug).eq("prNumber", args.prNumber),
          )
          .order("desc")
          .take(100),
      ]);

    // Enrich threads with their latest decisions
    const threadsWithDecisions = await Promise.all(
      threads.map(async (thread) => {
        const decisions = await ctx.db
          .query("threadDecisions")
          .withIndex(
            "by_repo_slug_and_pr_number_and_thread_key_and_created_at",
            (q) =>
              q
                .eq("repoSlug", args.repoSlug)
                .eq("prNumber", args.prNumber)
                .eq("threadKey", thread.threadKey),
          )
          .order("desc")
          .take(5);

        return {
          ...thread,
          decisions,
        };
      }),
    );

    return {
      pr: {
        ...pr,
        title: pr.title ?? "",
        lifecycleState: pr.lifecycleState ?? "open",
      },
      threads: threadsWithDecisions,
      runs,
      reviewerRuns,
      artifacts,
      errors,
      events,
    };
  },
});

// ---------------------------------------------------------------------------
// Activity Stream
// ---------------------------------------------------------------------------

const ACTIVITY_STREAM_PAGE_SIZE = 25;
const ACTIVITY_STREAM_SOURCE_LIMIT = 100;

const activityStreamFilterValidator = v.union(
  v.literal("all"),
  v.literal("agent_runs"),
  v.literal("reviewers"),
  v.literal("errors"),
  v.literal("github"),
);

const activityStreamModeValidator = v.union(
  v.literal("operator"),
  v.literal("inspector"),
);

type ActivityStreamFilter =
  | "all"
  | "agent_runs"
  | "reviewers"
  | "errors"
  | "github";
type ActivityStreamMode = "operator" | "inspector";
type ActivityStreamEventType =
  | "agent_run"
  | "reviewer_run"
  | "workflow_error"
  | "github_event";

type ActivityStreamCursor = {
  eventTime: string;
  eventType: ActivityStreamEventType;
  id: string;
};

type ActivityStreamEvent =
  | {
      eventType: "agent_run";
      eventTime: string;
      source: Doc<"prRuns">;
      cursor: ActivityStreamCursor;
    }
  | {
      eventType: "reviewer_run";
      eventTime: string;
      source: Doc<"reviewerRuns">;
      cursor: ActivityStreamCursor;
    }
  | {
      eventType: "workflow_error";
      eventTime: string;
      source: Doc<"workflowErrors">;
      cursor: ActivityStreamCursor;
    }
  | {
      eventType: "github_event";
      eventTime: string;
      source: Doc<"githubEvents">;
      cursor: ActivityStreamCursor;
    };

function parseActivityStreamCursor(
  cursor: string | null,
): ActivityStreamCursor | null {
  if (cursor === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(cursor) as Partial<ActivityStreamCursor>;
    if (
      typeof parsed.eventTime === "string" &&
      typeof parsed.eventType === "string" &&
      typeof parsed.id === "string"
    ) {
      return parsed as ActivityStreamCursor;
    }
  } catch {
    return null;
  }

  return null;
}

function buildActivityStreamCursor(
  eventTime: string,
  eventType: ActivityStreamEventType,
  id: Id<"prRuns" | "reviewerRuns" | "workflowErrors" | "githubEvents">,
): ActivityStreamCursor {
  return { eventTime, eventType, id };
}

function compareActivityStreamCursors(
  left: ActivityStreamCursor,
  right: ActivityStreamCursor,
): number {
  const time = right.eventTime.localeCompare(left.eventTime);
  if (time !== 0) return time;

  const eventType = left.eventType.localeCompare(right.eventType);
  if (eventType !== 0) return eventType;

  return left.id.localeCompare(right.id);
}

function isAfterCursor(
  event: ActivityStreamEvent,
  cursor: ActivityStreamCursor | null,
): boolean {
  if (cursor === null) {
    return true;
  }

  return compareActivityStreamCursors(event.cursor, cursor) > 0;
}

function includeActivitySource(
  filter: ActivityStreamFilter,
  eventType: ActivityStreamEventType,
): boolean {
  return (
    filter === "all" ||
    (filter === "agent_runs" && eventType === "agent_run") ||
    (filter === "reviewers" && eventType === "reviewer_run") ||
    (filter === "errors" && eventType === "workflow_error") ||
    (filter === "github" && eventType === "github_event")
  );
}

function includeAgentRunInMode(
  run: Doc<"prRuns">,
  mode: ActivityStreamMode,
): boolean {
  return mode === "inspector" || run.phase !== "noop";
}

function includeGitHubEventInMode(
  event: Doc<"githubEvents">,
  mode: ActivityStreamMode,
): boolean {
  return mode === "inspector" || event.kind === "manual";
}

export const listActivityStreamEvents = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    filter: activityStreamFilterValidator,
    mode: activityStreamModeValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const cursor = parseActivityStreamCursor(args.paginationOpts.cursor);
    const events: ActivityStreamEvent[] = [];

    // This query merges several independently indexed sources. Convex permits
    // only one `.paginate()` per query, so each source is read as a bounded
    // page and merged into a synthetic cursor protocol.
    if (includeActivitySource(args.filter, "agent_run")) {
      const runs = await ctx.db
        .query("prRuns")
        .withIndex("by_repo_slug_and_pr_number_and_started_at", (q) =>
          q.eq("repoSlug", args.repoSlug).eq("prNumber", args.prNumber),
        )
        .order("desc")
        .take(ACTIVITY_STREAM_SOURCE_LIMIT);

      events.push(
        ...runs
          .filter((run) => includeAgentRunInMode(run, args.mode))
          .map((run) => {
            const eventTime = run.completedAt ?? run.startedAt;
            return {
              eventType: "agent_run" as const,
              eventTime,
              source: run,
              cursor: buildActivityStreamCursor(
                eventTime,
                "agent_run",
                run._id,
              ),
            };
          }),
      );
    }

    if (includeActivitySource(args.filter, "reviewer_run")) {
      const reviewerRuns = await ctx.db
        .query("reviewerRuns")
        .withIndex("by_repo_slug_and_pr_number_and_created_at", (q) =>
          q.eq("repoSlug", args.repoSlug).eq("prNumber", args.prNumber),
        )
        .order("desc")
        .take(ACTIVITY_STREAM_SOURCE_LIMIT);

      events.push(
        ...reviewerRuns.map((run) => ({
          eventType: "reviewer_run" as const,
          eventTime: run.createdAt,
          source: run,
          cursor: buildActivityStreamCursor(
            run.createdAt,
            "reviewer_run",
            run._id,
          ),
        })),
      );
    }

    if (includeActivitySource(args.filter, "workflow_error")) {
      const errors = await ctx.db
        .query("workflowErrors")
        .withIndex("by_repo_slug_and_pr_number_and_last_seen_at", (q) =>
          q.eq("repoSlug", args.repoSlug).eq("prNumber", args.prNumber),
        )
        .order("desc")
        .take(ACTIVITY_STREAM_SOURCE_LIMIT);

      events.push(
        ...errors.map((error) => ({
          eventType: "workflow_error" as const,
          eventTime: error.lastSeenAt,
          source: {
            ...error,
            errorStack: error.errorStack ?? null,
          },
          cursor: buildActivityStreamCursor(
            error.lastSeenAt,
            "workflow_error",
            error._id,
          ),
        })),
      );
    }

    if (includeActivitySource(args.filter, "github_event")) {
      const githubEvents = await ctx.db
        .query("githubEvents")
        .withIndex("by_repo_slug_and_pr_number_and_observed_at", (q) =>
          q.eq("repoSlug", args.repoSlug).eq("prNumber", args.prNumber),
        )
        .order("desc")
        .take(ACTIVITY_STREAM_SOURCE_LIMIT);

      events.push(
        ...githubEvents
          .filter((event) => includeGitHubEventInMode(event, args.mode))
          .map((event) => ({
            eventType: "github_event" as const,
            eventTime: event.observedAt,
            source: event,
            cursor: buildActivityStreamCursor(
              event.observedAt,
              "github_event",
              event._id,
            ),
          })),
      );
    }

    const sorted = events
      .filter((event) => isAfterCursor(event, cursor))
      .sort((left, right) =>
        compareActivityStreamCursors(left.cursor, right.cursor),
      );
    const page = sorted.slice(0, ACTIVITY_STREAM_PAGE_SIZE);
    const hasMore = sorted.length > ACTIVITY_STREAM_PAGE_SIZE;
    const continueCursor =
      hasMore && page.length > 0
        ? JSON.stringify(page[page.length - 1].cursor)
        : "";

    return {
      page: page.map(({ cursor: _cursor, ...event }) => event),
      isDone: !hasMore,
      continueCursor,
    };
  },
});

// ---------------------------------------------------------------------------
// Repo + Policy management
// ---------------------------------------------------------------------------

const DASHBOARD_COUNT_LIMIT = 1000;

export const listReposWithPolicies = query({
  args: {},
  handler: async (ctx) => {
    const repos = await ctx.db.query("repos").take(100);

    return Promise.all(
      repos.map(async (repo) => {
        const policy = await ctx.db
          .query("repoPolicies")
          .withIndex("by_repo_slug", (q) => q.eq("repoSlug", repo.slug))
          .unique();

        // Keep these as bounded `.take()` reads. Convex allows only one
        // paginated query per function, so converting these dashboard counts
        // to `.paginate()` reintroduces the policies page runtime error.
        const boundedCount = async (
          buildQuery: () => {
            take: (n: number) => Promise<unknown[]>;
          },
        ) => {
          const rows = await buildQuery().take(DASHBOARD_COUNT_LIMIT + 1);
          return {
            count: Math.min(rows.length, DASHBOARD_COUNT_LIMIT),
            isCapped: rows.length > DASHBOARD_COUNT_LIMIT,
          };
        };

        const [enabledStatusCheckCount, statusCheckCount, activePrCount] =
          await Promise.all([
            boundedCount(() =>
              ctx.db
                .query("repoStatusChecks")
                .withIndex("by_repo_slug_and_enabled", (q) =>
                  q.eq("repoSlug", repo.slug).eq("enabled", true),
                ),
            ),
            boundedCount(() =>
              ctx.db
                .query("repoStatusChecks")
                .withIndex("by_repo_slug_and_name", (q) =>
                  q.eq("repoSlug", repo.slug),
                ),
            ),
            boundedCount(() =>
              ctx.db
                .query("pullRequests")
                .withIndex("by_repo_slug_and_pr_number", (q) =>
                  q.eq("repoSlug", repo.slug),
                ),
            ),
          ]);

        return {
          ...repo,
          policy,
          statusCheckCount: statusCheckCount.count,
          statusCheckCountIsCapped: statusCheckCount.isCapped,
          enabledStatusCheckCount: enabledStatusCheckCount.count,
          enabledStatusCheckCountIsCapped: enabledStatusCheckCount.isCapped,
          activePrCount: activePrCount.count,
          activePrCountIsCapped: activePrCount.isCapped,
        };
      }),
    );
  },
});

export const getRepoPolicyDetail = query({
  args: {
    repoSlug: v.string(),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  handler: async (ctx, args) => {
    const repo = await ctx.db
      .query("repos")
      .withIndex("by_slug", (q) => q.eq("slug", args.repoSlug))
      .unique();

    const policy = await ctx.db
      .query("repoPolicies")
      .withIndex("by_repo_slug", (q) => q.eq("repoSlug", args.repoSlug))
      .unique();

    const statusChecksPage = await ctx.db
      .query("repoStatusChecks")
      .withIndex("by_repo_slug_and_name", (q) =>
        q.eq("repoSlug", args.repoSlug),
      )
      .paginate(args.paginationOpts ?? { numItems: 500, cursor: null });

    return {
      repo,
      policy,
      statusChecks: statusChecksPage.page,
      statusChecksIsDone: statusChecksPage.isDone,
      statusChecksContinueCursor: statusChecksPage.continueCursor,
    };
  },
});
