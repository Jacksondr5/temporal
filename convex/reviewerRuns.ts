import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const listForReviewer = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    reviewerId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('reviewerRuns')
      .withIndex('by_repo_slug_and_pr_number_and_reviewer_id_and_created_at', (q) =>
        q.eq('repoSlug', args.repoSlug)
          .eq('prNumber', args.prNumber)
          .eq('reviewerId', args.reviewerId),
      )
      .order('desc')
      .take(20);
  },
});

export const listForPullRequest = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('reviewerRuns')
      .withIndex('by_repo_slug_and_pr_number_and_created_at', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('prNumber', args.prNumber),
      )
      .order('desc')
      .take(100);
  },
});

export const insert = mutation({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    reviewerId: v.string(),
    targetHeadSha: v.string(),
    matchedFiles: v.array(v.string()),
    status: v.string(),
    summary: v.union(v.string(), v.null()),
    detailsJson: v.union(v.string(), v.null()),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('reviewerRuns', args);
  },
});
