import { condition, proxyActivities, setHandler } from '@temporalio/workflow';
import type * as activities from '../activities';
import type {
  CodeRabbitAgentExecution,
  FixChecksAgentExecution,
  SpecializedReviewerExecution,
} from '../domain/agentRuntime';
import type { PullRequestSnapshot } from '../domain/github';
import { fileMatchesGlobs } from '../domain/glob';
import type { SpecializedReviewerDefinition } from '../domain/policy';
import type {
  PrReviewWorkflowInput,
  PrReviewWorkflowSignal,
  PrReviewWorkflowState,
} from '../domain/workflow';
import type { SpecializedReviewerHandoffItem } from '../domain/review';
import {
  buildReconciliationResult,
  formatPrRunKey,
  formatPrWorkflowId,
  markWorkflowDirtyForHead,
  recordWorkflowSignal,
  toWorkflowStatusRecord,
} from '../domain/workflow';
import {
  beginWorkflowPass,
  applyReconciliationActionPhase,
  completeWorkflowPass,
  withFetchedSnapshot,
} from './reconcile';
import {
  prActivityObservedSignal,
  prWorkflowShutdownSignal,
  prWorkflowStateQuery,
} from './signals';

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
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

const {
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

export async function prReviewOrchestratorWorkflow(
  input: PrReviewWorkflowInput,
): Promise<PrReviewWorkflowState> {
  let state = await initializePrReviewWorkflow(input);
  let shutdownRequested = false;

  setHandler(prActivityObservedSignal, (signal: PrReviewWorkflowSignal) => {
    state = recordWorkflowSignal(state, signal);
  });
  setHandler(prWorkflowShutdownSignal, () => {
    shutdownRequested = true;
  });
  setHandler(prWorkflowStateQuery, () => state);

  while (true) {
    await condition(() => state.dirty || shutdownRequested);

    if (shutdownRequested && !state.dirty) {
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
