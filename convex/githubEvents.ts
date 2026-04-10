import { v } from 'convex/values';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';

const STALE_MS = 5 * 60 * 1000;

function staleClaimThreshold(nowMs: number): string {
  return new Date(nowMs - STALE_MS).toISOString();
}

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

export const listManualSince = internalQuery({
  args: {
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const staleThreshold = staleClaimThreshold(nowMs);

    const unclaimed = await ctx.db
      .query('githubEvents')
      .withIndex('by_kind_and_claimed_at_and_processed_at_and_observed_at', (q) =>
        q
          .eq('kind', 'manual')
          .eq('claimedAt', null)
          .eq('processedAt', null),
      )
      .take(args.limit);

    if (unclaimed.length >= args.limit) {
      return unclaimed;
    }

    const staleClaimed = await ctx.db
      .query('githubEvents')
      .withIndex('by_kind_and_processed_at_and_claimed_at_and_observed_at', (q) =>
        q
          .eq('kind', 'manual')
          .eq('processedAt', null)
          .gt('claimedAt', null)
          .lt('claimedAt', staleThreshold),
      )
      .take(args.limit - unclaimed.length);

    return [...unclaimed, ...staleClaimed];
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

    const eventDocumentId = await ctx.db.insert('githubEvents', {
      ...args,
      claimedAt: null,
      processedAt: null,
    });
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

    const [pendingManualEvent] = await ctx.db
      .query('githubEvents')
      .withIndex(
        'by_repo_slug_and_pr_number_and_kind_and_processed_at_and_observed_at',
        (q) =>
          q
            .eq('repoSlug', args.repoSlug)
            .eq('prNumber', args.prNumber)
            .eq('kind', 'manual')
            .eq('processedAt', null),
      )
      .order('desc')
      .take(1);

    if (pendingManualEvent) {
      return {
        eventDocumentId: pendingManualEvent._id,
        eventId: pendingManualEvent.eventId,
        observedAt: pendingManualEvent.observedAt,
      };
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
      claimedAt: null,
      processedAt: null,
    });

    return {
      eventDocumentId,
      eventId,
      observedAt,
    };
  },
});

export const claimManual = internalMutation({
  args: {
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query('githubEvents')
      .withIndex('by_event_id', (q) => q.eq('eventId', args.eventId))
      .unique();

    if (event === null) {
      return {
        claimed: false,
        alreadyProcessed: false,
      };
    }

    if (event.processedAt !== null) {
      return {
        claimed: false,
        alreadyProcessed: true,
      };
    }

    const staleThreshold = staleClaimThreshold(Date.now());
    const claimIsFresh = event.claimedAt !== null && event.claimedAt >= staleThreshold;
    if (claimIsFresh) {
      return {
        claimed: false,
        alreadyProcessed: false,
      };
    }

    await ctx.db.patch(event._id, {
      claimedAt: new Date().toISOString(),
    });

    return {
      claimed: true,
      alreadyProcessed: false,
    };
  },
});

export const markManualProcessed = internalMutation({
  args: {
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query('githubEvents')
      .withIndex('by_event_id', (q) => q.eq('eventId', args.eventId))
      .unique();

    if (event === null || event.processedAt !== null) {
      return {
        processed: false,
      };
    }

    await ctx.db.patch(event._id, {
      processedAt: new Date().toISOString(),
    });

    return {
      processed: true,
    };
  },
});
