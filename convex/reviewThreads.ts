import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const getByThreadKey = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    threadKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('reviewThreads')
      .withIndex('by_repo_slug_and_pr_number_and_thread_key', (q) =>
        q.eq('repoSlug', args.repoSlug)
          .eq('prNumber', args.prNumber)
          .eq('threadKey', args.threadKey),
      )
      .unique();
  },
});

export const upsert = mutation({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    threadKey: v.string(),
    reviewId: v.union(v.number(), v.null()),
    commentId: v.number(),
    path: v.union(v.string(), v.null()),
    line: v.union(v.number(), v.null()),
    body: v.string(),
    isResolved: v.boolean(),
    updatedAt: v.string(),
    disposition: v.union(
      v.literal('fix'),
      v.literal('false_positive'),
      v.literal('defer'),
      v.null(),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('reviewThreads')
      .withIndex('by_repo_slug_and_pr_number_and_thread_key', (q) =>
        q.eq('repoSlug', args.repoSlug)
          .eq('prNumber', args.prNumber)
          .eq('threadKey', args.threadKey),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    return await ctx.db.insert('reviewThreads', args);
  },
});
