import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities.js';
import { loadTemporalRuntimeConfig } from './config.js';

function resolveWorkflowsPath(): string {
  const tsPath = fileURLToPath(new URL('./workflows.ts', import.meta.url));
  if (existsSync(tsPath)) {
    return tsPath;
  }

  return fileURLToPath(new URL('./workflows.js', import.meta.url));
}

async function run() {
  const config = loadTemporalRuntimeConfig();
  const connection = await NativeConnection.connect(config.connectionOptions);
  try {
    const worker = await Worker.create({
      connection,
      namespace: config.namespace,
      taskQueue: config.taskQueue,
      workflowsPath: resolveWorkflowsPath(),
      activities,
    });
    console.info(
      `Starting worker for namespace=${config.namespace} taskQueue=${config.taskQueue}`,
    );
    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
