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

export const listManualSince = query({
  args: {
    afterEventId: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const afterEventId = args.afterEventId;
    const manualEventsQuery =
      afterEventId === null
        ? ctx.db
            .query('githubEvents')
            .withIndex('by_kind_and_event_id', (q) => q.eq('kind', 'manual'))
        : ctx.db
            .query('githubEvents')
            .withIndex('by_kind_and_event_id', (q) =>
              q.eq('kind', 'manual').gt('eventId', afterEventId),
            );

    return await manualEventsQuery.take(args.limit);
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

export const enqueueManual = mutation({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const pullRequest = await ctx.db
      .query('pullRequests')
      .withIndex('by_repo_slug_and_pr_number', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('prNumber', args.prNumber),
      )
      .unique();

    if (pullRequest === null) {
      throw new Error(
        `Pull request ${args.repoSlug}#${args.prNumber} is not tracked.`,
      );
    }

    const observedAt = new Date().toISOString();
    const eventId = `manual:${observedAt}:${Math.random().toString(36).slice(2, 10)}`;

    const eventDocumentId = await ctx.db.insert('githubEvents', {
      eventId,
      repoSlug: args.repoSlug,
      prNumber: args.prNumber,
      kind: 'manual',
      observedAt,
      headSha: pullRequest.headSha,
      actorLogin: null,
      reviewId: null,
      commentId: null,
      checkName: null,
    });

    return {
      eventDocumentId,
      eventId,
      observedAt,
    };
  },
});
