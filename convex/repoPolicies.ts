import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const specializedReviewerValidator = v.object({
  id: v.string(),
  description: v.string(),
  fileGlobs: v.array(v.string()),
  runPolicy: v.union(v.literal('once_per_sha'), v.literal('once_per_pr')),
  promptId: v.string(),
});

export const getByRepoSlug = query({
  args: {
    repoSlug: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('repoPolicies')
      .withIndex('by_repo_slug', (q) => q.eq('repoSlug', args.repoSlug))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    repoSlug: v.string(),
    fixableChecks: v.array(v.string()),
    ignoredChecks: v.array(v.string()),
    specializedReviewers: v.array(specializedReviewerValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('repoPolicies')
      .withIndex('by_repo_slug', (q) => q.eq('repoSlug', args.repoSlug))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    return await ctx.db.insert('repoPolicies', args);
  },
});
