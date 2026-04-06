import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const get = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    headSha: v.string(),
    checkName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('checkObservations')
      .withIndex('by_repo_slug_and_pr_number_and_head_sha_and_check_name', (q) =>
        q
          .eq('repoSlug', args.repoSlug)
          .eq('prNumber', args.prNumber)
          .eq('headSha', args.headSha)
          .eq('checkName', args.checkName),
      )
      .unique();
  },
});

export const record = mutation({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    headSha: v.string(),
    checkName: v.string(),
    state: v.string(),
    status: v.string(),
    conclusion: v.union(v.string(), v.null()),
    lastObservedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('checkObservations')
      .withIndex('by_repo_slug_and_pr_number_and_head_sha_and_check_name', (q) =>
        q
          .eq('repoSlug', args.repoSlug)
          .eq('prNumber', args.prNumber)
          .eq('headSha', args.headSha)
          .eq('checkName', args.checkName),
      )
      .unique();

    if (!existing) {
      const documentId = await ctx.db.insert('checkObservations', args);
      return {
        documentId,
        inserted: true,
        changed: false,
        previousState: null,
        currentState: args.state,
      };
    }

    if (
      existing.state === args.state &&
      existing.status === args.status &&
      existing.conclusion === args.conclusion
    ) {
      return {
        documentId: existing._id,
        inserted: false,
        changed: false,
        previousState: existing.state,
        currentState: existing.state,
      };
    }

    await ctx.db.patch(existing._id, args);
    return {
      documentId: existing._id,
      inserted: false,
      changed: existing.state !== args.state,
      previousState: existing.state,
      currentState: args.state,
    };
  },
});
