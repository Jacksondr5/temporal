import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import type { Doc } from "./_generated/dataModel";

const statusCheckSourceValidator = v.union(
  v.literal("check_run"),
  v.literal("commit_status"),
);

async function collectAllByRepoAndName(ctx: MutationCtx, repoSlug: string) {
  const checks = new Map<string, Doc<"repoStatusChecks">>();
  let cursor: string | null = null;
  let isDone = false;

  while (!isDone) {
    const page = await ctx.db
      .query("repoStatusChecks")
      .withIndex("by_repo_slug_and_name", (q) => q.eq("repoSlug", repoSlug))
      .paginate({ numItems: 256, cursor });
    for (const row of page.page) {
      checks.set(row.name, row);
    }
    cursor = page.continueCursor;
    isDone = page.isDone;
  }

  return checks;
}

export const listByRepo = query({
  args: {
    repoSlug: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repoStatusChecks")
      .withIndex("by_repo_slug_and_name", (q) =>
        q.eq("repoSlug", args.repoSlug),
      )
      .paginate(args.paginationOpts);
  },
});

export const listEnabledByRepo = query({
  args: {
    repoSlug: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("repoStatusChecks")
      .withIndex("by_repo_slug_and_enabled", (q) =>
        q.eq("repoSlug", args.repoSlug).eq("enabled", true),
      )
      .paginate(args.paginationOpts);
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
    const uniqueChecks = Array.from(
      new Map(args.checks.map((check) => [check.name, check])).values(),
    );

    const existingByName = await collectAllByRepoAndName(ctx, args.repoSlug);

    for (const check of uniqueChecks) {
      const existing = existingByName.get(check.name);

      if (!existing) {
        await ctx.db.insert("repoStatusChecks", {
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
      .query("repoStatusChecks")
      .withIndex("by_repo_slug_and_name", (q) =>
        q.eq("repoSlug", args.repoSlug).eq("name", args.name),
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
