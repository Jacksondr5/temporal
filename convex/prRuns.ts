import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const DEFAULT_DETAILS_JSON = JSON.stringify({
  status: 'legacy_backfill',
  summary: 'Run predates structured execution details.',
});

export const listForPullRequest = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('prRuns')
      .withIndex('by_repo_slug_and_pr_number_and_started_at', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('prNumber', args.prNumber),
      )
      .order('desc')
      .take(50);
  },
});

export const insert = mutation({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    workflowId: v.string(),
    runKey: v.string(),
    phase: v.string(),
    status: v.string(),
    targetHeadSha: v.string(),
    startedAt: v.string(),
    completedAt: v.union(v.string(), v.null()),
    summary: v.union(v.string(), v.null()),
    detailsJson: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('prRuns', args);
  },
});

export const upsert = mutation({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    workflowId: v.string(),
    runKey: v.string(),
    phase: v.string(),
    status: v.string(),
    targetHeadSha: v.string(),
    startedAt: v.union(v.string(), v.null()),
    completedAt: v.union(v.string(), v.null()),
    summary: v.union(v.string(), v.null()),
    detailsJson: v.string(),
  },
  handler: async (ctx, args) => {
    const effectiveCompletedAt =
      args.completedAt ??
      (args.status === 'running' ? null : new Date().toISOString());

    const existing = await ctx.db
      .query('prRuns')
      .withIndex('by_run_key', (q) => q.eq('runKey', args.runKey))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        workflowId: args.workflowId,
        phase: args.phase,
        status: args.status,
        targetHeadSha: args.targetHeadSha,
        completedAt: effectiveCompletedAt,
        summary: args.summary,
        detailsJson: args.detailsJson,
      });
      return existing._id;
    }

    return await ctx.db.insert('prRuns', {
      repoSlug: args.repoSlug,
      prNumber: args.prNumber,
      workflowId: args.workflowId,
      runKey: args.runKey,
      phase: args.phase,
      status: args.status,
      targetHeadSha: args.targetHeadSha,
      startedAt: args.startedAt ?? new Date().toISOString(),
      completedAt: effectiveCompletedAt,
      summary: args.summary,
      detailsJson: args.detailsJson,
    });
  },
});
