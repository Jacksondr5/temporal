import { loadRuntimeConfig } from '../config.js';
import type {
  CodeRabbitAgentExecution,
  CodeRabbitAgentRunInput,
} from '../domain/agentRuntime.js';
import { createAgentRuntimeClient } from '../integrations/agentRuntime.js';
import { createWorkspaceManager } from '../integrations/workspace.js';

export async function runCodeRabbitAgent(
  input: CodeRabbitAgentRunInput,
): Promise<CodeRabbitAgentExecution> {
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

  return await runtime.runCodeRabbitBatch(input);
}
