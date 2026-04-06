import { loadRuntimeConfig } from '../config';
import type {
  SpecializedReviewerAgentRunInput,
  SpecializedReviewerExecution,
} from '../domain/agentRuntime';
import { createAgentRuntimeClient } from '../integrations/agentRuntime';
import { createWorkspaceManager } from '../integrations/workspace';

export async function runSpecializedReviewerAgent(
  input: SpecializedReviewerAgentRunInput,
): Promise<SpecializedReviewerExecution> {
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

  return await runtime.runSpecializedReviewer(input);
}
