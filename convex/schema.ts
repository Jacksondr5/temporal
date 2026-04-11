import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const reviewerDefinitionValidator = v.object({
  id: v.string(),
  description: v.string(),
  fileGlobs: v.array(v.string()),
  runPolicy: v.union(v.literal('once_per_sha'), v.literal('once_per_pr')),
  promptId: v.string(),
});

export default defineSchema({
  repos: defineTable({
    slug: v.string(),
    owner: v.string(),
    name: v.string(),
    enabled: v.boolean(),
  })
    .index('by_slug', ['slug'])
    .index('by_enabled', ['enabled']),

  repoPolicies: defineTable({
    repoSlug: v.string(),
    fixableChecks: v.array(v.string()),
    ignoredChecks: v.array(v.string()),
    specializedReviewers: v.array(reviewerDefinitionValidator),
  }).index('by_repo_slug', ['repoSlug']),

  pollState: defineTable({
    repoSlug: v.string(),
    source: v.string(),
    cursorKey: v.string(),
    cursorValue: v.union(v.string(), v.null()),
    lastObservedAt: v.union(v.string(), v.null()),
  }).index('by_repo_slug_and_cursor_key', ['repoSlug', 'cursorKey']),

  githubEvents: defineTable({
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
    claimedAt: v.optional(v.union(v.string(), v.null())),
    processedAt: v.optional(v.union(v.string(), v.null())),
  })
    .index('by_event_id', ['eventId'])
    .index('by_kind_and_event_id', ['kind', 'eventId'])
    .index('by_kind_and_claimed_at_and_processed_at_and_observed_at', [
      'kind',
      'claimedAt',
      'processedAt',
      'observedAt',
    ])
    .index('by_kind_and_processed_at_and_claimed_at_and_observed_at', [
      'kind',
      'processedAt',
      'claimedAt',
      'observedAt',
    ])
    .index('by_repo_slug_pr_number_kind_processed_at_observed_at', [
      'repoSlug',
      'prNumber',
      'kind',
      'processedAt',
      'observedAt',
    ])
    .index('by_repo_slug_and_pr_number_and_observed_at', [
      'repoSlug',
      'prNumber',
      'observedAt',
    ]),

  checkObservations: defineTable({
    repoSlug: v.string(),
    prNumber: v.number(),
    headSha: v.string(),
    checkName: v.string(),
    state: v.string(),
    status: v.string(),
    conclusion: v.union(v.string(), v.null()),
    lastObservedAt: v.string(),
  }).index('by_repo_slug_and_pr_number_and_head_sha_and_check_name', [
    'repoSlug',
    'prNumber',
    'headSha',
    'checkName',
  ]),

  pullRequests: defineTable({
    repoSlug: v.string(),
    prNumber: v.number(),
    workflowId: v.string(),
    branchName: v.string(),
    headSha: v.string(),
    lifecycleState: v.optional(
      v.union(v.literal('open'), v.literal('closed'), v.literal('merged')),
    ),
    statusSummary: v.union(v.string(), v.null()),
    currentPhase: v.string(),
    dirty: v.boolean(),
    blockedReason: v.union(v.string(), v.null()),
    lastReconciledAt: v.union(v.string(), v.null()),
  })
    .index('by_repo_slug_and_pr_number', ['repoSlug', 'prNumber'])
    .index('by_repo_slug_and_lifecycle_state_and_pr_number', [
      'repoSlug',
      'lifecycleState',
      'prNumber',
    ])
    .index('by_workflow_id', ['workflowId']),

  prRuns: defineTable({
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
  })
    .index('by_run_key', ['runKey'])
    .index('by_repo_slug_and_pr_number_and_started_at', [
      'repoSlug',
      'prNumber',
      'startedAt',
    ]),

  reviewThreads: defineTable({
    repoSlug: v.string(),
    prNumber: v.number(),
    threadKey: v.string(),
    reviewId: v.union(v.number(), v.null()),
    commentId: v.number(),
    path: v.union(v.string(), v.null()),
    line: v.union(v.number(), v.null()),
    body: v.string(),
    isResolved: v.boolean(),
    updatedAt: v.string(),
    disposition: v.union(
      v.literal('fix'),
      v.literal('false_positive'),
      v.literal('defer'),
      v.null(),
    ),
  }).index('by_repo_slug_and_pr_number_and_thread_key', [
    'repoSlug',
    'prNumber',
    'threadKey',
  ]),

  threadDecisions: defineTable({
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
  })
    .index('by_repo_slug_and_pr_number_and_thread_key', [
      'repoSlug',
      'prNumber',
      'threadKey',
    ])
    .index('by_repo_slug_and_pr_number_and_thread_key_and_created_at', [
      'repoSlug',
      'prNumber',
      'threadKey',
      'createdAt',
    ]),

  reviewerRuns: defineTable({
    repoSlug: v.string(),
    prNumber: v.number(),
    reviewerId: v.string(),
    targetHeadSha: v.string(),
    matchedFiles: v.array(v.string()),
    status: v.string(),
    summary: v.union(v.string(), v.null()),
    detailsJson: v.union(v.string(), v.null()),
    createdAt: v.string(),
  })
    .index('by_repo_slug_and_pr_number_and_reviewer_id', [
      'repoSlug',
      'prNumber',
      'reviewerId',
    ])
    .index('by_repo_slug_and_pr_number_and_created_at', [
      'repoSlug',
      'prNumber',
      'createdAt',
    ])
    .index('by_repo_slug_and_pr_number_and_reviewer_id_and_created_at', [
      'repoSlug',
      'prNumber',
      'reviewerId',
      'createdAt',
    ]),

  artifacts: defineTable({
    repoSlug: v.string(),
    prNumber: v.number(),
    artifactKind: v.string(),
    externalId: v.string(),
    correlationKey: v.string(),
    summary: v.union(v.string(), v.null()),
    createdAt: v.string(),
  })
    .index('by_correlation_key', ['correlationKey'])
    .index('by_repo_slug_and_pr_number_and_created_at', [
      'repoSlug',
      'prNumber',
      'createdAt',
    ]),

  workflowErrors: defineTable({
    repoSlug: v.string(),
    prNumber: v.number(),
    workflowId: v.string(),
    errorType: v.string(),
    errorMessage: v.string(),
    phase: v.union(v.string(), v.null()),
    retryable: v.boolean(),
    blocked: v.boolean(),
    lastSeenAt: v.string(),
  })
    .index('by_repo_slug_and_pr_number', ['repoSlug', 'prNumber'])
    .index('by_repo_slug_and_pr_number_and_last_seen_at', [
      'repoSlug',
      'prNumber',
      'lastSeenAt',
    ])
    .index('by_workflow_id', ['workflowId']),
});
