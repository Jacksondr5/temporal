import { generateText, Output } from 'ai';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AiRuntimeConfig,
  CodexRuntimeConfig,
  GitHubRuntimeConfig,
  GitIdentityRuntimeConfig,
  LinearRuntimeConfig,
} from '../config.js';
import type {
  AgentProvider,
  CodeRabbitBatchAgentOutput,
  CodeRabbitAgentExecution,
  CodeRabbitAgentRunInput,
  FixChecksBatchAgentOutput,
  FixChecksAgentExecution,
  FixChecksAgentRunInput,
  MergeConflictAgentExecution,
  MergeConflictAgentRunInput,
  SpecializedReviewerAgentOutput,
  SpecializedReviewerAgentRunInput,
  SpecializedReviewerExecution,
} from '../domain/agentRuntime.js';
import {
  codeRabbitBatchResultSchema,
  fixChecksBatchResultSchema,
  normalizeCodeRabbitOutcomes,
  normalizeFixCheckOutcomes,
  normalizeMergeConflictResult,
  normalizeSpecializedReviewerResult,
  mergeConflictResultSchema,
  specializedReviewerResultSchema,
} from '../domain/agentRuntime.js';
import type { GitHubCheckRun } from '../domain/github.js';
import type { CodeRabbitReviewItem } from '../domain/review.js';
import type { WorkspaceManager } from './workspace.js';

const execFileAsync = promisify(execFile);

export interface AgentRuntimeClient {
  readonly defaultProvider: AgentProvider;
  readonly configured: boolean;
  runMergeConflictResolution(
    input: MergeConflictAgentRunInput,
  ): Promise<MergeConflictAgentExecution>;
  runFixChecksBatch(input: FixChecksAgentRunInput): Promise<FixChecksAgentExecution>;
  runCodeRabbitBatch(input: CodeRabbitAgentRunInput): Promise<CodeRabbitAgentExecution>;
  runSpecializedReviewer(
    input: SpecializedReviewerAgentRunInput,
  ): Promise<SpecializedReviewerExecution>;
}

type CheckLogSource = 'github_actions' | 'vercel' | 'unknown';
type CheckCategory = 'ci' | 'playwright' | 'vercel_build' | 'unknown';

async function runGit(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ stdout: string; stderr: string }> {
  return await execFileAsync('git', args, {
    cwd,
    maxBuffer: 1024 * 1024 * 10,
    env,
  });
}

async function resolveObservedPushedHead(input: {
  workspacePath: string;
  branchName: string;
  startingHeadSha: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  detectedCommitSha: string | null;
  localHeadAfter: string;
  remoteHeadAfter: string;
}> {
  await runGit(
    ['fetch', 'origin', input.branchName, '--prune'],
    input.workspacePath,
    input.env,
  );

  const localHead = (
    await runGit(['rev-parse', 'HEAD'], input.workspacePath, input.env)
  ).stdout.trim();
  const remoteHead = (
    await runGit(['rev-parse', `origin/${input.branchName}`], input.workspacePath, input.env)
  ).stdout.trim();

  if (remoteHead !== input.startingHeadSha) {
    return {
      detectedCommitSha: remoteHead,
      localHeadAfter: localHead,
      remoteHeadAfter: remoteHead,
    };
  }

  if (localHead !== input.startingHeadSha && remoteHead === localHead) {
    return {
      detectedCommitSha: localHead,
      localHeadAfter: localHead,
      remoteHeadAfter: remoteHead,
    };
  }

  return {
    detectedCommitSha: null,
    localHeadAfter: localHead,
    remoteHeadAfter: remoteHead,
  };
}

async function pushCurrentHead(input: {
  workspacePath: string;
  branchName: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  await runGit(['push', 'origin', `HEAD:${input.branchName}`], input.workspacePath, input.env);
}

async function listUnmergedPaths(workspacePath: string): Promise<string[]> {
  const output = (
    await runGit(['diff', '--name-only', '--diff-filter=U'], workspacePath)
  ).stdout.trim();
  return output.length === 0 ? [] : output.split('\n');
}

async function readPorcelainStatus(workspacePath: string): Promise<string> {
  return (await runGit(['status', '--porcelain'], workspacePath)).stdout.trim();
}

function createCodexLogger(input: {
  runLabel: string;
}): {
  logger: {
    debug: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
} {
  const shouldWriteProviderMessage = (
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    _message: string,
  ): boolean => {
    if (level === 'WARN' || level === 'ERROR') {
      return true;
    }

    if (level === 'INFO' || level === 'DEBUG') {
      return false;
    }

    return true;
  };

  const write = (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string) => {
    if (!shouldWriteProviderMessage(level, message)) {
      return;
    }

    const consoleLine = `[codex ${input.runLabel}] ${message}`;
    switch (level) {
      case 'DEBUG':
        console.debug(consoleLine);
        break;
      case 'INFO':
        console.info(consoleLine);
        break;
      case 'WARN':
        console.warn(consoleLine);
        break;
      case 'ERROR':
        console.error(consoleLine);
        break;
    }
  };

  return {
    logger: {
      debug: (message) => write('DEBUG', message),
      info: (message) => write('INFO', message),
      warn: (message) => write('WARN', message),
      error: (message) => write('ERROR', message),
    },
  };
}

function inferCheckLogSource(check: GitHubCheckRun): CheckLogSource {
  const appSlug = check.appSlug?.toLowerCase() ?? '';
  const appName = check.appName?.toLowerCase() ?? '';
  const detailsUrl = check.detailsUrl?.toLowerCase() ?? '';

  if (
    appSlug.includes('vercel') ||
    appName.includes('vercel') ||
    detailsUrl.includes('vercel.com') ||
    detailsUrl.includes('vercel.app')
  ) {
    return 'vercel';
  }

  if (
    appSlug.includes('github') ||
    appSlug.includes('actions') ||
    detailsUrl.includes('github.com')
  ) {
    return 'github_actions';
  }

  return 'unknown';
}

function inferCheckCategory(check: GitHubCheckRun): CheckCategory {
  const name = check.name.toLowerCase();
  const source = inferCheckLogSource(check);

  if (source === 'vercel') {
    return 'vercel_build';
  }

  if (name.includes('playwright') || name.includes('e2e')) {
    return 'playwright';
  }

  if (
    name.includes('ci') ||
    name.includes('lint') ||
    name.includes('typecheck') ||
    name.includes('build') ||
    name.includes('test')
  ) {
    return 'ci';
  }

  return 'unknown';
}

function describeCheckInvestigation(check: GitHubCheckRun): string {
  const source = inferCheckLogSource(check);
  const category = inferCheckCategory(check);

  if (source === 'vercel') {
    return [
      'This failure comes from Vercel, not a GitHub-hosted workflow.',
      'Use Vercel deployment/build logs rather than GitHub Actions logs.',
      check.detailsUrl ? `Start from detailsUrl=${check.detailsUrl}` : 'No detailsUrl was available.',
    ].join(' ');
  }

  if (source === 'github_actions' || category === 'ci' || category === 'playwright') {
    return [
      'This failure is GitHub-hosted.',
      'Use the GitHub CLI (`gh`) to inspect workflow runs, jobs, and logs for this check.',
      check.detailsUrl ? `Start from detailsUrl=${check.detailsUrl}` : 'No detailsUrl was available.',
    ].join(' ');
  }

  return [
    'The check source could not be classified confidently.',
    'Use the check details URL and available GitHub metadata to determine where logs are hosted before debugging.',
    check.detailsUrl ? `detailsUrl=${check.detailsUrl}` : 'No detailsUrl was available.',
  ].join(' ');
}

function buildFixChecksPrompt(input: FixChecksAgentRunInput): string {
  const pr = input.snapshot.pr;
  const checkBlocks = input.checks
    .map((check, index) =>
      [
        `Check ${index + 1}`,
        `checkName: ${check.name}`,
        `status: ${check.status}`,
        `conclusion: ${check.conclusion ?? 'null'}`,
        `appName: ${check.appName ?? 'unknown'}`,
        `appSlug: ${check.appSlug ?? 'unknown'}`,
        `detailsUrl: ${check.detailsUrl ?? 'unknown'}`,
        `logSource: ${inferCheckLogSource(check)}`,
        `category: ${inferCheckCategory(check)}`,
        `investigationGuidance: ${describeCheckInvestigation(check)}`,
      ].join('\n'),
    )
    .join('\n\n');

  return `
You are autonomously fixing failing CI/build checks on a GitHub pull request before any Code Rabbit handling happens.

Repository: ${pr.repository.owner}/${pr.repository.name}
Pull Request: #${pr.number}
Branch: ${pr.branchName}
Head SHA: ${pr.headSha}
Title: ${input.snapshot.title}
Body:
${input.snapshot.body ?? '(none)'}

Changed files:
${input.snapshot.changedFiles.join('\n') || '(none)'}

Failing fixable checks to handle:
${checkBlocks}

Requirements:
- Address every listed failing check exactly once.
- Treat this as one batch run for the whole PR.
- You may inspect logs and external systems using credentials already present in the environment.
- For GitHub-hosted CI and Playwright checks, use the GitHub CLI (\`gh\`) to inspect workflow runs, jobs, and logs.
- For Vercel failures, inspect Vercel deployment/build logs instead of GitHub workflow logs.
- Make all code changes first and push exactly once at the end if you fix anything.
- Return didModifyCode=true if you changed repository code.
- Return didCommitCode=true if you created and pushed a commit.
- If you do not push a commit, explain why in whyNoCommit.
- Return only truthful final IDs and summaries for work you actually performed.

Return a structured result describing:
- an overallSummary
- an investigationSummary explaining what you inspected and learned
- a finalAssessment explaining why your final state is correct
- whyNoCommit if you did not push, otherwise null
- commandsSummary listing the most important commands/tools you used
- didModifyCode
- didCommitCode
- one result per listed check, including checkName, reasoningSummary, actionSummary, and evidenceSummary
`.trim();
}

function buildCodeRabbitPrompt(input: CodeRabbitAgentRunInput): string {
  const pr = input.snapshot.pr;
  const reviewSummaries = input.snapshot.reviewSummaries
    .map(
      (review) =>
        [
          `- reviewId=${review.reviewId}`,
          `author=${review.author?.login ?? 'unknown'}`,
          `state=${review.state}`,
          `submittedAt=${review.submittedAt}`,
          `body=${review.body ?? ''}`,
        ].join(' | '),
    )
    .join('\n');
  const threadBlocks = input.items
    .map((item, index) =>
      [
        `Thread ${index + 1}`,
        `threadKey: ${item.threadKey}`,
        `path: ${item.path ?? 'unknown'}`,
        `line: ${item.line ?? 'unknown'}`,
        `updatedAt: ${item.updatedAt}`,
        'body:',
        item.body,
      ].join('\n'),
    )
    .join('\n\n');
  const contextBlock =
    input.contextNote && input.contextNote.trim().length > 0
      ? `Workflow context note:\n${input.contextNote.trim()}\n\n`
      : '';

  return `
You are autonomously handling unresolved Code Rabbit review threads on a GitHub pull request.

Repository: ${pr.repository.owner}/${pr.repository.name}
Pull Request: #${pr.number}
Branch: ${pr.branchName}
Head SHA: ${pr.headSha}
Title: ${input.snapshot.title}
Body:
${input.snapshot.body ?? '(none)'}

Changed files:
${input.snapshot.changedFiles.join('\n') || '(none)'}

${contextBlock}Review summaries:
${reviewSummaries || '(none)'}

Unresolved Code Rabbit threads to handle:
${threadBlocks}

Requirements:
- Address every listed thread exactly once.
- Mixed outcomes are allowed: fix, false_positive, or defer.
- If you fix code, make all edits first and push exactly once at the end.
- Return didModifyCode=true if you changed repository code.
- Return didCommitCode=true if you created and pushed a commit.
- Do not comment on GitHub for fixed threads.
- For false_positive threads, reply on the GitHub thread with a concise rationale.
- For deferred threads, create exactly one Linear ticket per deferred thread and reply on the GitHub thread with the ticket reference.
- Use the credentials already available in the environment.
- Return only truthful final IDs for anything you actually created or posted.

Return a structured result describing:
- an overallSummary
- an investigationSummary explaining what you inspected and learned
- a finalAssessment explaining why your final state is correct
- whyNoCommit if you did not push, otherwise null
- commandsSummary listing the most important commands/tools you used
- didModifyCode
- didCommitCode
- one outcome per thread, including threadKey, disposition, reasoningSummary, actionSummary, evidenceSummary, githubCommentId if you posted one, and linearIssueId if you created one
`.trim();
}

function buildAgentEnvironment(
  github: GitHubRuntimeConfig,
  gitIdentity: GitIdentityRuntimeConfig,
  linear: LinearRuntimeConfig,
  codex: CodexRuntimeConfig,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }

  env.GITHUB_TOKEN = github.token;
  env.GH_TOKEN = github.token;
  env.LINEAR_API_KEY = linear.apiKey;
  env.LINEAR_TEAM_ID = linear.teamId;
  env.LINEAR_DEFAULT_PROJECT_ID = linear.defaultProjectId;

  if (gitIdentity.userName !== null && gitIdentity.userEmail !== null) {
    env.GIT_AUTHOR_NAME = gitIdentity.userName;
    env.GIT_AUTHOR_EMAIL = gitIdentity.userEmail;
    env.GIT_COMMITTER_NAME = gitIdentity.userName;
    env.GIT_COMMITTER_EMAIL = gitIdentity.userEmail;
  }

  if (codex.homeDir !== null) {
    env.HOME = codex.homeDir;
  }

  return env;
}

function summarizeHandledThreads(items: CodeRabbitReviewItem[]): string {
  return `Handled ${items.length} Code Rabbit thread${items.length === 1 ? '' : 's'}.`;
}

function summarizeHandledChecks(checks: GitHubCheckRun[]): string {
  return `Handled ${checks.length} failing check${checks.length === 1 ? '' : 's'}.`;
}

function summarizeMergeConflict(input: MergeConflictAgentRunInput): string {
  return `Resolved merge conflicts with ${input.baseBranchName}.`;
}

function summarizeSpecializedReviewer(input: SpecializedReviewerAgentRunInput): string {
  return `Completed specialized reviewer ${input.reviewer.id}.`;
}

function buildMergeConflictPrompt(
  input: MergeConflictAgentRunInput,
  workspace: {
    mergeOutput: string;
    conflictedFiles: string[];
  },
): string {
  const pr = input.snapshot.pr;

  return `
You are autonomously resolving merge conflicts on a GitHub pull request before any other review automation runs.

Repository: ${pr.repository.owner}/${pr.repository.name}
Pull Request: #${pr.number}
Branch: ${pr.branchName}
Head SHA: ${pr.headSha}
Base branch: ${input.baseBranchName}
Base SHA: ${input.baseSha}
Title: ${input.snapshot.title}
Body:
${input.snapshot.body ?? '(none)'}

Changed files:
${input.snapshot.changedFiles.join('\n') || '(none)'}

Conflicted files:
${workspace.conflictedFiles.join('\n') || '(none)'}

Local merge output:
${workspace.mergeOutput || '(none)'}

Requirements:
- Resolve the merge conflicts.
- Preserve the intent of both the PR branch and the base branch where possible.
- Make the project valid after the merge.
- Avoid broad or unrelated refactoring.
- Inspect conflicted files before editing.
- Run focused verification when practical.
- Commit and push exactly once if you resolve the conflict.
- Return didModifyCode=true if you changed repository code.
- Return didCommitCode=true if you created and pushed a commit.
- If you do not push a commit, explain why in whyNoCommit.
- Return only truthful final IDs and summaries for work you actually performed.

Return a structured result describing:
- an overallSummary
- an investigationSummary explaining what you inspected and learned
- a finalAssessment explaining why your final state is correct
- whyNoCommit if you did not push, otherwise null
- commandsSummary listing the most important commands/tools you used
- didModifyCode
- didCommitCode
`.trim();
}

function buildSpecializedReviewerPrompt(
  input: SpecializedReviewerAgentRunInput,
): string {
  const pr = input.snapshot.pr;
  const priorReviewerSection =
    input.priorReviewerSummaries.length === 0
      ? '(none)'
      : input.priorReviewerSummaries
          .map((summary, index) =>
            [
              `Prior reviewer ${index + 1}`,
              `reviewerId: ${summary.reviewerId}`,
              `summary: ${summary.summary}`,
              `handoffItems: ${
                summary.handoffItems.length === 0
                  ? '(none)'
                  : summary.handoffItems
                      .map((item) => {
                        const target =
                          item.targetReviewerId === null ? 'any' : item.targetReviewerId;
                        return `[target=${target}] ${item.summary}`;
                      })
                      .join(' | ')
              }`,
            ].join('\n'),
          )
          .join('\n\n');
  const laterReviewerSection =
    input.laterReviewers.length === 0
      ? '(none)'
      : input.laterReviewers
          .map(
            (reviewer, index) =>
              `${index + 1}. ${reviewer.reviewerId}: ${reviewer.description}`,
          )
          .join('\n');

  return `
You are a specialized fixer-reviewer running inside an AI-driven PR workflow.

Repository: ${pr.repository.owner}/${pr.repository.name}
Pull Request: #${pr.number}
Branch: ${pr.branchName}
Head SHA: ${pr.headSha}
Title: ${input.snapshot.title}
Body:
${input.snapshot.body ?? '(none)'}

You are reviewer: ${input.reviewer.id}
Reviewer description: ${input.reviewer.description}
Matched files:
${input.reviewer.matchedFiles.join('\n') || '(none)'}

Reviewer pack repository path: ${input.reviewerPack.repoPath}
Reviewer pack commit SHA: ${input.reviewerPack.repoCommitSha ?? 'uncommitted'}
Start by reading this reviewer pack entrypoint:
${input.reviewerPack.entrypointPath}

Additional knowledge files you may load:
${input.reviewerPack.knowledgeFilePaths.join('\n') || '(none)'}

Changed files in this PR:
${input.snapshot.changedFiles.join('\n') || '(none)'}

Prior reviewer summaries:
${priorReviewerSection}

After you complete your work, these reviewers will run later in the workflow:
${laterReviewerSection}

Requirements:
- Focus primarily on your specialized domain and the matched files.
- You may make cross-cutting edits when required for correctness.
- Prefer fixing concrete issues directly instead of only reporting them.
- Only leave an issue unresolved when it is unsafe, out of scope for this reviewer, or genuinely requires follow-up from a later reviewer or a human.
- If you modify code, make all edits first and push exactly once at the end.
- Return didModifyCode=true if you changed repository code.
- Return didCommitCode=true if you created and pushed a commit.
- If you do not push a commit, explain the blocking reason in whyNoCommit.
- Treat findings as any issues that still need attention after your run. If you fixed everything you found, findings may be empty.
- Emit handoff items for later reviewers when they should verify or adapt to something you changed.

Return a structured result containing:
- reviewerId
- matchedFiles
- overallSummary
- investigationSummary
- finalAssessment
- whyNoCommit
- commandsSummary
- didModifyCode
- didCommitCode
- findings with title, actionSummary, and evidenceSummary for unresolved or follow-up issues
- handoffItems with targetReviewerId or null and a summary
`.trim();
}

async function runCodexStructuredObject<T>({
  model,
  allowNpx,
  cwd,
  env,
  runLabel,
  schema,
  prompt,
}: {
  model: string;
  allowNpx: boolean;
  cwd: string;
  env: Record<string, string>;
  runLabel: string;
  schema: Parameters<typeof Output.object>[0]['schema'];
  prompt: string;
}): Promise<{
  output: T;
  usage: import('ai').LanguageModelUsage;
  providerMetadata: import('ai').ProviderMetadata | null;
}> {
  const logConfig = createCodexLogger({
    runLabel,
  });
  const { codexExec } = await import('ai-sdk-provider-codex-cli');
  const result = await generateText({
    model: codexExec(model, {
      allowNpx,
      verbose: true,
      logger: logConfig.logger,
      approvalMode: 'never',
      sandboxMode: 'danger-full-access',
      skipGitRepoCheck: false,
      cwd,
      addDirs: [cwd],
      env,
      reasoningEffort: 'medium',
      reasoningSummary: 'auto',
      modelVerbosity: 'medium',
    }),
    output: Output.object({
      schema,
    }),
    prompt,
  });

  return {
    output: result.output as T,
    usage: result.usage,
    providerMetadata: result.providerMetadata ?? null,
  };
}

export function createAgentRuntimeClient(options: {
  ai: AiRuntimeConfig;
  github: GitHubRuntimeConfig;
  gitIdentity: GitIdentityRuntimeConfig;
  linear: LinearRuntimeConfig;
  workspaceManager: WorkspaceManager;
}): AgentRuntimeClient {
  return {
    defaultProvider: options.ai.defaultProvider,
    configured: true,
    runMergeConflictResolution: async (input) => {
      const provider = input.provider ?? options.ai.defaultProvider;
      if (provider !== 'codex') {
        return {
          status: 'skipped',
          provider,
          workspace: null,
          logFilePath: null,
          startingHeadSha: input.snapshot.pr.headSha,
          localHeadAfter: null,
          remoteHeadAfter: null,
          summary: `Skipped merge conflict resolution because provider "${provider}" is not implemented yet.`,
          blockedReason: `Provider "${provider}" is not implemented yet.`,
          usage: null,
          providerMetadata: null,
          result: null,
        };
      }

      const workspace = await options.workspaceManager.prepareMergeConflictWorkspace({
        pr: input.snapshot.pr,
        baseBranchName: input.baseBranchName,
        baseSha: input.baseSha,
      });
      const agentEnv = buildAgentEnvironment(
        options.github,
        options.gitIdentity,
        options.linear,
        options.ai.codex,
      );

      if (workspace.mergeAttemptStatus === 'clean_merge') {
        const localHeadAfter = (
          await runGit(['rev-parse', 'HEAD'], workspace.path, agentEnv)
        ).stdout.trim();

        if (localHeadAfter === input.snapshot.pr.headSha) {
          return {
            status: 'blocked',
            provider: 'codex',
            workspace,
            logFilePath: null,
            startingHeadSha: input.snapshot.pr.headSha,
            localHeadAfter,
            remoteHeadAfter: null,
            summary: 'GitHub reported merge conflicts, but local merge produced no branch update.',
            blockedReason:
              'GitHub reported merge conflicts, but local merge produced no branch update.',
            usage: null,
            providerMetadata: null,
            result: null,
          };
        }

        await pushCurrentHead({
          workspacePath: workspace.path,
          branchName: input.snapshot.pr.branchName,
          env: agentEnv,
        });
        const observedGitState = await resolveObservedPushedHead({
          workspacePath: workspace.path,
          branchName: input.snapshot.pr.branchName,
          startingHeadSha: input.snapshot.pr.headSha,
          env: agentEnv,
        });
        const observedCommitSha = observedGitState.detectedCommitSha;

        if (observedCommitSha === null) {
          throw new Error(
            [
              'Local merge completed but no pushed merge commit was observed.',
              `startingHeadSha=${input.snapshot.pr.headSha}`,
              `localHeadAfter=${observedGitState.localHeadAfter}`,
              `remoteHeadAfter=${observedGitState.remoteHeadAfter}`,
            ].join(' '),
          );
        }

        return {
          status: 'completed',
          provider: 'codex',
          workspace,
          logFilePath: null,
          startingHeadSha: input.snapshot.pr.headSha,
          localHeadAfter: observedGitState.localHeadAfter,
          remoteHeadAfter: observedGitState.remoteHeadAfter,
          summary: summarizeMergeConflict(input),
          blockedReason: null,
          usage: null,
          providerMetadata: null,
          result: {
            overallSummary: summarizeMergeConflict(input),
            investigationSummary:
              'The base branch merged cleanly in the prepared PR workspace.',
            finalAssessment:
              'A merge commit was pushed to the PR branch for a fresh reconciliation pass.',
            whyNoCommit: null,
            commandsSummary: [
              `git merge --no-ff --no-edit origin/${input.baseBranchName}`,
              `git push origin HEAD:${input.snapshot.pr.branchName}`,
            ],
            didModifyCode: true,
            didCommitCode: true,
            observedCommitSha,
          },
        };
      }

      if (workspace.conflictedFiles.length === 0) {
        return {
          status: 'blocked',
          provider: 'codex',
          workspace,
          logFilePath: null,
          startingHeadSha: input.snapshot.pr.headSha,
          localHeadAfter: workspace.headSha,
          remoteHeadAfter: null,
          summary: 'Local merge failed but no conflicted files were detected.',
          blockedReason: 'Local merge failed but no conflicted files were detected.',
          usage: null,
          providerMetadata: null,
          result: null,
        };
      }

      const { output: object, usage, providerMetadata } =
        await runCodexStructuredObject<MergeConflictAgentExecution['result']>({
          model: options.ai.codex.model,
          allowNpx: options.ai.codex.allowNpx,
          cwd: workspace.path,
          env: agentEnv,
          runLabel: 'merge-conflicts',
          schema: mergeConflictResultSchema,
          prompt: buildMergeConflictPrompt(input, workspace),
        });

      if (object === null) {
        throw new Error('Merge-conflict agent returned no structured result.');
      }

      const normalizedResult = normalizeMergeConflictResult(object);
      const unmergedPaths = await listUnmergedPaths(workspace.path);

      if (!normalizedResult.didCommitCode) {
        const blockedReason =
          normalizedResult.whyNoCommit ??
          (unmergedPaths.length > 0
            ? `Unresolved merge conflicts remain in ${unmergedPaths.join(', ')}.`
            : 'Merge-conflict agent did not push a resolution commit.');
        const localHeadAfter = (
          await runGit(['rev-parse', 'HEAD'], workspace.path, agentEnv)
        ).stdout.trim();

        return {
          status: 'blocked',
          provider: 'codex',
          workspace,
          logFilePath: null,
          startingHeadSha: input.snapshot.pr.headSha,
          localHeadAfter,
          remoteHeadAfter: null,
          summary: normalizedResult.overallSummary,
          blockedReason,
          usage,
          providerMetadata,
          result: {
            ...normalizedResult,
            observedCommitSha: null,
          },
        };
      }

      if (unmergedPaths.length > 0) {
        throw new Error(
          `Merge-conflict agent reported didCommitCode=true but unmerged paths remain: ${unmergedPaths.join(', ')}`,
        );
      }

      const porcelainStatus = await readPorcelainStatus(workspace.path);
      if (porcelainStatus.length > 0) {
        throw new Error(
          `Merge-conflict agent reported didCommitCode=true but the working tree is dirty: ${porcelainStatus}`,
        );
      }

      const observedGitState = await resolveObservedPushedHead({
        workspacePath: workspace.path,
        branchName: input.snapshot.pr.branchName,
        startingHeadSha: input.snapshot.pr.headSha,
        env: agentEnv,
      });
      const observedCommitSha = observedGitState.detectedCommitSha;

      if (observedCommitSha === null) {
        throw new Error(
          [
            'Merge-conflict agent reported didCommitCode=true but no pushed commit was observed.',
            `startingHeadSha=${input.snapshot.pr.headSha}`,
            `localHeadAfter=${observedGitState.localHeadAfter}`,
            `remoteHeadAfter=${observedGitState.remoteHeadAfter}`,
          ].join(' '),
        );
      }

      return {
        status: 'completed',
        provider: 'codex',
        workspace,
        logFilePath: null,
        startingHeadSha: input.snapshot.pr.headSha,
        localHeadAfter: observedGitState.localHeadAfter,
        remoteHeadAfter: observedGitState.remoteHeadAfter,
        summary: normalizedResult.overallSummary || summarizeMergeConflict(input),
        blockedReason: null,
        usage,
        providerMetadata,
        result: {
          ...normalizedResult,
          observedCommitSha,
        },
      };
    },
    runFixChecksBatch: async (input) => {
      const provider = input.provider ?? options.ai.defaultProvider;
      if (provider !== 'codex') {
        return {
          status: 'skipped',
          provider,
          workspace: null,
          logFilePath: null,
          startingHeadSha: input.snapshot.pr.headSha,
          localHeadAfter: null,
          remoteHeadAfter: null,
          summary: `Skipped fix-check handling because provider "${provider}" is not implemented yet.`,
          blockedReason: `Provider "${provider}" is not implemented yet.`,
          usage: null,
          providerMetadata: null,
          result: null,
        };
      }

      const workspace = await options.workspaceManager.preparePullRequestWorkspace(
        input.snapshot.pr,
      );
      const agentEnv = buildAgentEnvironment(
        options.github,
        options.gitIdentity,
        options.linear,
        options.ai.codex,
      );
      const { output: object, usage, providerMetadata } =
        await runCodexStructuredObject<FixChecksBatchAgentOutput>({
          model: options.ai.codex.model,
          allowNpx: options.ai.codex.allowNpx,
          cwd: workspace.path,
          env: agentEnv,
          runLabel: 'fix-checks',
          schema: fixChecksBatchResultSchema,
          prompt: buildFixChecksPrompt(input),
        });

      if (object === null) {
        throw new Error('Fix-check agent returned no structured result.');
      }

      normalizeFixCheckOutcomes(input.checks, object);
      const observedGitState = await resolveObservedPushedHead({
        workspacePath: workspace.path,
        branchName: input.snapshot.pr.branchName,
        startingHeadSha: input.snapshot.pr.headSha,
        env: agentEnv,
      });
      const observedCommitSha = observedGitState.detectedCommitSha;
      if (object.didCommitCode && observedCommitSha === null) {
        throw new Error(
          [
            'Agent reported completed fix-check handling but no pushed commit was observed.',
            `startingHeadSha=${input.snapshot.pr.headSha}`,
            `localHeadAfter=${observedGitState.localHeadAfter}`,
            `remoteHeadAfter=${observedGitState.remoteHeadAfter}`,
          ].join(' '),
        );
      }

      if (!object.didCommitCode && observedCommitSha !== null) {
        console.warn(
          `Fix-check agent reported didCommitCode=false but observed pushed head ${observedCommitSha}.`,
        );
      }

      return {
        status: 'completed',
        provider: 'codex',
        workspace,
        logFilePath: null,
        startingHeadSha: input.snapshot.pr.headSha,
        localHeadAfter: observedGitState.localHeadAfter,
        remoteHeadAfter: observedGitState.remoteHeadAfter,
        summary: object.overallSummary || summarizeHandledChecks(input.checks),
        blockedReason: null,
        usage,
        providerMetadata,
        result: {
          ...object,
          observedCommitSha,
        },
      };
    },
    runCodeRabbitBatch: async (input) => {
      const provider = input.provider ?? options.ai.defaultProvider;
      if (provider !== 'codex') {
        return {
          status: 'skipped',
          provider,
          workspace: null,
          logFilePath: null,
          startingHeadSha: input.snapshot.pr.headSha,
          localHeadAfter: null,
          remoteHeadAfter: null,
          summary: `Skipped Code Rabbit handling because provider "${provider}" is not implemented yet.`,
          blockedReason: `Provider "${provider}" is not implemented yet.`,
          usage: null,
          providerMetadata: null,
          result: null,
        };
      }

      const workspace = await options.workspaceManager.preparePullRequestWorkspace(
        input.snapshot.pr,
      );
      const agentEnv = buildAgentEnvironment(
        options.github,
        options.gitIdentity,
        options.linear,
        options.ai.codex,
      );
      const { output: object, usage, providerMetadata } =
        await runCodexStructuredObject<CodeRabbitBatchAgentOutput>({
          model: options.ai.codex.model,
          allowNpx: options.ai.codex.allowNpx,
          cwd: workspace.path,
          env: agentEnv,
          runLabel: 'code-rabbit',
          schema: codeRabbitBatchResultSchema,
          prompt: buildCodeRabbitPrompt(input),
        });

      if (object === null) {
        throw new Error('Code Rabbit agent returned no structured result.');
      }

      const normalizedOutcomes = normalizeCodeRabbitOutcomes(input.items, object);
      const observedGitState = await resolveObservedPushedHead({
        workspacePath: workspace.path,
        branchName: input.snapshot.pr.branchName,
        startingHeadSha: input.snapshot.pr.headSha,
        env: agentEnv,
      });
      const observedCommitSha = observedGitState.detectedCommitSha;
      const fixCount = normalizedOutcomes.filter(
        (outcome) => outcome.disposition === 'fix',
      ).length;

      if (fixCount > 0 && observedCommitSha === null) {
        throw new Error(
          [
            'Agent reported fixed Code Rabbit threads but no pushed commit was observed.',
            `startingHeadSha=${input.snapshot.pr.headSha}`,
            `localHeadAfter=${observedGitState.localHeadAfter}`,
            `remoteHeadAfter=${observedGitState.remoteHeadAfter}`,
          ].join(' '),
        );
      }

      if (object.didCommitCode && observedCommitSha === null) {
        throw new Error(
          [
            'Agent reported didCommitCode=true for Code Rabbit handling but no pushed commit was observed.',
            `startingHeadSha=${input.snapshot.pr.headSha}`,
            `localHeadAfter=${observedGitState.localHeadAfter}`,
            `remoteHeadAfter=${observedGitState.remoteHeadAfter}`,
          ].join(' '),
        );
      }

      if (!object.didCommitCode && observedCommitSha !== null) {
        console.warn(
          `Code Rabbit agent reported didCommitCode=false but observed pushed head ${observedCommitSha}.`,
        );
      }

      return {
        status: 'completed',
        provider: 'codex',
        workspace,
        logFilePath: null,
        startingHeadSha: input.snapshot.pr.headSha,
        localHeadAfter: observedGitState.localHeadAfter,
        remoteHeadAfter: observedGitState.remoteHeadAfter,
        summary: object.overallSummary || summarizeHandledThreads(input.items),
        blockedReason: null,
        usage,
        providerMetadata,
        result: {
          ...object,
          observedCommitSha,
        },
      };
    },
    runSpecializedReviewer: async (input) => {
      const provider = input.provider ?? options.ai.defaultProvider;
      if (provider !== 'codex') {
        return {
          status: 'skipped',
          provider,
          workspace: null,
          logFilePath: null,
          startingHeadSha: input.snapshot.pr.headSha,
          localHeadAfter: null,
          remoteHeadAfter: null,
          summary: `Skipped specialized reviewer because provider "${provider}" is not implemented yet.`,
          blockedReason: `Provider "${provider}" is not implemented yet.`,
          usage: null,
          providerMetadata: null,
          result: null,
        };
      }

      const workspace = await options.workspaceManager.preparePullRequestWorkspace(
        input.snapshot.pr,
      );
      const agentEnv = buildAgentEnvironment(
        options.github,
        options.gitIdentity,
        options.linear,
        options.ai.codex,
      );
      const { output: object, usage, providerMetadata } =
        await runCodexStructuredObject<SpecializedReviewerAgentOutput>({
          model: options.ai.codex.model,
          allowNpx: options.ai.codex.allowNpx,
          cwd: workspace.path,
          env: agentEnv,
          runLabel: `specialized-${input.reviewer.id}`,
          schema: specializedReviewerResultSchema,
          prompt: buildSpecializedReviewerPrompt(input),
        });

      if (object === null) {
        throw new Error('Specialized reviewer returned no structured result.');
      }

      normalizeSpecializedReviewerResult(input, object);
      const observedGitState = await resolveObservedPushedHead({
        workspacePath: workspace.path,
        branchName: input.snapshot.pr.branchName,
        startingHeadSha: input.snapshot.pr.headSha,
        env: agentEnv,
      });
      const observedCommitSha = observedGitState.detectedCommitSha;

      if (object.didCommitCode && observedCommitSha === null) {
        throw new Error(
          [
            `Specialized reviewer "${input.reviewer.id}" reported didCommitCode=true but no pushed commit was observed.`,
            `startingHeadSha=${input.snapshot.pr.headSha}`,
            `localHeadAfter=${observedGitState.localHeadAfter}`,
            `remoteHeadAfter=${observedGitState.remoteHeadAfter}`,
          ].join(' '),
        );
      }

      if (!object.didCommitCode && observedCommitSha !== null) {
        console.warn(
          `Specialized reviewer "${input.reviewer.id}" reported didCommitCode=false but observed pushed head ${observedCommitSha}.`,
        );
      }

      return {
        status: 'completed',
        provider: 'codex',
        workspace,
        logFilePath: null,
        startingHeadSha: input.snapshot.pr.headSha,
        localHeadAfter: observedGitState.localHeadAfter,
        remoteHeadAfter: observedGitState.remoteHeadAfter,
        summary: object.overallSummary || summarizeSpecializedReviewer(input),
        blockedReason: null,
        usage,
        providerMetadata,
        result: {
          ...object,
          observedCommitSha,
        },
      };
    },
  };
}
