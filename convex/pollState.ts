import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const getCursor = query({
  args: {
    repoSlug: v.string(),
    cursorKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('pollState')
      .withIndex('by_repo_slug_and_cursor_key', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('cursorKey', args.cursorKey),
      )
      .unique();
  },
});

export const setCursor = mutation({
  args: {
    repoSlug: v.string(),
    source: v.string(),
    cursorKey: v.string(),
    cursorValue: v.union(v.string(), v.null()),
    lastObservedAt: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('pollState')
      .withIndex('by_repo_slug_and_cursor_key', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('cursorKey', args.cursorKey),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    return await ctx.db.insert('pollState', args);
  },
});
