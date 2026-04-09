import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities.js';
import type { PollerRunSummary } from '../poller/runPoller.js';

const { runScheduledPollerTick } = proxyActivities<typeof activities>({
  startToCloseTimeout: '15 minutes',
});

export async function pollerScheduleWorkflow(): Promise<PollerRunSummary> {
  return await runScheduledPollerTick();
}
