import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const statusCheckSourceValidator = v.union(
  v.literal('check_run'),
  v.literal('commit_status'),
);

export const listByRepo = query({
  args: {
    repoSlug: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('repoStatusChecks')
      .withIndex('by_repo_slug_and_name', (q) => q.eq('repoSlug', args.repoSlug))
      .take(500);
  },
});

export const listEnabledByRepo = query({
  args: {
    repoSlug: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('repoStatusChecks')
      .withIndex('by_repo_slug_and_enabled', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('enabled', true),
      )
      .take(500);
  },
});

export const upsertObservedBatch = mutation({
  args: {
    repoSlug: v.string(),
    checks: v.array(
      v.object({
        name: v.string(),
        source: statusCheckSourceValidator,
      }),
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let updated = 0;

    for (const check of args.checks) {
      const existing = await ctx.db
        .query('repoStatusChecks')
        .withIndex('by_repo_slug_and_name', (q) =>
          q.eq('repoSlug', args.repoSlug).eq('name', check.name),
        )
        .unique();

      if (!existing) {
        await ctx.db.insert('repoStatusChecks', {
          repoSlug: args.repoSlug,
          name: check.name,
          source: check.source,
          enabled: false,
        });
        inserted += 1;
        continue;
      }

      if (existing.source !== check.source) {
        await ctx.db.patch(existing._id, {
          source: check.source,
        });
        updated += 1;
      }
    }

    return { inserted, updated };
  },
});

export const setEnabled = mutation({
  args: {
    repoSlug: v.string(),
    name: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('repoStatusChecks')
      .withIndex('by_repo_slug_and_name', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('name', args.name),
      )
      .unique();

    if (!existing) {
      throw new Error(`Status check "${args.name}" has not been discovered.`);
    }

    await ctx.db.patch(existing._id, {
      enabled: args.enabled,
    });

    return existing._id;
  },
});
