import { condition, proxyActivities, setHandler } from '@temporalio/workflow';
import type * as activities from '../activities.js';
import type {
  CodeRabbitAgentExecution,
  FixChecksAgentExecution,
  MergeConflictAgentExecution,
  SpecializedReviewerExecution,
} from '../domain/agentRuntime.js';
import type {
  PullRequestLifecycleState,
  PullRequestSnapshot,
} from '../domain/github.js';
import { fileMatchesGlobs } from '../domain/glob.js';
import type { SpecializedReviewerDefinition } from '../domain/policy.js';
import type {
  PrReviewWorkflowInput,
  PrReviewWorkflowSignal,
  PrReviewWorkflowState,
  PrReviewWorkflowTerminalSignal,
} from '../domain/workflow.js';
import type { SpecializedReviewerHandoffItem } from '../domain/review.js';
import {
  buildReconciliationResult,
  formatPrRunKey,
  formatPrWorkflowId,
  markWorkflowDirtyForHead,
  recordWorkflowSignal,
  toWorkflowStatusRecord,
} from '../domain/workflow.js';
import {
  beginWorkflowPass,
  applyReconciliationActionPhase,
  completeWorkflowPass,
  withFetchedSnapshot,
} from './reconcile.js';
import {
  prActivityObservedSignal,
  prWorkflowShutdownSignal,
  prWorkflowStateQuery,
} from './signals.js';

const {
  initializePrReviewWorkflow,
  fetchPullRequestSnapshot,
  loadRepoPolicy,
  classifyChecks,
  selectCodeRabbitThreads,
  selectSpecializedReviewers,
  recordWorkflowState,
  recordPrRun,
  recordWorkflowError,
  listReviewerRunsForPullRequest,
  loadReviewerPackDefinition,
  insertReviewerRun,
  postPullRequestComment,
  removePullRequestWorkspace,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

const {
  runMergeConflictAgent,
  runFixChecksAgent,
  persistFixChecksExecution,
  runCodeRabbitAgent,
  persistCodeRabbitExecution,
  runSpecializedReviewerAgent,
  persistSpecializedReviewerExecution,
} =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '30 minutes',
    retry: {
      maximumAttempts: 1,
    },
  });

function toRunDetailsJson(details: Record<string, unknown>): string {
  return JSON.stringify(details);
}

function toMergeConflictRunDetails(
  execution: MergeConflictAgentExecution,
): string {
  return toRunDetailsJson({
    provider: execution.provider,
    status: execution.status,
    usage: execution.usage,
    providerMetadata: execution.providerMetadata,
    logFilePath: execution.logFilePath,
    workspacePath: execution.workspace?.path ?? null,
    reusedExistingClone: execution.workspace?.reusedExistingClone ?? null,
    startingHeadSha: execution.startingHeadSha,
    localHeadAfter: execution.localHeadAfter,
    remoteHeadAfter: execution.remoteHeadAfter,
    baseBranchName: execution.workspace?.baseBranchName ?? null,
    baseSha: execution.workspace?.baseSha ?? null,
    conflictedFiles: execution.workspace?.conflictedFiles ?? [],
    mergeOutput: execution.workspace?.mergeOutput ?? null,
    blockedReason: execution.blockedReason,
    result: execution.result,
  });
}

function toFixChecksRunDetails(
  execution: FixChecksAgentExecution,
): string {
  return toRunDetailsJson({
    provider: execution.provider,
    status: execution.status,
    usage: execution.usage,
    providerMetadata: execution.providerMetadata,
    logFilePath: execution.logFilePath,
    workspacePath: execution.workspace?.path ?? null,
    reusedExistingClone: execution.workspace?.reusedExistingClone ?? null,
    startingHeadSha: execution.startingHeadSha,
    localHeadAfter: execution.localHeadAfter,
    remoteHeadAfter: execution.remoteHeadAfter,
    blockedReason: execution.blockedReason,
    result: execution.result,
  });
}

function toCodeRabbitRunDetails(
  execution: CodeRabbitAgentExecution,
): string {
  return toRunDetailsJson({
    provider: execution.provider,
    status: execution.status,
    usage: execution.usage,
    providerMetadata: execution.providerMetadata,
    logFilePath: execution.logFilePath,
    workspacePath: execution.workspace?.path ?? null,
    reusedExistingClone: execution.workspace?.reusedExistingClone ?? null,
    startingHeadSha: execution.startingHeadSha,
    localHeadAfter: execution.localHeadAfter,
    remoteHeadAfter: execution.remoteHeadAfter,
    blockedReason: execution.blockedReason,
    result: execution.result,
  });
}

function toSpecializedReviewerRunDetails(
  reviewerId: string,
  execution: SpecializedReviewerExecution,
  reviewerPack: {
    repoPath: string;
    repoCommitSha: string | null;
    entrypointPath: string;
    knowledgeFilePaths: string[];
  },
): string {
  return toRunDetailsJson({
    reviewerId,
    provider: execution.provider,
    status: execution.status,
    usage: execution.usage,
    providerMetadata: execution.providerMetadata,
    workspacePath: execution.workspace?.path ?? null,
    reusedExistingClone: execution.workspace?.reusedExistingClone ?? null,
    startingHeadSha: execution.startingHeadSha,
    localHeadAfter: execution.localHeadAfter,
    remoteHeadAfter: execution.remoteHeadAfter,
    blockedReason: execution.blockedReason,
    reviewerPack,
    result: execution.result,
  });
}

function getMatchedFiles(
  snapshot: PullRequestSnapshot,
  reviewer: SpecializedReviewerDefinition,
): string[] {
  return snapshot.changedFiles.filter((filePath) =>
    fileMatchesGlobs(filePath, reviewer.fileGlobs),
  );
}

function parseReviewerHandoffItems(
  detailsJson: string | null,
): SpecializedReviewerHandoffItem[] {
  if (!detailsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(detailsJson) as {
      result?: { handoffItems?: SpecializedReviewerHandoffItem[] };
    };
    return parsed.result?.handoffItems ?? [];
  } catch {
    return [];
  }
}

function buildMergeConflictBlockedComment(blockedReason: string): string {
  return [
    'Automation is blocked because this PR has merge conflicts that could not be resolved safely.',
    '',
    `Reason: ${blockedReason}`,
    '',
    'The remaining review automation will wait until the conflict is resolved.',
  ].join('\n');
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function buildTerminalSummary(lifecycleState: PullRequestLifecycleState): string {
  return lifecycleState === 'merged'
    ? 'PR merged. Workflow concluded and workspace deleted.'
    : 'PR closed. Workflow concluded and workspace deleted.';
}

function buildTerminalSkipSummary(
  lifecycleState: PullRequestLifecycleState,
): string {
  return `Skipped because the PR is ${lifecycleState}.`;
}

function createTerminalCleanupState(
  state: PrReviewWorkflowState,
  terminalSignal: PrReviewWorkflowTerminalSignal,
): PrReviewWorkflowState {
  return {
    ...state,
    lifecycleState: terminalSignal.lifecycleState,
    phase: 'terminal_cleanup',
    dirty: false,
    blockedReason: null,
    dirtyReasons: [],
    latestKnownHeadSha: terminalSignal.headSha,
    latestReconciliation: {
      action: {
        type: 'noop',
        reason: buildTerminalSummary(terminalSignal.lifecycleState),
      },
      snapshotHeadSha: terminalSignal.headSha,
    },
  };
}

export async function prReviewOrchestratorWorkflow(
  input: PrReviewWorkflowInput,
): Promise<PrReviewWorkflowState> {
  let state = await initializePrReviewWorkflow(input);
  let terminalSignal: PrReviewWorkflowTerminalSignal | null = null;

  setHandler(prActivityObservedSignal, (signal: PrReviewWorkflowSignal) => {
    state = recordWorkflowSignal(state, signal);
  });
  setHandler(prWorkflowShutdownSignal, (signal: PrReviewWorkflowTerminalSignal) => {
    terminalSignal = signal;
    state = {
      ...state,
      latestKnownHeadSha: signal.headSha,
    };
  });
  setHandler(prWorkflowStateQuery, () => state);

  const getTerminalSignal = (): PrReviewWorkflowTerminalSignal | null =>
    terminalSignal;

  const performTerminalCleanup = async (): Promise<PrReviewWorkflowState> => {
    if (terminalSignal === null) {
      return state;
    }

    const workflowId = formatPrWorkflowId(state.pr);
    const repoSlug = `${state.pr.repository.owner}/${state.pr.repository.name}`;
    state = createTerminalCleanupState(state, terminalSignal);

    await recordWorkflowState(input, toWorkflowStatusRecord(state));
    await removePullRequestWorkspace({
      ...state.pr,
      headSha: state.latestKnownHeadSha,
    });
    await recordPrRun({
      repoSlug,
      prNumber: state.pr.number,
      workflowId,
      runKey: formatPrRunKey({
        workflowId,
        passNumber: state.reconciliationCount + 1,
        phase: 'terminal_cleanup',
        targetHeadSha: state.latestKnownHeadSha,
      }),
      phase: 'terminal_cleanup',
      status: 'completed',
      targetHeadSha: state.latestKnownHeadSha,
      summary: buildTerminalSummary(state.lifecycleState),
      detailsJson: toRunDetailsJson({
        lifecycleState: state.lifecycleState,
        cleanupObservedAt: terminalSignal.observedAt,
        workspaceDeleted: true,
      }),
    });

    return state;
  };

  while (true) {
    await condition(() => state.dirty || terminalSignal !== null);

    if (terminalSignal !== null) {
      state = await performTerminalCleanup();
      return state;
    }

    await recordWorkflowState(input, toWorkflowStatusRecord(state));

    const baselineProcessedEventCount = state.processedEventIds.length;
    state = beginWorkflowPass(state);
    await recordWorkflowState(input, toWorkflowStatusRecord(state));

    const snapshot: PullRequestSnapshot = await fetchPullRequestSnapshot({
      ...state.pr,
      headSha: state.latestKnownHeadSha,
    });
    state = withFetchedSnapshot(state, snapshot);

    const policy = await loadRepoPolicy(snapshot.pr.repository);
    const [checkClassifications, codeRabbitItems, specializedReviewers] =
      await Promise.all([
        classifyChecks(snapshot, policy),
        selectCodeRabbitThreads(snapshot),
        selectSpecializedReviewers(snapshot, policy),
      ]);

    const reconciliation = buildReconciliationResult({
      snapshot,
      checkClassifications,
      codeRabbitItems,
      specializedReviewers,
    });
    state = applyReconciliationActionPhase(state, reconciliation);

    if (terminalSignal !== null) {
      state = await performTerminalCleanup();
      return state;
    }

    if (reconciliation.action.type === 'resolve_merge_conflicts') {
      const { baseBranchName, baseSha } = reconciliation.action;
      const workflowId = formatPrWorkflowId(snapshot.pr);
      const runKey = formatPrRunKey({
        workflowId,
        passNumber: state.reconciliationCount + 1,
        phase: 'resolve_merge_conflicts',
        targetHeadSha: snapshot.pr.headSha,
      });
      const repoSlug = `${snapshot.pr.repository.owner}/${snapshot.pr.repository.name}`;
      await recordPrRun({
        repoSlug,
        prNumber: snapshot.pr.number,
        workflowId,
        runKey,
        phase: 'resolve_merge_conflicts',
        status: 'running',
        targetHeadSha: snapshot.pr.headSha,
        summary: `Resolving merge conflicts with ${baseBranchName}.`,
        detailsJson: toRunDetailsJson({
          startingHeadSha: snapshot.pr.headSha,
          baseBranchName,
          baseSha,
          mergeabilityState: snapshot.mergeabilityState,
        }),
      });

      const receivedTerminalSignal = getTerminalSignal();
      if (receivedTerminalSignal !== null) {
        await recordPrRun({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          runKey,
          phase: 'resolve_merge_conflicts',
          status: 'skipped',
          targetHeadSha: snapshot.pr.headSha,
          summary: buildTerminalSkipSummary(receivedTerminalSignal.lifecycleState),
          detailsJson: toRunDetailsJson({
            lifecycleState: receivedTerminalSignal.lifecycleState,
            skippedBeforeStart: true,
          }),
        });
        state = await performTerminalCleanup();
        return state;
      }

      try {
        const execution = await runMergeConflictAgent({
          snapshot,
          baseBranchName,
          baseSha,
        });

        if (execution.status === 'completed' && execution.result?.observedCommitSha) {
          state = markWorkflowDirtyForHead(state, execution.result.observedCommitSha);
        }

        state = {
          ...state,
          blockedReason: execution.blockedReason ?? state.blockedReason,
        };

        await recordPrRun({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          runKey,
          phase: 'resolve_merge_conflicts',
          status:
            execution.status === 'completed'
              ? 'completed'
              : execution.status === 'blocked'
                ? 'blocked'
                : 'skipped',
          targetHeadSha: snapshot.pr.headSha,
          summary: execution.summary,
          detailsJson: toMergeConflictRunDetails(execution),
        });

        if (execution.blockedReason) {
          try {
            await postPullRequestComment({
              repository: snapshot.pr.repository,
              prNumber: snapshot.pr.number,
              body: buildMergeConflictBlockedComment(execution.blockedReason),
            });
          } catch (commentError) {
            await recordWorkflowError({
              repoSlug,
              prNumber: snapshot.pr.number,
              workflowId,
              errorType: 'post_merge_conflict_block_comment_failed',
              errorMessage: toErrorMessage(
                commentError,
                'Unknown merge conflict block comment failure.',
              ),
              phase: 'resolving_merge_conflicts',
              retryable: true,
              blocked: true,
            });
          }
        }
      } catch (error) {
        const message = toErrorMessage(
          error,
          'Unknown merge conflict resolution failure.',
        );
        await recordWorkflowError({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          errorType: 'run_merge_conflict_agent_failed',
          errorMessage: message,
          phase: 'resolving_merge_conflicts',
          retryable: false,
          blocked: true,
        });
        await recordPrRun({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          runKey,
          phase: 'resolve_merge_conflicts',
          status: 'failed',
          targetHeadSha: snapshot.pr.headSha,
          summary: message,
          detailsJson: toRunDetailsJson({
            errorType: 'run_merge_conflict_agent_failed',
            errorMessage: message,
            startingHeadSha: snapshot.pr.headSha,
            baseBranchName,
            baseSha,
          }),
        });

        state = {
          ...state,
          blockedReason: message,
        };

        try {
          await postPullRequestComment({
            repository: snapshot.pr.repository,
            prNumber: snapshot.pr.number,
            body: buildMergeConflictBlockedComment(message),
          });
        } catch (commentError) {
          await recordWorkflowError({
            repoSlug,
            prNumber: snapshot.pr.number,
            workflowId,
            errorType: 'post_merge_conflict_block_comment_failed',
            errorMessage: toErrorMessage(
              commentError,
              'Unknown merge conflict block comment failure.',
            ),
            phase: 'resolving_merge_conflicts',
            retryable: true,
            blocked: true,
          });
        }
      }
    }

    if (reconciliation.action.type === 'fix_checks') {
      const { failingChecks } = reconciliation.action;
      const workflowId = formatPrWorkflowId(snapshot.pr);
      const runKey = formatPrRunKey({
        workflowId,
        passNumber: state.reconciliationCount + 1,
        phase: 'fix_checks',
        targetHeadSha: snapshot.pr.headSha,
      });
      const repoSlug = `${snapshot.pr.repository.owner}/${snapshot.pr.repository.name}`;
      const targetChecks = snapshot.checks.filter((check) =>
        failingChecks.includes(check.name),
      );
      await recordPrRun({
        repoSlug,
        prNumber: snapshot.pr.number,
        workflowId,
        runKey,
        phase: 'fix_checks',
        status: 'running',
        targetHeadSha: snapshot.pr.headSha,
        summary: `Fixing ${targetChecks.length} failing check${targetChecks.length === 1 ? '' : 's'}.`,
        detailsJson: toRunDetailsJson({
          checkNames: targetChecks.map((check) => check.name),
          startingHeadSha: snapshot.pr.headSha,
        }),
      });

      const receivedTerminalSignal = getTerminalSignal();
      if (receivedTerminalSignal !== null) {
        await recordPrRun({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          runKey,
          phase: 'fix_checks',
          status: 'skipped',
          targetHeadSha: snapshot.pr.headSha,
          summary: buildTerminalSkipSummary(receivedTerminalSignal.lifecycleState),
          detailsJson: toRunDetailsJson({
            lifecycleState: receivedTerminalSignal.lifecycleState,
            skippedBeforeStart: true,
            checkNames: targetChecks.map((check) => check.name),
          }),
        });
        state = await performTerminalCleanup();
        return state;
      }

      try {
        const execution = await runFixChecksAgent({
          snapshot,
          checks: targetChecks,
        });

        try {
          if (execution.status === 'completed') {
            await persistFixChecksExecution({
              pr: snapshot.pr,
              execution,
            });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown fix-check persistence failure.';
          await recordWorkflowError({
            repoSlug,
            prNumber: snapshot.pr.number,
            workflowId,
            errorType: 'persist_fix_checks_execution_failed',
            errorMessage: message,
            phase: 'fixing_checks',
            retryable: false,
            blocked: true,
          });
          state = {
            ...state,
            blockedReason: message,
          };
        }

        if (execution.status === 'completed' && execution.result?.observedCommitSha) {
          state = markWorkflowDirtyForHead(state, execution.result.observedCommitSha);
        }

        state = {
          ...state,
          blockedReason: execution.blockedReason ?? state.blockedReason,
        };

        await recordPrRun({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          runKey,
          phase: 'fix_checks',
          status: execution.status === 'completed' ? 'completed' : 'skipped',
          targetHeadSha: snapshot.pr.headSha,
          summary: execution.summary,
          detailsJson: toFixChecksRunDetails(execution),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown fix-check execution failure.';
        await recordWorkflowError({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          errorType: 'run_fix_checks_agent_failed',
          errorMessage: message,
          phase: 'fixing_checks',
          retryable: false,
          blocked: true,
        });
        await recordPrRun({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          runKey,
          phase: 'fix_checks',
          status: 'failed',
          targetHeadSha: snapshot.pr.headSha,
          summary: message,
          detailsJson: toRunDetailsJson({
            errorType: 'run_fix_checks_agent_failed',
            errorMessage: message,
            startingHeadSha: snapshot.pr.headSha,
            checkNames: targetChecks.map((check) => check.name),
          }),
        });

        state = {
          ...state,
          blockedReason: message,
        };
      }
    }

    if (reconciliation.action.type === 'handle_code_rabbit') {
      const workflowId = formatPrWorkflowId(snapshot.pr);
      const runKey = formatPrRunKey({
        workflowId,
        passNumber: state.reconciliationCount + 1,
        phase: 'handle_code_rabbit',
        targetHeadSha: snapshot.pr.headSha,
      });
      const repoSlug = `${snapshot.pr.repository.owner}/${snapshot.pr.repository.name}`;
      await recordPrRun({
        repoSlug,
        prNumber: snapshot.pr.number,
        workflowId,
        runKey,
        phase: 'handle_code_rabbit',
        status: 'running',
        targetHeadSha: snapshot.pr.headSha,
        summary: `Handling ${reconciliation.action.items.length} Code Rabbit thread${reconciliation.action.items.length === 1 ? '' : 's'}.`,
        detailsJson: toRunDetailsJson({
          threadKeys: reconciliation.action.items.map((item) => item.threadKey),
          startingHeadSha: snapshot.pr.headSha,
        }),
      });

      const receivedTerminalSignal = getTerminalSignal();
      if (receivedTerminalSignal !== null) {
        await recordPrRun({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          runKey,
          phase: 'handle_code_rabbit',
          status: 'skipped',
          targetHeadSha: snapshot.pr.headSha,
          summary: buildTerminalSkipSummary(receivedTerminalSignal.lifecycleState),
          detailsJson: toRunDetailsJson({
            lifecycleState: receivedTerminalSignal.lifecycleState,
            skippedBeforeStart: true,
            threadKeys: reconciliation.action.items.map((item) => item.threadKey),
          }),
        });
        state = await performTerminalCleanup();
        return state;
      }

      try {
        const execution = await runCodeRabbitAgent({
          snapshot,
          items: reconciliation.action.items,
          contextNote:
            state.latestReconciliation?.action.type === 'fix_checks'
              ? 'A fix-checks agent ran earlier in this PR workflow and may have updated the branch to resolve CI/build failures. Judge current Code Rabbit threads against the current snapshot and current branch state, not earlier failing-check state.'
              : null,
        });

        try {
          if (execution.status === 'completed') {
            await persistCodeRabbitExecution({
              pr: snapshot.pr,
              execution,
            });
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown persistence failure.';
          await recordWorkflowError({
            repoSlug,
            prNumber: snapshot.pr.number,
            workflowId,
            errorType: 'persist_code_rabbit_execution_failed',
            errorMessage: message,
            phase: 'handling_code_rabbit',
            retryable: false,
            blocked: true,
          });
          state = {
            ...state,
            blockedReason: message,
          };
        }

        if (execution.status === 'completed' && execution.result?.observedCommitSha) {
          state = markWorkflowDirtyForHead(state, execution.result.observedCommitSha);
        }

        state = {
          ...state,
          blockedReason: execution.blockedReason ?? state.blockedReason,
        };

        await recordPrRun({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          runKey,
          phase: 'handle_code_rabbit',
          status: execution.status === 'completed' ? 'completed' : 'skipped',
          targetHeadSha: snapshot.pr.headSha,
          summary: execution.summary,
          detailsJson: toCodeRabbitRunDetails(execution),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown Code Rabbit execution failure.';
        await recordWorkflowError({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          errorType: 'run_code_rabbit_agent_failed',
          errorMessage: message,
          phase: 'handling_code_rabbit',
          retryable: false,
          blocked: true,
        });
        await recordPrRun({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          runKey,
          phase: 'handle_code_rabbit',
          status: 'failed',
          targetHeadSha: snapshot.pr.headSha,
          summary: message,
          detailsJson: toRunDetailsJson({
            errorType: 'run_code_rabbit_agent_failed',
            errorMessage: message,
            startingHeadSha: snapshot.pr.headSha,
            threadKeys: reconciliation.action.items.map((item) => item.threadKey),
          }),
        });

        state = {
          ...state,
          blockedReason: message,
        };
      }
    }

    if (reconciliation.action.type === 'run_specialized_reviewers') {
      const workflowId = formatPrWorkflowId(snapshot.pr);
      const repoSlug = `${snapshot.pr.repository.owner}/${snapshot.pr.repository.name}`;
      const existingReviewerRuns = await listReviewerRunsForPullRequest(snapshot.pr);
      if (terminalSignal !== null) {
        state = await performTerminalCleanup();
        return state;
      }
      const currentPassReviewerSummaries: Array<{
        reviewerId: string;
        summary: string;
        handoffItems: SpecializedReviewerHandoffItem[];
      }> = [];

      const reviewersToRun = reconciliation.action.reviewers.filter((reviewer) => {
        const priorSuccessfulRuns = existingReviewerRuns.filter(
          (run) => run.reviewerId === reviewer.id && run.status === 'completed',
        );

        if (reviewer.runPolicy === 'once_per_pr') {
          return priorSuccessfulRuns.length === 0;
        }

        return !priorSuccessfulRuns.some(
          (run) => run.targetHeadSha === snapshot.pr.headSha,
        );
      });

      for (let index = 0; index < reviewersToRun.length; index += 1) {
        const reviewer = reviewersToRun[index];
        const matchedFiles = getMatchedFiles(snapshot, reviewer);
        const runKey = `${formatPrRunKey({
          workflowId,
          passNumber: state.reconciliationCount + 1,
          phase: 'run_specialized_reviewers',
          targetHeadSha: snapshot.pr.headSha,
        })}:${reviewer.id}`;
        const reviewerPack = await loadReviewerPackDefinition(reviewer.id);
        if (terminalSignal !== null) {
          state = await performTerminalCleanup();
          return state;
        }
        const priorReviewerSummaries = [
          ...existingReviewerRuns
            .filter((run) => run.status === 'completed')
            .map((run) => ({
              reviewerId: run.reviewerId,
              summary: run.summary ?? 'Completed specialized reviewer run.',
              handoffItems: parseReviewerHandoffItems(run.detailsJson),
            })),
          ...currentPassReviewerSummaries,
        ];
        const laterReviewers = reviewersToRun
          .slice(index + 1)
          .map((laterReviewer) => ({
            reviewerId: laterReviewer.id,
            description: laterReviewer.description,
          }));

        await recordPrRun({
          repoSlug,
          prNumber: snapshot.pr.number,
          workflowId,
          runKey,
          phase: 'run_specialized_reviewers',
          status: 'running',
          targetHeadSha: snapshot.pr.headSha,
          summary: `Running specialized reviewer ${reviewer.id}.`,
          detailsJson: toRunDetailsJson({
            reviewerId: reviewer.id,
            matchedFiles,
            reviewerPack,
            laterReviewers,
          }),
        });

        const receivedTerminalSignal = getTerminalSignal();
        if (receivedTerminalSignal !== null) {
          await recordPrRun({
            repoSlug,
            prNumber: snapshot.pr.number,
            workflowId,
            runKey,
            phase: 'run_specialized_reviewers',
            status: 'skipped',
            targetHeadSha: snapshot.pr.headSha,
            summary: buildTerminalSkipSummary(receivedTerminalSignal.lifecycleState),
            detailsJson: toRunDetailsJson({
              lifecycleState: receivedTerminalSignal.lifecycleState,
              reviewerId: reviewer.id,
              skippedBeforeStart: true,
            }),
          });
          state = await performTerminalCleanup();
          return state;
        }

        try {
          const execution = await runSpecializedReviewerAgent({
            snapshot,
            reviewer: {
              id: reviewer.id,
              description: reviewer.description,
              matchedFiles,
            },
            reviewerPack,
            priorReviewerSummaries,
            laterReviewers,
          });

          try {
            if (execution.status === 'completed') {
              await persistSpecializedReviewerExecution({
                pr: snapshot.pr,
                reviewerId: reviewer.id,
                execution,
              });
            }
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : 'Unknown specialized reviewer persistence failure.';
            await recordWorkflowError({
              repoSlug,
              prNumber: snapshot.pr.number,
              workflowId,
              errorType: 'persist_specialized_reviewer_execution_failed',
              errorMessage: message,
              phase: 'running_special_reviewers',
              retryable: false,
              blocked: true,
            });
            state = {
              ...state,
              blockedReason: message,
            };
          }

          await recordPrRun({
            repoSlug,
            prNumber: snapshot.pr.number,
            workflowId,
            runKey,
            phase: 'run_specialized_reviewers',
            status: execution.status === 'completed' ? 'completed' : 'skipped',
            targetHeadSha: snapshot.pr.headSha,
            summary: execution.summary,
            detailsJson: toSpecializedReviewerRunDetails(
              reviewer.id,
              execution,
              reviewerPack,
            ),
          });

          const reviewerDetailsJson = toSpecializedReviewerRunDetails(
            reviewer.id,
            execution,
            reviewerPack,
          );
          await insertReviewerRun({
            repoSlug,
            prNumber: snapshot.pr.number,
            reviewerId: reviewer.id,
            targetHeadSha: snapshot.pr.headSha,
            matchedFiles,
            status: execution.status === 'completed' ? 'completed' : 'skipped',
            summary: execution.summary,
            detailsJson: reviewerDetailsJson,
          });

          if (execution.result) {
            currentPassReviewerSummaries.push({
              reviewerId: reviewer.id,
              summary: execution.result.overallSummary,
              handoffItems: execution.result.handoffItems,
            });
          }

          if (execution.status === 'completed' && execution.result?.observedCommitSha) {
            state = markWorkflowDirtyForHead(state, execution.result.observedCommitSha);
            break;
          }

          state = {
            ...state,
            blockedReason: execution.blockedReason ?? state.blockedReason,
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Unknown specialized reviewer execution failure.';
          await recordWorkflowError({
            repoSlug,
            prNumber: snapshot.pr.number,
            workflowId,
            errorType: 'run_specialized_reviewer_failed',
            errorMessage: message,
            phase: 'running_special_reviewers',
            retryable: false,
            blocked: true,
          });
          await recordPrRun({
            repoSlug,
            prNumber: snapshot.pr.number,
            workflowId,
            runKey,
            phase: 'run_specialized_reviewers',
            status: 'failed',
            targetHeadSha: snapshot.pr.headSha,
            summary: message,
            detailsJson: toRunDetailsJson({
              reviewerId: reviewer.id,
              errorType: 'run_specialized_reviewer_failed',
              errorMessage: message,
              matchedFiles,
            }),
          });

          state = {
            ...state,
            blockedReason: message,
          };
          break;
        }
      }
    }

    if (reconciliation.action.type === 'noop') {
      const workflowId = formatPrWorkflowId(snapshot.pr);
      const runKey = formatPrRunKey({
        workflowId,
        passNumber: state.reconciliationCount + 1,
        phase: 'noop',
        targetHeadSha: snapshot.pr.headSha,
      });
      const repoSlug = `${snapshot.pr.repository.owner}/${snapshot.pr.repository.name}`;

      await recordPrRun({
        repoSlug,
        prNumber: snapshot.pr.number,
        workflowId,
        runKey,
        phase: 'noop',
        status: 'completed',
        targetHeadSha: snapshot.pr.headSha,
        summary: reconciliation.action.reason,
        detailsJson: toRunDetailsJson({
          reason: reconciliation.action.reason,
          snapshotHeadSha: snapshot.pr.headSha,
        }),
      });
    }

    state = completeWorkflowPass(
      state,
      reconciliation,
      baselineProcessedEventCount,
    );

    await recordWorkflowState(input, toWorkflowStatusRecord(state));

    if (
      input.maxReconciliationPasses !== undefined &&
      state.reconciliationCount >= input.maxReconciliationPasses
    ) {
      return state;
    }
  }
}
