import { loadRuntimeConfig } from '../config.js';
import type {
  MergeConflictAgentExecution,
  MergeConflictAgentRunInput,
} from '../domain/agentRuntime.js';
import { createAgentRuntimeClient } from '../integrations/agentRuntime.js';
import { createWorkspaceManager } from '../integrations/workspace.js';

export async function runMergeConflictAgent(
  input: MergeConflictAgentRunInput,
): Promise<MergeConflictAgentExecution> {
  const config = loadRuntimeConfig();
  const workspaceManager = createWorkspaceManager({
    workspaceRoot: config.workspaceRoot,
    github: config.github,
  });

  const runtime = createAgentRuntimeClient({
    ai: config.ai,
    github: config.github,
    linear: config.linear,
    workspaceManager,
  });

  return await runtime.runMergeConflictResolution(input);
}
