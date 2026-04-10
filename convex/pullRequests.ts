import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const getByRepoAndNumber = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('pullRequests')
      .withIndex('by_repo_slug_and_pr_number', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('prNumber', args.prNumber),
      )
      .unique();
  },
});

export const upsert = mutation({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    workflowId: v.string(),
    branchName: v.string(),
    headSha: v.string(),
    lifecycleState: v.union(
      v.literal('open'),
      v.literal('closed'),
      v.literal('merged'),
    ),
    statusSummary: v.union(v.string(), v.null()),
    currentPhase: v.string(),
    dirty: v.boolean(),
    blockedReason: v.union(v.string(), v.null()),
    lastReconciledAt: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('pullRequests')
      .withIndex('by_repo_slug_and_pr_number', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('prNumber', args.prNumber),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }

    return await ctx.db.insert('pullRequests', args);
  },
});

export const upsertDiscovered = mutation({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    workflowId: v.string(),
    branchName: v.string(),
    headSha: v.string(),
    lifecycleState: v.union(
      v.literal('open'),
      v.literal('closed'),
      v.literal('merged'),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('pullRequests')
      .withIndex('by_repo_slug_and_pr_number', (q) =>
        q.eq('repoSlug', args.repoSlug).eq('prNumber', args.prNumber),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        workflowId: args.workflowId,
        branchName: args.branchName,
        headSha: args.headSha,
        lifecycleState: args.lifecycleState,
      });
      return existing._id;
    }

    return await ctx.db.insert('pullRequests', {
      ...args,
      statusSummary: null,
      currentPhase: 'idle',
      dirty: false,
      blockedReason: null,
      lastReconciledAt: null,
    });
  },
});

export const listTrackedNonTerminalByRepo = query({
  args: {
    repoSlug: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const prs = await ctx.db
      .query('pullRequests')
      .withIndex('by_repo_slug_and_pr_number', (q) =>
        q.eq('repoSlug', args.repoSlug),
      )
      .take(Math.min(args.limit, 200));

    return prs.filter((pr) => (pr.lifecycleState ?? 'open') === 'open');
  },
});
