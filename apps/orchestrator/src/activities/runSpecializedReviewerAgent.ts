import { loadRuntimeConfig } from '../config.js';
import type {
  SpecializedReviewerAgentRunInput,
  SpecializedReviewerExecution,
} from '../domain/agentRuntime.js';
import { createAgentRuntimeClient } from '../integrations/agentRuntime.js';
import { createWorkspaceManager } from '../integrations/workspace.js';

export async function runSpecializedReviewerAgent(
  input: SpecializedReviewerAgentRunInput,
): Promise<SpecializedReviewerExecution> {
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

  return await runtime.runSpecializedReviewer(input);
}
