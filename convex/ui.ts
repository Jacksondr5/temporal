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

        const countAll = async (
          buildQuery: () => {
            paginate: (opts: { numItems: number; cursor: string | null }) => Promise<{
              page: unknown[];
              isDone: boolean;
              continueCursor: string;
            }>;
          },
        ) => {
          let count = 0;
          let cursor: string | null = null;
          let isDone = false;
          while (!isDone) {
            const page = await buildQuery().paginate({ numItems: 256, cursor });
            count += page.page.length;
            cursor = page.continueCursor;
            isDone = page.isDone;
          }
          return count;
        };

        const [enabledStatusCheckCount, statusCheckCount, activePrCount] =
          await Promise.all([
            countAll(() =>
              ctx.db
                .query("repoStatusChecks")
                .withIndex("by_repo_slug_and_enabled", (q) =>
                  q.eq("repoSlug", repo.slug).eq("enabled", true),
                ),
            ),
            countAll(() =>
              ctx.db
                .query("repoStatusChecks")
                .withIndex("by_repo_slug_and_name", (q) =>
                  q.eq("repoSlug", repo.slug),
                ),
            ),
            countAll(() =>
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
          statusCheckCount,
          enabledStatusCheckCount,
          activePrCount,
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
