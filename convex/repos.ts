import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const listEnabled = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('repos')
      .withIndex('by_enabled', (q) => q.eq('enabled', true))
      .take(100);
  },
});

export const getBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('repos')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    slug: v.string(),
    owner: v.string(),
    name: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('repos')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    return await ctx.db.insert('repos', args);
  },
});

/**
 * Ensures a repo record and an empty policy both exist for the given slug.
 * Called by the poller on each cycle so that newly discovered repos are
 * immediately visible in the operator UI with a policy ready to configure.
 *
 * Does NOT overwrite an existing repo's enabled flag or an existing policy's
 * configuration — it only fills in missing records.
 */
export const ensureRepoWithPolicy = mutation({
  args: {
    slug: v.string(),
    owner: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Ensure repo record exists
    const existingRepo = await ctx.db
      .query('repos')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();

    if (!existingRepo) {
      await ctx.db.insert('repos', {
        slug: args.slug,
        owner: args.owner,
        name: args.name,
        enabled: true,
      });
    }

    // Ensure policy record exists
    const existingPolicy = await ctx.db
      .query('repoPolicies')
      .withIndex('by_repo_slug', (q) => q.eq('repoSlug', args.slug))
      .unique();

    if (!existingPolicy) {
      await ctx.db.insert('repoPolicies', {
        repoSlug: args.slug,
        fixableChecks: [],
        ignoredChecks: [],
        specializedReviewers: [],
      });
    }
  },
});
