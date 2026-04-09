import type { PollerRunSummary } from '../poller/runPoller.js';
import { runPoller } from '../poller/runPoller.js';

export async function runScheduledPollerTick(): Promise<PollerRunSummary> {
  return await runPoller();
}
