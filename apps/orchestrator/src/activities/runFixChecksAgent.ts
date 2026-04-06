import { loadRuntimeConfig } from '../config';
import type {
  FixChecksAgentExecution,
  FixChecksAgentRunInput,
} from '../domain/agentRuntime';
import { createAgentRuntimeClient } from '../integrations/agentRuntime';
import { createWorkspaceManager } from '../integrations/workspace';

export async function runFixChecksAgent(
  input: FixChecksAgentRunInput,
): Promise<FixChecksAgentExecution> {
  const config = loadRuntimeConfig();
  const workspaceManager =
    config.workspaceRoot === null
      ? null
      : createWorkspaceManager({
          workspaceRoot: config.workspaceRoot,
          github: config.github,
        });

  const runtime = createAgentRuntimeClient({
    ai: config.ai,
    github: config.github,
    linear: config.linear,
    workspaceManager,
  });

  return await runtime.runFixChecksBatch(input);
}
