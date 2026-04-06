import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const getByCorrelationKey = query({
  args: {
    correlationKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('artifacts')
      .withIndex('by_correlation_key', (q) =>
        q.eq('correlationKey', args.correlationKey),
      )
      .unique();
  },
});

export const upsert = mutation({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    artifactKind: v.string(),
    externalId: v.string(),
    correlationKey: v.string(),
    summary: v.union(v.string(), v.null()),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('artifacts')
      .withIndex('by_correlation_key', (q) =>
        q.eq('correlationKey', args.correlationKey),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    return await ctx.db.insert('artifacts', args);
  },
});
