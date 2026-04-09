import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';
import type { PollerRunSummary } from '../poller/runPoller';

const { runScheduledPollerTick } = proxyActivities<typeof activities>({
  startToCloseTimeout: '15 minutes',
});

export async function pollerScheduleWorkflow(): Promise<PollerRunSummary> {
  return await runScheduledPollerTick();
}
