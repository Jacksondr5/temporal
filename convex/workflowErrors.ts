import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const listForPullRequest = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('workflowErrors')
      .withIndex('by_repo_slug_and_pr_number_and_last_seen_at', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('prNumber', args.prNumber),
      )
      .order('desc')
      .take(50);
  },
});

export const insert = mutation({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    workflowId: v.string(),
    errorType: v.string(),
    errorMessage: v.string(),
    phase: v.union(v.string(), v.null()),
    retryable: v.boolean(),
    blocked: v.boolean(),
    lastSeenAt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('workflowErrors', args);
  },
});
