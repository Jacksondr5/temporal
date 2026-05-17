import { loadRuntimeConfig } from '../config.js';
import type {
  CodeRabbitAgentExecution,
  CodeRabbitAgentRunInput,
} from '../domain/agentRuntime.js';
import {
  CODEX_REFRESH_TOKEN_REUSED_MESSAGE,
  isCodexRefreshTokenReusedFailure,
} from '../domain/codexAuthErrors.js';
import { createAgentRuntimeClient } from '../integrations/agentRuntime.js';
import { createWorkspaceManager } from '../integrations/workspace.js';
import { withActivityHeartbeat } from './withActivityHeartbeat.js';

export async function runCodeRabbitAgent(
  input: CodeRabbitAgentRunInput,
): Promise<CodeRabbitAgentExecution> {
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

  return await withActivityHeartbeat('runCodeRabbitAgent', async () => {
    try {
      return await runtime.runCodeRabbitBatch(input);
    } catch (error) {
      if (isCodexRefreshTokenReusedFailure(error)) {
        console.warn(
          '[codex code-rabbit] Codex authentication failed because the mounted refresh token was already used. Re-authenticate Codex on the orchestrator host.',
        );
        throw new Error(CODEX_REFRESH_TOKEN_REUSED_MESSAGE);
      }

      throw error;
    }
  });
}
