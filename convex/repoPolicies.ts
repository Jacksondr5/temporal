import { paginationOptsValidator } from 'convex/server';
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
    fixableChecks: v.optional(v.array(v.string())),
    ignoredChecks: v.optional(v.array(v.string())),
    specializedReviewers: v.array(specializedReviewerValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('repoPolicies')
      .withIndex('by_repo_slug', (q) => q.eq('repoSlug', args.repoSlug))
      .unique();

    if (existing) {
      const patch: {
        repoSlug: string;
        specializedReviewers: typeof args.specializedReviewers;
        fixableChecks?: string[];
        ignoredChecks?: string[];
      } = {
        repoSlug: args.repoSlug,
        specializedReviewers: args.specializedReviewers,
      };
      if (args.fixableChecks !== undefined) {
        patch.fixableChecks = args.fixableChecks;
      }
      if (args.ignoredChecks !== undefined) {
        patch.ignoredChecks = args.ignoredChecks;
      }

      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    const document: {
      repoSlug: string;
      specializedReviewers: typeof args.specializedReviewers;
      fixableChecks?: string[];
      ignoredChecks?: string[];
    } = {
      repoSlug: args.repoSlug,
      specializedReviewers: args.specializedReviewers,
    };
    if (args.fixableChecks !== undefined) {
      document.fixableChecks = args.fixableChecks;
    }
    if (args.ignoredChecks !== undefined) {
      document.ignoredChecks = args.ignoredChecks;
    }

    return await ctx.db.insert('repoPolicies', document);
  },
});

export const removeDeprecatedCheckFieldsBatch = mutation({
  args: {
    paginationOpts: paginationOptsValidator,
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query('repoPolicies')
      .paginate(args.paginationOpts);
    let checked = 0;
    let updated = 0;

    for (const policy of page.page) {
      checked += 1;

      if (!('fixableChecks' in policy) && !('ignoredChecks' in policy)) {
        continue;
      }

      updated += 1;
      if (args.dryRun === true) {
        continue;
      }

      await ctx.db.patch(policy._id, {
        fixableChecks: undefined,
        ignoredChecks: undefined,
      });
    }

    return {
      checked,
      updated,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
