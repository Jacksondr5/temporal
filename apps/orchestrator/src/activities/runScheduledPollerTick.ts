import type { PollerRunSummary } from '../poller/runPoller';
import { runPoller } from '../poller/runPoller';

export async function runScheduledPollerTick(): Promise<PollerRunSummary> {
  return await runPoller();
}
