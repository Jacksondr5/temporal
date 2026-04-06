import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const getLatestForThread = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    threadKey: v.string(),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query('threadDecisions')
      .withIndex('by_repo_slug_and_pr_number_and_thread_key_and_created_at', (q) =>
        q.eq('repoSlug', args.repoSlug)
          .eq('prNumber', args.prNumber)
          .eq('threadKey', args.threadKey),
      )
      .order('desc')
      .take(1);

    return results[0] ?? null;
  },
});

export const getLatestForThreads = query({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    threadKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results = [];

    for (const threadKey of args.threadKeys) {
      const matches = await ctx.db
        .query('threadDecisions')
        .withIndex(
          'by_repo_slug_and_pr_number_and_thread_key_and_created_at',
          (q) =>
            q
              .eq('repoSlug', args.repoSlug)
              .eq('prNumber', args.prNumber)
              .eq('threadKey', threadKey),
        )
        .order('desc')
        .take(1);

      const latest = matches[0];
      if (latest) {
        results.push({
          threadKey,
          disposition: latest.disposition,
          reasoningSummary: latest.reasoningSummary,
          targetHeadSha: latest.targetHeadSha,
          artifactIds: latest.artifactIds,
          linearIssueId: latest.linearIssueId,
          githubCommentId: latest.githubCommentId,
          createdAt: latest.createdAt,
        });
      }
    }

    return results;
  },
});

export const insert = mutation({
  args: {
    repoSlug: v.string(),
    prNumber: v.number(),
    threadKey: v.string(),
    disposition: v.union(
      v.literal('fix'),
      v.literal('false_positive'),
      v.literal('defer'),
    ),
    reasoningSummary: v.string(),
    targetHeadSha: v.string(),
    artifactIds: v.array(v.string()),
    linearIssueId: v.union(v.string(), v.null()),
    githubCommentId: v.union(v.string(), v.null()),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('threadDecisions', args);
  },
});
