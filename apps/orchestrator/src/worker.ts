import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { loadTemporalRuntimeConfig } from './config';

async function run() {
  const config = loadTemporalRuntimeConfig();
  const connection = await NativeConnection.connect(config.connectionOptions);
  try {
    const worker = await Worker.create({
      connection,
      namespace: config.namespace,
      taskQueue: config.taskQueue,
      workflowsPath: require.resolve('./workflows'),
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
