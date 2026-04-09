import {
  Connection,
  ScheduleClient,
  ScheduleNotFoundError,
  ScheduleOverlapPolicy,
} from '@temporalio/client';
import { loadRuntimeConfig } from './config';
import { pollerScheduleWorkflow } from './workflows';

const POLLER_SCHEDULE_ID = 'pr-review-github-poller';

async function ensurePollerSchedule(): Promise<void> {
  const config = loadRuntimeConfig();
  const connection = await Connection.connect(config.temporal.connectionOptions);
  const scheduleClient = new ScheduleClient({
    connection,
    namespace: config.temporal.namespace,
  });

  const scheduleId = POLLER_SCHEDULE_ID;
  const interval = `${config.poller.intervalSeconds}s`;

  try {
    const handle = scheduleClient.getHandle(scheduleId);

    try {
      await handle.describe();
      await handle.update((previous) => ({
        ...previous,
        spec: {
          intervals: [{ every: interval }],
        },
        policies: {
          ...previous.policies,
          overlap: ScheduleOverlapPolicy.SKIP,
        },
        action: {
          type: 'startWorkflow',
          workflowType: pollerScheduleWorkflow,
          taskQueue: config.temporal.taskQueue,
          args: [],
          workflowId: `${scheduleId}-workflow`,
        },
        state: {
          ...previous.state,
          paused: false,
          note: `Updated by ensurePollerSchedule at ${new Date().toISOString()}`,
        },
      }));
      console.info(
        `Updated poller schedule scheduleId=${scheduleId} interval=${interval} namespace=${config.temporal.namespace} taskQueue=${config.temporal.taskQueue}`,
      );
    } catch (error) {
      if (!(error instanceof ScheduleNotFoundError)) {
        throw error;
      }

      await scheduleClient.create({
        scheduleId,
        spec: {
          intervals: [{ every: interval }],
        },
        policies: {
          overlap: ScheduleOverlapPolicy.SKIP,
        },
        action: {
          type: 'startWorkflow',
          workflowType: pollerScheduleWorkflow,
          taskQueue: config.temporal.taskQueue,
          args: [],
          workflowId: `${scheduleId}-workflow`,
        },
      });
      console.info(
        `Created poller schedule scheduleId=${scheduleId} interval=${interval} namespace=${config.temporal.namespace} taskQueue=${config.temporal.taskQueue}`,
      );
    }
  } finally {
    await connection.close();
  }
}

ensurePollerSchedule().catch((error) => {
  console.error(error);
  process.exit(1);
});
