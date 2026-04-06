import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const getByEventId = query({
  args: {
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('githubEvents')
      .withIndex('by_event_id', (q) => q.eq('eventId', args.eventId))
      .unique();
  },
});

export const listForPullRequest = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('githubEvents')
      .withIndex('by_repo_slug_and_pr_number_and_observed_at', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('prNumber', args.prNumber),
      )
      .order('desc')
      .take(100);
  },
});

export const record = mutation({
  args: {
    eventId: v.string(),
    repoSlug: v.string(),
    prNumber: v.number(),
    kind: v.string(),
    observedAt: v.string(),
    headSha: v.string(),
    actorLogin: v.union(v.string(), v.null()),
    reviewId: v.union(v.number(), v.null()),
    commentId: v.union(v.number(), v.null()),
    checkName: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('githubEvents')
      .withIndex('by_event_id', (q) => q.eq('eventId', args.eventId))
      .unique();

    if (existing) {
      return {
        eventDocumentId: existing._id,
        inserted: false,
      };
    }

    const eventDocumentId = await ctx.db.insert('githubEvents', args);
    return {
      eventDocumentId,
      inserted: true,
    };
  },
});
