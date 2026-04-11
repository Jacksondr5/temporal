import { Connection, Client, WorkflowIdConflictPolicy } from '@temporalio/client';
import { prReviewOrchestratorWorkflow } from './workflows.js';
import { loadTemporalRuntimeConfig } from './config.js';
import {
  formatPrWorkflowId,
  type PrReviewWorkflowSignal,
  type PrReviewWorkflowInput,
} from './domain/workflow.js';
import type { PullRequestLifecycleState, PullRequestRef } from './domain/github.js';
import { prActivityObservedSignal, prWorkflowShutdownSignal } from './workflows/signals.js';

export async function createTemporalClient(): Promise<Client> {
  const config = loadTemporalRuntimeConfig();
  const connection = await Connection.connect(config.connectionOptions);
  return new Client({ connection, namespace: config.namespace });
}

export async function signalPullRequestActivity(
  input: PrReviewWorkflowInput,
  signal: PrReviewWorkflowSignal,
): Promise<string> {
  const config = loadTemporalRuntimeConfig();
  const connection = await Connection.connect(config.connectionOptions);
  const client = new Client({ connection, namespace: config.namespace });

  try {
    const handle = await client.workflow.signalWithStart(prReviewOrchestratorWorkflow, {
      workflowId: formatPrWorkflowId(input.pr),
      taskQueue: config.taskQueue,
      args: [input],
      signal: prActivityObservedSignal,
      signalArgs: [signal],
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    });

    return handle.workflowId;
  } finally {
    await connection.close();
  }
}

export async function signalPullRequestTerminalState(input: {
  pr: PullRequestRef;
  lifecycleState: PullRequestLifecycleState;
  observedAt: string;
  headSha: string;
}): Promise<string> {
  const config = loadTemporalRuntimeConfig();
  const connection = await Connection.connect(config.connectionOptions);
  const client = new Client({ connection, namespace: config.namespace });

  try {
    const workflowId = formatPrWorkflowId(input.pr);
    const handle = client.workflow.getHandle(workflowId);
    await handle.signal(prWorkflowShutdownSignal, {
      lifecycleState: input.lifecycleState,
      observedAt: input.observedAt,
      headSha: input.headSha,
    });
    return workflowId;
  } finally {
    await connection.close();
  }
}
