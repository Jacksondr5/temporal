import { v } from "convex/values";
import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

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
          lifecycleState: pr.lifecycleState ?? "open",
          hasBlockingError: pr.blockedReason !== null,
          latestRunStatus: latestRun[0]?.status ?? null,
          latestRunPhase: latestRun[0]?.phase ?? null,
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
