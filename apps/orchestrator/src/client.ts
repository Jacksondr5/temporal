import { Connection, Client, WorkflowIdConflictPolicy } from '@temporalio/client';
import { prReviewOrchestratorWorkflow } from './workflows';
import { loadTemporalRuntimeConfig } from './config';
import {
  formatPrWorkflowId,
  type PrReviewWorkflowSignal,
  type PrReviewWorkflowInput,
} from './domain/workflow';
import { prActivityObservedSignal } from './workflows/signals';

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
