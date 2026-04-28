import { loadRuntimeConfig } from '../config.js';
import type {
  MergeConflictAgentExecution,
  MergeConflictAgentRunInput,
} from '../domain/agentRuntime.js';
import { createAgentRuntimeClient } from '../integrations/agentRuntime.js';
import { createWorkspaceManager } from '../integrations/workspace.js';
import { withActivityHeartbeat } from './withActivityHeartbeat.js';

export async function runMergeConflictAgent(
  input: MergeConflictAgentRunInput,
): Promise<MergeConflictAgentExecution> {
  const config = loadRuntimeConfig();
  const workspaceManager = createWorkspaceManager({
    workspaceRoot: config.workspaceRoot,
    github: config.github,
    gitIdentity: config.gitIdentity,
  });

  const runtime = createAgentRuntimeClient({
    ai: config.ai,
    github: config.github,
    gitIdentity: config.gitIdentity,
    linear: config.linear,
    workspaceManager,
  });

  return await withActivityHeartbeat(
    'runMergeConflictAgent',
    async () => await runtime.runMergeConflictResolution(input),
  );
}
