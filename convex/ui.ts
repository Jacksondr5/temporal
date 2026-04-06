import { v } from "convex/values";
import { query } from "./_generated/server";

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
        const errors = await ctx.db
          .query("workflowErrors")
          .withIndex("by_repo_slug_and_pr_number", (q) =>
            q.eq("repoSlug", pr.repoSlug).eq("prNumber", pr.prNumber),
          )
          .order("desc")
          .take(1);

        const latestRun = await ctx.db
          .query("prRuns")
          .withIndex("by_repo_slug_and_pr_number_and_started_at", (q) =>
            q.eq("repoSlug", pr.repoSlug).eq("prNumber", pr.prNumber),
          )
          .order("desc")
          .take(1);

        return {
          ...pr,
          hasBlockingError: errors.some((e) => e.blocked),
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

    const [threads, runs, reviewerRuns, artifacts, errors, events] = await Promise.all([
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
      pr,
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

        const prCount = await ctx.db
          .query("pullRequests")
          .withIndex("by_repo_slug_and_pr_number", (q) =>
            q.eq("repoSlug", repo.slug),
          )
          .take(200);

        return {
          ...repo,
          policy,
          activePrCount: prCount.length,
        };
      }),
    );
  },
});

export const getRepoPolicyDetail = query({
  args: { repoSlug: v.string() },
  handler: async (ctx, args) => {
    const repo = await ctx.db
      .query("repos")
      .withIndex("by_slug", (q) => q.eq("slug", args.repoSlug))
      .unique();

    const policy = await ctx.db
      .query("repoPolicies")
      .withIndex("by_repo_slug", (q) => q.eq("repoSlug", args.repoSlug))
      .unique();

    return { repo, policy };
  },
});
