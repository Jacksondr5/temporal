import { Client, Connection, WorkflowIdConflictPolicy } from '@temporalio/client';
import { nanoid } from 'nanoid';
import { loadTemporalRuntimeConfig } from './config';
import { type PrReviewWorkflowInput, formatPrWorkflowId } from './domain/workflow';
import { prReviewOrchestratorWorkflow } from './workflows';
import { prActivityObservedSignal } from './workflows/signals';

async function run(): Promise<void> {
  const input: PrReviewWorkflowInput = {
    pr: {
      repository: {
        owner: 'example',
        name: 'repo',
      },
      number: 1,
      branchName: 'example-branch',
      headSha: 'foundation-scaffold',
    },
    triggeredBy: 'manual-smoke-test',
    maxReconciliationPasses: 1,
  };
  const workflowId = `${formatPrWorkflowId(input.pr)}:smoke:${nanoid()}`;
  const config = loadTemporalRuntimeConfig();
  const connection = await Connection.connect(config.connectionOptions);
  const client = new Client({ connection, namespace: config.namespace });

  try {
    const handle = await client.workflow.signalWithStart(prReviewOrchestratorWorkflow, {
      workflowId,
      taskQueue: config.taskQueue,
      args: [input],
      signal: prActivityObservedSignal,
      signalArgs: [
        {
          event: {
            id: `manual:${nanoid()}`,
            kind: 'manual',
            pr: input.pr,
            observedAt: new Date().toISOString(),
            actor: null,
            headSha: input.pr.headSha,
          },
        },
      ],
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    });

    console.log(`Started workflow ${handle.workflowId}`);
    console.log(await handle.result());
  } finally {
    await connection.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
